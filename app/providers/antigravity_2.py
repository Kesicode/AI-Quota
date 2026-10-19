from __future__ import annotations

import json
import ssl
import subprocess
import time
import urllib.request
from datetime import datetime, timezone
from typing import Any

from .base import ProviderAdapter, ProviderTruth
from ..services.account_service import (
    ensure_auto_discovered_account,
    list_accounts,
    update_account_telemetry,
)
from ..services.snapshot_service import record_snapshot
from ..utils.time import now_iso

_METADATA = {
    "metadata": {
        "ideName": "antigravity",
        "extensionName": "antigravity",
        "ideVersion": "unknown",
        "locale": "en",
    }
}

_PROBE_CACHE: dict[str, Any] = {"expires": 0.0, "payload": None, "error": None}


def _powershell_json(script: str) -> Any:
    proc = subprocess.run(
        ["powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
        capture_output=True,
        text=True,
        timeout=6,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or "PowerShell command failed")
    text = proc.stdout.strip()
    return json.loads(text) if text else None


def _discover_desktop_servers() -> list[dict[str, Any]]:
    servers: list[dict[str, Any]] = []
    # Primary: fast psutil inspection (<0.08s)
    try:
        import psutil
        import re

        for p in psutil.process_iter(["pid", "name", "cmdline"]):
            try:
                cmd = " ".join(p.info["cmdline"] or [])
                if not cmd:
                    continue
                cmd_lower = cmd.lower()
                if ("language_server" in cmd_lower or "language-server" in cmd_lower) and "antigravity" in cmd_lower:
                    csrf = None
                    m = re.search(r'--csrf_token(?:=|\s+)(?:"([^"]+)"|([^\s]+))', cmd, re.I)
                    if m:
                        csrf = m.group(1) or m.group(2)
                    ext_port = None
                    m2 = re.search(r'--extension_server_port(?:=|\s+)(\d+)', cmd, re.I)
                    if m2:
                        ext_port = int(m2.group(1))
                    servers.append({
                        "pid": p.info["pid"],
                        "command": cmd,
                        "csrf": csrf,
                        "extension_server_port": ext_port,
                    })
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        if servers:
            return servers
    except Exception:
        pass

    # Fallback: PowerShell if psutil is unavailable
    script = r'''
$items = Get-CimInstance Win32_Process |
  Where-Object {
    $_.CommandLine -and
    $_.CommandLine -match '(?i)language_server|language-server' -and
    $_.CommandLine -match '(?i)antigravity'
  } |
  ForEach-Object {
    $cmd = [string]$_.CommandLine
    $csrf = $null
    $m = [regex]::Match($cmd, '(?i)--csrf_token(?:=|\s+)(?:"([^"]+)"|([^\s]+))')
    if ($m.Success) { $csrf = if ($m.Groups[1].Success) { $m.Groups[1].Value } else { $m.Groups[2].Value } }
    $extPort = $null
    $m2 = [regex]::Match($cmd, '(?i)--extension_server_port(?:=|\s+)(\d+)')
    if ($m2.Success) { $extPort = [int]$m2.Groups[1].Value }
    [pscustomobject]@{ pid = [int]$_.ProcessId; command = $cmd; csrf = $csrf; extension_server_port = $extPort }
  }
@($items) | ConvertTo-Json -Depth 5 -Compress
'''
    try:
        data = _powershell_json(script)
        if data is None:
            return []
        if isinstance(data, dict):
            return [data]
        return list(data)
    except Exception:
        return []


def _listen_ports(pid: int) -> list[int]:
    # Primary: fast netstat (<0.1s)
    try:
        res = subprocess.run(["netstat", "-ano", "-p", "tcp"], capture_output=True, text=True, timeout=2.0)
        ports: list[int] = []
        target_pid = str(pid)
        for line in res.stdout.splitlines():
            parts = line.split()
            if len(parts) >= 5 and parts[0].upper() == "TCP" and parts[3].upper() == "LISTENING" and parts[4] == target_pid:
                addr, port_str = parts[1].rsplit(":", 1)
                try:
                    ports.append(int(port_str))
                except ValueError:
                    pass
        if ports:
            return list(set(ports))
    except Exception:
        pass

    # Fallback: PowerShell
    script = f"@(Get-NetTCPConnection -State Listen -OwningProcess {int(pid)} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalPort -Unique) | ConvertTo-Json -Compress"
    try:
        data = _powershell_json(script)
    except Exception:
        return []
    if data is None:
        return []
    if isinstance(data, int):
        return [data]
    return [int(x) for x in data]


def _post_local(port: int, path: str, csrf: str | None, use_https: bool = True, timeout: float = 2.5) -> dict[str, Any]:
    scheme = "https" if use_https else "http"
    url = f"{scheme}://127.0.0.1:{int(port)}{path}"
    body = json.dumps(_METADATA, separators=(",", ":")).encode("utf-8")
    headers = {"Content-Type": "application/json", "Connect-Protocol-Version": "1"}
    if csrf:
        headers["X-Codeium-Csrf-Token"] = csrf
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    context = ssl._create_unverified_context() if use_https else None
    with urllib.request.urlopen(req, timeout=timeout, context=context) as response:
        raw = response.read().decode("utf-8", errors="replace")
        return json.loads(raw) if raw.strip() else {}


def _unwrap(value: Any) -> Any:
    if isinstance(value, dict):
        for key in ("response", "data", "result"):
            nested = value.get(key)
            if isinstance(nested, (dict, list)):
                return nested
    return value


def _find_value(value: Any, keys: tuple[str, ...]) -> Any:
    if isinstance(value, dict):
        for key in keys:
            if key in value:
                return value[key]
        for child in value.values():
            found = _find_value(child, keys)
            if found is not None:
                return found
    elif isinstance(value, list):
        for child in value:
            found = _find_value(child, keys)
            if found is not None:
                return found
    return None


def _fraction(bucket: dict[str, Any]) -> float | None:
    candidates = [bucket.get("remainingFraction"), bucket.get("remaining_fraction")]
    remaining = bucket.get("remaining")
    if isinstance(remaining, dict):
        candidates.extend([remaining.get("remainingFraction"), remaining.get("remaining_fraction")])
    for candidate in candidates:
        if candidate is None:
            continue
        try:
            value = float(candidate)
            if value > 1:
                value /= 100.0
            return max(0.0, min(1.0, value))
        except (TypeError, ValueError):
            pass
    return None


def _reset_time(bucket: dict[str, Any]) -> str | None:
    sources = [bucket]
    if isinstance(bucket.get("remaining"), dict):
        sources.append(bucket["remaining"])
    for source in sources:
        for key in ("resetTime", "reset_time", "resetAt", "reset_at"):
            value = source.get(key)
            if isinstance(value, str) and value:
                return value
            if isinstance(value, (int, float)):
                return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(float(value)))
    return None


