from __future__ import annotations

import json
import re
import ssl
import subprocess
import time
import urllib.error
import urllib.request
from typing import Any


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
    script = r'''
$items = Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -and $_.CommandLine -match '(?i)language_server|language-server' -and $_.CommandLine -match '(?i)antigravity' -and $_.CommandLine -match '(?i)--app_data_dir\s+antigravity(?:\s|$)' } |
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
    data = _powershell_json(script)
    if data is None:
        return []
    if isinstance(data, dict):
        return [data]
    return list(data)


def _listen_ports(pid: int) -> list[int]:
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
    headers = {
        "Content-Type": "application/json",
        "Connect-Protocol-Version": "1",
    }
    if csrf:
        headers["X-Codeium-Csrf-Token"] = csrf
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    context = ssl._create_unverified_context() if use_https else None
    with urllib.request.urlopen(req, timeout=timeout, context=context) as response:
        raw = response.read().decode("utf-8", errors="replace")
        if not raw.strip():
            return {}
        return json.loads(raw)


def _unwrap(value: Any) -> Any:
    if isinstance(value, dict):
        for key in ("response", "data", "result"):
            nested = value.get(key)
            if isinstance(nested, (dict, list)):
                return nested
    return value


def _first_dict_with_key(value: Any, key: str) -> dict[str, Any] | None:
    if isinstance(value, dict):
        if key in value and isinstance(value[key], dict):
            return value
        for child in value.values():
            found = _first_dict_with_key(child, key)
            if found:
                return found
    elif isinstance(value, list):
        for child in value:
            found = _first_dict_with_key(child, key)
            if found:
                return found
    return None


def _recursive_get(value: Any, keys: tuple[str, ...]) -> Any:
    if isinstance(value, dict):
        for key in keys:
            if key in value:
                return value[key]
        for child in value.values():
            found = _recursive_get(child, keys)
            if found is not None:
                return found
    elif isinstance(value, list):
        for child in value:
            found = _recursive_get(child, keys)
            if found is not None:
                return found
    return None


def _fraction(bucket: dict[str, Any]) -> float | None:
    candidates = [
        bucket.get("remainingFraction"),
        bucket.get("remaining_fraction"),
    ]
    remaining = bucket.get("remaining")
    if isinstance(remaining, dict):
        candidates.extend([remaining.get("remainingFraction"), remaining.get("remaining_fraction")])
    for candidate in candidates:
        if candidate is not None:
            try:
                value = float(candidate)
                if value > 1:
                    value /= 100.0
                return max(0.0, min(1.0, value))
            except (TypeError, ValueError):
                pass
    return None


def _reset_time(bucket: dict[str, Any]) -> str | None:
    for source in (bucket, bucket.get("remaining") if isinstance(bucket.get("remaining"), dict) else {}):
        for key in ("resetTime", "reset_time", "resetAt", "reset_at"):
            value = source.get(key)
            if isinstance(value, str) and value:
                return value
            if isinstance(value, (int, float)):
                return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(float(value)))
    return None


def _bucket_window(bucket: dict[str, Any]) -> str:
    text = " ".join(str(bucket.get(key, "")) for key in ("bucketId", "bucket_id", "displayName", "display_name", "id", "window", "name")).lower()
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
    groups = _recursive_get(root, ("groups",))
    if not isinstance(groups, list):
        return []
    out: list[dict[str, Any]] = []
    for group in groups:
        if not isinstance(group, dict):
            continue
        group_name = _group_name(group.get("displayName") or group.get("display_name") or group.get("name"))
        buckets = group.get("buckets")
        if not isinstance(buckets, list):
            continue
        for bucket in buckets:
            if not isinstance(bucket, dict):
                continue
            frac = _fraction(bucket)
            reset_at = _reset_time(bucket)
            out.append({
                "group": group_name,
                "window_name": _bucket_window(bucket),
                "remaining_fraction": frac,
                "reset_at": reset_at,
                "description": bucket.get("description"),
            })
    return out


def _parse_user_status(raw: dict[str, Any]) -> tuple[str | None, str | None, list[dict[str, Any]]]:
    root = _unwrap(raw)
    email = _recursive_get(root, ("accountEmail", "email", "account_email"))
    plan = _recursive_get(root, ("planName", "plan_name"))
    configs = _recursive_get(root, ("clientModelConfigs",))
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
            family = _group_name(name)
            rows.append({"group": family, "window_name": "Model Quota", "model": str(name or "Unknown Model"), "remaining_fraction": frac, "reset_at": reset_at})
    return (str(email) if email else None, str(plan) if plan else None, rows)


def probe_antigravity_2() -> dict[str, Any]:
    now = time.time()
    if _PROBE_CACHE["expires"] > now:
        return _PROBE_CACHE["payload"] or {"ok": False, "error": _PROBE_CACHE["error"] or "cached probe failure"}
    last_error = "Antigravity 2.0 local quota service not found"
    try:
        servers = _discover_desktop_servers()
        for server in servers:
            csrf = server.get("csrf")
            ports = []
            if server.get("extension_server_port"):
                ports.append(int(server["extension_server_port"]))
            ports.extend(_listen_ports(int(server["pid"])))
            seen: set[int] = set()
            for port in ports:
                if port in seen:
                    continue
                seen.add(port)
                try:
                    _post_local(port, "/exa.language_server_pb.LanguageServerService/GetUnleashData", csrf, True)
                except Exception:
                    try:
                        _post_local(port, "/exa.language_server_pb.LanguageServerService/GetUnleashData", csrf, False)
                    except Exception:
                        continue
                summary = None
                for endpoint in ("RetrieveUserQuotaSummary", "GetUserStatus"):
                    try:
                        raw = _post_local(port, f"/exa.language_server_pb.LanguageServerService/{endpoint}", csrf, True)
                    except Exception:
                        try:
                            raw = _post_local(port, f"/exa.language_server_pb.LanguageServerService/{endpoint}", csrf, False)
                        except Exception as exc:
                            last_error = f"{endpoint}: {exc}"
                            continue
                    if endpoint == "RetrieveUserQuotaSummary":
                        parsed = _parse_summary(raw)
                        if parsed:
                            summary = {"raw": raw, "windows": parsed}
                            break
                    else:
                        email, plan, rows = _parse_user_status(raw)
                        if rows or email:
                            summary = {"raw": raw, "windows": rows, "email": email, "plan_tier": plan}
                            break
                if summary:
                    status = summary
                    if not status.get("email"):
                        try:
                            raw_status = _post_local(port, "/exa.language_server_pb.LanguageServerService/GetUserStatus", csrf, True)
                            email, plan, _ = _parse_user_status(raw_status)
                            status["email"] = email
                            status["plan_tier"] = plan
                        except Exception:
                            pass
                    status["ok"] = True
                    status["captured_at"] = time.time()
                    status["source"] = "antigravity-2.0-local-language-server"
                    _PROBE_CACHE.update({"expires": now + 5.0, "payload": status, "error": None})
                    return status
        raise RuntimeError(last_error)
    except Exception as exc:
        _PROBE_CACHE.update({"expires": now + 3.0, "payload": None, "error": str(exc)})
        return {"ok": False, "error": str(exc), "source": "antigravity-2.0-local-language-server"}
