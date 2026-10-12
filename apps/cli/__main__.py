"""
apps/cli/__main__.py

AI-Quota CLI — terminal interface for headless environments.

Commands:
  status          Show current quota status for all accounts
  accounts        List accounts
  switch <id>     Switch to account by ID
  sync            Trigger a sync
  export [--csv]  Export quota history (default: JSON)
  providers       List registered providers and their capabilities
  diagnostics     Show backend diagnostics

Usage:
  python -m apps.cli status
  python -m apps.cli switch 3
  python -m apps.cli export --csv --period 7d > history.csv
"""
from __future__ import annotations

import argparse
import json
import sys
from typing import Any

try:
    import httpx
except ImportError:
    print("AI-Quota CLI requires httpx.\npip install httpx", file=sys.stderr)
    sys.exit(1)

AGENT_BASE = "http://127.0.0.1:8765"
TIMEOUT = 8.0


# ── HTTP helpers ──────────────────────────────────────────────────────────

def _get(path: str, raw: bool = False):
    try:
        r = httpx.get(f"{AGENT_BASE}{path}", timeout=TIMEOUT)
        r.raise_for_status()
        return r.text if raw else r.json()
    except httpx.ConnectError:
        _die("Agent not running. Start it with:  run.bat  or  python -m app.main")
    except httpx.HTTPStatusError as e:
        _die(f"HTTP {e.response.status_code}: {e.response.text[:200]}")


def _post(path: str) -> dict:
    try:
        r = httpx.post(f"{AGENT_BASE}{path}", timeout=TIMEOUT)
        r.raise_for_status()
        return r.json()
    except httpx.ConnectError:
        _die("Agent not running.")
    except httpx.HTTPStatusError as e:
        _die(f"HTTP {e.response.status_code}: {e.response.text[:200]}")


def _die(msg: str, code: int = 1) -> None:
    print(f"\033[31m[ERROR]\033[0m {msg}", file=sys.stderr)
    sys.exit(code)


# ── Formatting helpers ─────────────────────────────────────────────────────

_STATUS_COLOR = {
    "live":          "\033[32m",   # green
    "stale":         "\033[33m",   # amber
    "not_connected": "\033[90m",   # grey
    "exhausted":     "\033[31m",   # red
}
_RESET = "\033[0m"
_BOLD  = "\033[1m"
_DIM   = "\033[2m"


def _pct_bar(pct: float | None, width: int = 20) -> str:
    if pct is None:
        return " " * width + "  —  "
    filled = round(pct / 100 * width)
    bar = "█" * filled + "░" * (width - filled)
    color = "\033[32m" if pct >= 40 else ("\033[33m" if pct >= 10 else "\033[31m")
    return f"{color}{bar}{_RESET} {pct:5.1f}%"


def _status_badge(status: str) -> str:
    color = _STATUS_COLOR.get(status, "")
    icon  = {"live": "●", "stale": "◐", "not_connected": "○", "exhausted": "✗"}.get(status, "?")
    return f"{color}{icon} {status}{_RESET}"


# ── Commands ──────────────────────────────────────────────────────────────

def cmd_status(args: argparse.Namespace) -> None:
    data = _get("/api/dashboard")
    accounts: list[dict] = data.get("accounts", [])
    summary: dict = data.get("summary", {})

    print(f"\n{_BOLD}AI-Quota — Status{_RESET}")
    print(f"  Accounts: {summary.get('accounts', 0)}  "
          f"\033[32mlive:{summary.get('live', 0)}\033[0m  "
          f"\033[33mstale:{summary.get('stale', 0)}\033[0m  "
          f"\033[90mnot_connected:{summary.get('not_connected', 0)}\033[0m\n")

    if not accounts:
        print("  No accounts registered. Add one in the dashboard.")
        return

    hdr = f"  {'ID':>3}  {'Account':<28}  {'Provider':<16}  {'Quota':^27}  Status"
    print(hdr)
    print("  " + "─" * 95)

    for acc in accounts:
        acc_id   = acc.get("id", "?")
        name     = (acc.get("display_name") or acc.get("email") or "—")[:27]
        provider = (acc.get("provider") or "—")[:15]
        pct      = acc.get("best_remaining")
        status   = acc.get("status", "—")
        bar      = _pct_bar(pct)
        badge    = _status_badge(status)
        print(f"  {acc_id:>3}  {name:<28}  {provider:<16}  {bar}  {badge}")

    best_id = summary.get("best_account_id")
    if best_id:
        best = next((a for a in accounts if a["id"] == best_id), None)
        if best:
            name = best.get("display_name") or best.get("email") or f"ID {best_id}"
            print(f"\n  {_BOLD}Recommended:{_RESET} {name} (ID {best_id})")
    print()