def _bucket_window(bucket: dict[str, Any]) -> str:
    text = " ".join(
        str(bucket.get(key, ""))
        for key in ("bucketId", "bucket_id", "displayName", "display_name", "id", "window", "name")
    ).lower()
    if any(x in text for x in ("weekly", "week", "7d", "seven-day")):
        return "Weekly Limit"
    if any(x in text for x in ("5h", "5-hour", "five-hour", "session", "hourly")):
        return "Five Hour Limit"
    if "daily" in text or "day" in text:
        return "Daily Limit"
    return str(bucket.get("displayName") or bucket.get("display_name") or bucket.get("bucketId") or bucket.get("id") or "Quota")


def _group_name(value: Any) -> str:
    text = str(value or "").lower()
    if "gemini" in text:
        return "Gemini Models"
    if "claude" in text or "gpt" in text or "third" in text:
        return "Claude and GPT models"
    return str(value or "Antigravity Models")


def _parse_summary(raw: dict[str, Any]) -> list[dict[str, Any]]:
    root = _unwrap(raw)
    groups = _find_value(root, ("groups",))
    if not isinstance(groups, list):
        return []
    out: list[dict[str, Any]] = []
    for group in groups:
        if not isinstance(group, dict):
            continue
        grp_name = _group_name(group.get("displayName") or group.get("display_name") or group.get("name"))
        buckets = group.get("buckets")
        if not isinstance(buckets, list):
            continue
        for bucket in buckets:
            if not isinstance(bucket, dict):
                continue
            frac = _fraction(bucket)
            reset_at = _reset_time(bucket)
            if frac is None and reset_at is None:
                continue
            out.append({
                "group": grp_name,
                "window_name": _bucket_window(bucket),
                "remaining_fraction": frac,
                "reset_at": reset_at,
                "description": bucket.get("description"),
            })
    return out


def _parse_user_status(raw: dict[str, Any]) -> tuple[str | None, str | None, list[dict[str, Any]]]:
    root = _unwrap(raw)
    email = _find_value(root, ("accountEmail", "email", "account_email"))
    plan = _find_value(root, ("planName", "plan_name"))
    configs = _find_value(root, ("clientModelConfigs",))
    rows: list[dict[str, Any]] = []
    if isinstance(configs, list):
        for item in configs:
            if not isinstance(item, dict):
                continue
            name = item.get("label") or item.get("displayName") or item.get("model") or item.get("modelId")
            quota = item.get("quotaInfo") or {}
            if not isinstance(quota, dict):
                continue
            frac = _fraction(quota)
            reset_at = _reset_time(quota)
            if frac is None and reset_at is None:
                continue
            rows.append({
                "group": _group_name(name),
                "window_name": "Model Quota",
                "model": str(name or "Unknown Model"),
                "remaining_fraction": frac,
                "reset_at": reset_at,
            })
    return (str(email) if email else None, str(plan) if plan else None, rows)


_WORKING_ENDPOINT: dict[str, Any] = {
    "pid": None,
    "port": None,
    "csrf": None,
    "secure": True,
}


def _fetch_summary(port: int, csrf: str | None, secure: bool) -> dict[str, Any] | None:
    summary: dict[str, Any] | None = None
    for endpoint in ("RetrieveUserQuotaSummary", "GetUserStatus"):
        try:
            raw = _post_local(port, f"/exa.language_server_pb.LanguageServerService/{endpoint}", csrf, secure, timeout=2.5)
            if endpoint == "RetrieveUserQuotaSummary":
                windows = _parse_summary(raw)
                if windows:
                    summary = {"raw": raw, "windows": windows}
                    break
            else:
                email, plan, rows = _parse_user_status(raw)
                if rows or email:
                    summary = {"raw": raw, "windows": rows, "email": email, "plan_tier": plan}
                    break
        except Exception:
            continue

    if summary and not summary.get("email"):
        for sec in (secure, not secure):
            try:
                raw_status = _post_local(port, "/exa.language_server_pb.LanguageServerService/GetUserStatus", csrf, sec, timeout=2.0)
                email, plan, _ = _parse_user_status(raw_status)
                if email:
                    summary["email"] = email
                    summary["plan_tier"] = summary.get("plan_tier") or plan
                    break
            except Exception:
                continue

    return summary