def cmd_accounts(args: argparse.Namespace) -> None:
    accounts = _get("/api/accounts")
    print(f"\n{_BOLD}Accounts ({len(accounts)}){_RESET}")
    for acc in accounts:
        acc_id   = acc.get("id")
        name     = acc.get("display_name") or acc.get("email") or "—"
        provider = acc.get("provider") or "—"
        client   = acc.get("client") or "—"
        status   = acc.get("status") or "—"
        print(f"  [{acc_id}] {name}  •  {provider}/{client}  •  {_status_badge(status)}")
    print()


def cmd_switch(args: argparse.Namespace) -> None:
    acc_id = args.account_id
    print(f"Switching to account {acc_id}…")
    result = _post(f"/api/v1/accounts/{acc_id}/switch")
    status = result.get("status", "unknown")
    verified = result.get("verified", False)
    method = result.get("method_used", "—")
    color = "\033[32m" if verified else "\033[33m"
    print(f"{color}  Status:    {status}{_RESET}")
    print(f"  Method:    {method}")
    print(f"  Verified:  {verified}")
    if result.get("message"):
        print(f"  Message:   {result['message']}")


def cmd_sync(args: argparse.Namespace) -> None:
    print("Syncing all providers…")
    result = _post("/api/v1/sync")
    ok = result.get("ok", False)
    color = "\033[32m" if ok else "\033[31m"
    print(f"{color}  OK:        {ok}{_RESET}")
    print(f"  Changed:   {result.get('changed', 0)}")
    print(f"  Matched:   {result.get('matched', 0)}")
    if result.get("message"):
        print(f"  Message:   {result['message']}")


def cmd_export(args: argparse.Namespace) -> None:
    period = getattr(args, "period", "7d")
    fmt = "csv" if args.csv else "json"
    raw = fmt == "csv"
    data = _get(f"/api/v1/history?period={period}&format={fmt}", raw=raw)
    if raw:
        print(data, end="")
    else:
        print(json.dumps(data, indent=2))


def cmd_providers(args: argparse.Namespace) -> None:
    providers = _get("/api/v1/providers")
    print(f"\n{_BOLD}Registered Providers ({len(providers)}){_RESET}\n")
    for p in providers:
        caps = p.get("capabilities") or {}
        truth = p.get("truth") or {}
        print(f"  {_BOLD}{p['display_name']}{_RESET} ({p['id']})")
        print(f"    Authority: {truth.get('authority_type', '—')}  |  "
              f"Live: {truth.get('live', False)}")
        supported = [k.replace("supports_", "") for k, v in caps.items() if v is True]
        if supported:
            print(f"    Supports:  {', '.join(supported)}")
        if truth.get("note"):
            print(f"    {_DIM}Note: {truth['note']}{_RESET}")
        print()


def cmd_diagnostics(args: argparse.Namespace) -> None:
    data = _get("/api/v1/diagnostics")
    print(f"\n{_BOLD}Diagnostics{_RESET}")
    print(f"  Version:    {data.get('agent_version', '—')}")
    print(f"  DB size:    {data.get('db_size_bytes', 0):,} bytes")
    print(f"  Providers:  {data.get('providers', {}).get('total', '—')}")
    print(f"  Generated:  {data.get('generated_at', '—')}")
    settings = data.get("settings", {})
    if settings:
        print(f"\n  {_BOLD}Settings{_RESET}")
        for k, v in settings.items():
            print(f"    {k}: {v}")
    print()


# ── Argument parser ───────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        prog="python -m apps.cli",
        description="AI-Quota CLI — terminal interface",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("status",      help="Show quota status for all accounts")
    sub.add_parser("accounts",    help="List all accounts")
    sub.add_parser("sync",        help="Trigger a sync of all providers")
    sub.add_parser("providers",   help="List registered providers and capabilities")
    sub.add_parser("diagnostics", help="Show backend diagnostics")

    sw = sub.add_parser("switch", help="Switch to an account by ID")
    sw.add_argument("account_id", type=int, help="Account ID to switch to")

    ex = sub.add_parser("export", help="Export quota history")
    ex.add_argument("--period", default="7d", choices=["24h", "7d", "30d"],
                    help="Time window (default: 7d)")
    ex.add_argument("--csv", action="store_true", help="Output as CSV instead of JSON")

    args = parser.parse_args()
    dispatch = {
        "status":      cmd_status,
        "accounts":    cmd_accounts,
        "switch":      cmd_switch,
        "sync":        cmd_sync,
        "export":      cmd_export,
        "providers":   cmd_providers,
        "diagnostics": cmd_diagnostics,
    }
    dispatch[args.command](args)


if __name__ == "__main__":
    main()