def probe_antigravity_2() -> dict[str, Any]:
    now = time.time()
    if _PROBE_CACHE["expires"] > now:
        return _PROBE_CACHE["payload"] or {"ok": False, "error": _PROBE_CACHE["error"] or "cached probe failure"}

    # ── Fast path: test previously verified working endpoint first ──────────
    cached_port = _WORKING_ENDPOINT.get("port")
    if cached_port:
        try:
            c_csrf = _WORKING_ENDPOINT.get("csrf")
            c_sec = bool(_WORKING_ENDPOINT.get("secure", True))
            _post_local(int(cached_port), "/exa.language_server_pb.LanguageServerService/GetUnleashData", c_csrf, c_sec, timeout=1.5)
            summary = _fetch_summary(int(cached_port), c_csrf, c_sec)
            if summary and summary.get("email"):
                summary["ok"] = True
                summary["captured_at"] = time.time()
                summary["source"] = "antigravity-2.0-local-language-server"
                _PROBE_CACHE.update({"expires": now + 5.0, "payload": summary, "error": None})
                return summary
        except Exception:
            _WORKING_ENDPOINT.update({"pid": None, "port": None, "csrf": None})

    last_error = "Antigravity 2.0 local quota service not found"
    try:
        servers = _discover_desktop_servers()
        for server in servers:
            csrf = server.get("csrf")
            ports: list[int] = []
            if server.get("extension_server_port"):
                ports.append(int(server["extension_server_port"]))
            ports.extend(_listen_ports(int(server["pid"])))
            seen: set[int] = set()
            for port in ports:
                if port in seen:
                    continue
                seen.add(port)
                ready = False
                matched_sec = True
                for secure in (True, False):
                    try:
                        _post_local(port, "/exa.language_server_pb.LanguageServerService/GetUnleashData", csrf, secure, timeout=1.5)
                        ready = True
                        matched_sec = secure
                        break
                    except Exception as exc:
                        last_error = str(exc)
                if not ready:
                    continue

                summary = _fetch_summary(port, csrf, matched_sec)
                if summary:
                    summary["ok"] = bool(summary.get("email"))
                    summary["captured_at"] = time.time()
                    summary["source"] = "antigravity-2.0-local-language-server"
                    if summary["ok"]:
                        _WORKING_ENDPOINT.update({"pid": server.get("pid"), "port": port, "csrf": csrf, "secure": matched_sec})
                        _PROBE_CACHE.update({"expires": now + 5.0, "payload": summary, "error": None})
                        return summary
        raise RuntimeError(last_error)
    except Exception as exc:
        _PROBE_CACHE.update({"expires": now + 3.0, "payload": None, "error": str(exc)})
        return {"ok": False, "error": str(exc), "source": "antigravity-2.0-local-language-server"}


class Antigravity2Adapter(ProviderAdapter):
    """
    Adapter for Antigravity 2.0 Desktop / Local Language Server.
    Communicates directly with the local language server via JSON-RPC.
    """

    @property
    def id(self) -> str:
        return "antigravity_2"

    @property
    def display_name(self) -> str:
        return "Antigravity 2.0"

    @property
    def supported_clients(self) -> list[str]:
        return ["Antigravity 2.0", "Antigravity Desktop"]

    @property
    def truth(self) -> ProviderTruth:
        return ProviderTruth(
            key="antigravity_2",
            label="Antigravity 2.0",
            priority=85,
            live=True,
            truth="provider-local",
            authority_type="local_language_server",
            note="Reads live quota summary and user status from the local Antigravity 2.0 language server.",
            source_description="Local Language Server RPC (RetrieveUserQuotaSummary / GetUserStatus)",
        )

    def sync(self) -> dict[str, Any]:
        probe_result = probe_antigravity_2()
        if not probe_result.get("ok"):
            # If service is not running, update registered Antigravity 2.0 accounts to stale/unavailable
            # without wiping last-known data.
            registered = [
                a for a in list_accounts()
                if self.can_handle(a.get("provider", ""), a.get("client", ""))
            ]
            for a in registered:
                if a.get("status") == "live":
                    update_account_telemetry(a["id"], status="stale", last_error=probe_result.get("error"))
            return {
                "ok": False,
                "changed": 0,
                "matched": 0,
                "discovered": 0,
                "error": probe_result.get("error", "Antigravity 2.0 service unavailable"),
            }

        email = str(probe_result.get("email") or "").strip().lower()
        if not email:
            return {"ok": False, "changed": 0, "matched": 0, "discovered": 0, "error": "No account email reported"}

        account = ensure_auto_discovered_account(
            email=email,
            provider="Antigravity",
            client="Antigravity 2.0",
            display_name=email,
            plan_tier=probe_result.get("plan_tier"),
        )
        if not account:
            return {"ok": False, "changed": 0, "matched": 0, "discovered": 0, "error": "Account is in ignore list"}

        # Auto-vault active credential in OS vault so this account can be switched back to instantly
        try:
            from packages.security.credential_manager import get_credential_manager
            cm = get_credential_manager()
            acc_id = account.get("account_id") or str(account["id"])
            cm.capture_active_antigravity_credential(acc_id, expected_email=email)
        except Exception:
            pass

        captured = datetime.fromtimestamp(
            float(probe_result.get("captured_at") or time.time()), timezone.utc
        ).isoformat()
        windows = probe_result.get("windows") or []

        # Determine status: exhausted if max remaining is 0, else live
        fractions = [
            float(w["remaining_fraction"]) * 100
            for w in windows
            if w.get("remaining_fraction") is not None
        ]
        status = "exhausted" if (fractions and max(fractions) <= 0) else "live"

        update_account_telemetry(
            account["id"],
            status=status,
            plan_tier=probe_result.get("plan_tier"),
            last_seen_at=captured,
            last_error=None,
        )

        changed = 0
        for item in windows:
            frac = item.get("remaining_fraction")
            pct = None if frac is None else max(0.0, min(100.0, float(frac) * 100.0))
            model = str(item.get("model") or item.get("group") or "Antigravity")
            window = str(item.get("window_name") or "Quota")
            record_snapshot(
                account_id=account["id"],
                service="Antigravity",
                client="Antigravity 2.0",
                model=model,
                window_name=window,
                remaining_percent=pct,
                unit="provider quota",
                reset_at=item.get("reset_at"),
                source="antigravity-2.0-local-language-server",
                captured_at=captured,
            )
            changed += 1

        return {
            "ok": True,
            "changed": changed,
            "matched": 1,
            "discovered": 1 if account.get("source_kind") == "auto_discovered" else 0,
            "email": email,
            "plan_tier": probe_result.get("plan_tier"),
        }

    def connect_account(self, account: dict[str, Any]) -> dict[str, Any]:
        # Invalidate probe and endpoint caches so we always get a fresh read after a switch.
        _PROBE_CACHE["expires"] = 0.0
        _WORKING_ENDPOINT.update({"pid": None, "port": None, "csrf": None})
        result = probe_antigravity_2()
        if result.get("ok"):
            active_email = str(result.get("email") or "").strip().lower()
            target_email = account.get("email", "").strip().lower()
            if active_email == target_email:
                return {
                    "ok": True,
                    "mode": "antigravity_2_0_local",
                    "message": "Connected to Antigravity 2.0 local quota service. Live quota summary is active.",
                    **result,
                }
            return {
                "ok": False,
                "mode": "wrong_active_account",
                "message": (
                    f"Antigravity 2.0 is currently signed in as {active_email}, "
                    f"while this registered account is {target_email}. "
                    "Switch accounts in Antigravity 2.0, then press Sync now."
                ),
                **result,
            }
        return {
            "ok": False,
            "mode": "antigravity_2_0_unavailable",
            "message": (
                "Could not find a live Antigravity 2.0 local quota service. "
                "Keep Antigravity 2.0 open and signed in, then press Sync now."
            ),
            "error": result.get("error"),
        }

    def capabilities(self) -> Any:
        import platform
        from packages.core.models import ProviderCapabilities, SwitchMethod
        is_win = platform.system() == "Windows"
        return ProviderCapabilities(
            supports_quota=True,
            supports_usage=True,
            supports_account_detection=True,
            supports_account_switching=True,
            supports_instant_switch=is_win,
            supports_credential_vault=True,
            supports_history=True,
            supports_realtime=True,
            switch_method=SwitchMethod.INSTANT if is_win else SwitchMethod.ASSISTED,
            switch_requires_restart=False,
            switch_cooldown_seconds=30,
            switch_max_per_hour=10,
        )

    def get_current_account(self) -> Any:
        from packages.core.models import AccountIdentity
        probe = probe_antigravity_2()
        if probe.get("ok") and probe.get("email"):
            email = str(probe["email"]).strip().lower()
            return AccountIdentity(
                account_id=email,
                identity_key=email,
                provider="Antigravity",
                client="Antigravity 2.0",
                display_name=email,
            )
        return None

    def switch_account(self, account_id: str, *, force: bool = False) -> Any:
        from providers.antigravity.switcher import AntigravitySwitcher
        from packages.security.credential_manager import get_credential_manager
        switcher = AntigravitySwitcher(None, get_credential_manager())
        return switcher.switch(account_id)

