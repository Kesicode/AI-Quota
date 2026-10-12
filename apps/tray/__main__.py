"""
apps/tray/__main__.py

AI-Quota System Tray Agent.
Provides a native system tray icon with:
  - Current quota status badge (color-coded: green/amber/red)
  - Quick account switcher menu
  - Open dashboard shortcut
  - Sync now action
  - Quit

Usage:
  python -m apps.tray
  # or via run.bat / run.sh tray mode
"""
from __future__ import annotations

import sys
import threading
import time
import webbrowser
from pathlib import Path
from typing import Optional

# ── Dependency guard ──────────────────────────────────────────────────────
try:
    import pystray
    from PIL import Image, ImageDraw
except ImportError:
    print(
        "AI-Quota Tray requires pystray and Pillow.\n"
        "Install with:  pip install pystray Pillow\n",
        file=sys.stderr,
    )
    sys.exit(1)

try:
    import httpx
except ImportError:
    print("AI-Quota Tray requires httpx.\npip install httpx", file=sys.stderr)
    sys.exit(1)

# ── Configuration ─────────────────────────────────────────────────────────
AGENT_BASE = "http://127.0.0.1:8765"
POLL_INTERVAL = 30   # seconds between background refreshes
APP_NAME = "AI-Quota"
ICON_SIZE = (64, 64)


# ── Icon generation ───────────────────────────────────────────────────────

def _make_icon(color: str = "#4fa84f", letter: str = "Q") -> Image.Image:
    """
    Generate a simple tray icon: filled circle in `color` with a centred letter.
    Colors:
      green  #4fa84f  — quota healthy (>40%)
      amber  #f5a623  — quota low (10-40%)
      red    #e74c3c  — quota critical (<10%) or error
      grey   #555555  — not connected / unknown
    """
    img = Image.new("RGBA", ICON_SIZE, (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    margin = 4
    draw.ellipse(
        [margin, margin, ICON_SIZE[0] - margin, ICON_SIZE[1] - margin],
        fill=color,
    )
    # Centre the letter  (PIL default font is tiny but always available)
    bbox = draw.textbbox((0, 0), letter)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (ICON_SIZE[0] - tw) // 2
    y = (ICON_SIZE[1] - th) // 2
    draw.text((x, y), letter, fill="white")
    return img


def _color_for_remaining(pct: Optional[float]) -> str:
    if pct is None:
        return "#555555"
    if pct >= 40:
        return "#4fa84f"
    if pct >= 10:
        return "#f5a623"
    return "#e74c3c"


# ── API client helpers ────────────────────────────────────────────────────

def _get(path: str, timeout: float = 4.0) -> dict | list | None:
    try:
        r = httpx.get(f"{AGENT_BASE}{path}", timeout=timeout)
        r.raise_for_status()
        return r.json()
    except Exception:
        return None


def _post(path: str, timeout: float = 6.0) -> dict | None:
    try:
        r = httpx.post(f"{AGENT_BASE}{path}", timeout=timeout)
        r.raise_for_status()
        return r.json()
    except Exception:
        return None


# ── State ─────────────────────────────────────────────────────────────────

class TrayState:
    def __init__(self) -> None:
        self.accounts: list[dict] = []
        self.best_remaining: Optional[float] = None
        self.best_account_name: str = "—"
        self.agent_online: bool = False
        self._lock = threading.Lock()

    def refresh(self) -> None:
        data = _get("/api/dashboard")
        with self._lock:
            if data is None:
                self.agent_online = False
                self.accounts = []
                self.best_remaining = None
                self.best_account_name = "offline"
                return

            self.agent_online = True
            self.accounts = data.get("accounts", [])
            summary = data.get("summary", {})
            best_id = summary.get("best_account_id")

            best = next((a for a in self.accounts if a["id"] == best_id), None)
            if best:
                self.best_remaining = best.get("best_remaining")
                self.best_account_name = best.get("display_name") or best.get("email") or "—"
            else:
                self.best_remaining = None
                self.best_account_name = "—"

    def snapshot(self) -> tuple[list[dict], Optional[float], str, bool]:
        with self._lock:
            return (
                list(self.accounts),
                self.best_remaining,
                self.best_account_name,
                self.agent_online,
            )


state = TrayState()


# ── Menu builders ─────────────────────────────────────────────────────────

def _open_dashboard(_icon: pystray.Icon, _item: pystray.MenuItem) -> None:
    webbrowser.open(f"{AGENT_BASE}/")


def _sync_now(icon: pystray.Icon, _item: pystray.MenuItem) -> None:
    icon.notify("Syncing…", APP_NAME)
    result = _post("/api/sync")
    if result and result.get("ok"):
        state.refresh()
        _update_icon(icon)
        icon.notify("Sync complete.", APP_NAME)
    else:
        icon.notify("Sync failed — is the agent running?", APP_NAME)


def _switch_account(account_id: int, icon: pystray.Icon) -> None:
    icon.notify("Switching account…", APP_NAME)
    result = _post(f"/api/v1/accounts/{account_id}/switch")
    if result:
        status = result.get("status", "unknown")
        icon.notify(f"Switch: {status}", APP_NAME)
        state.refresh()
        _update_icon(icon)
    else:
        icon.notify("Switch failed — provider may not support instant switch.", APP_NAME)


def _quit(icon: pystray.Icon, _item: pystray.MenuItem) -> None:
    icon.stop()


def _build_menu(accounts: list[dict], best_remaining: Optional[float],
                best_name: str, online: bool) -> pystray.Menu:
    items: list[pystray.MenuItem] = []

    if not online:
        items.append(pystray.MenuItem("⚠ Agent offline", None, enabled=False))
        items.append(pystray.Menu.SEPARATOR)
    else:
        # Status header
        pct_str = f"{best_remaining:.0f}%" if best_remaining is not None else "—"
        items.append(pystray.MenuItem(
            f"Best quota: {pct_str}  ({best_name})",
            None,
            enabled=False,
        ))
        items.append(pystray.Menu.SEPARATOR)

        # Account list — switch actions
        if accounts:
            items.append(pystray.MenuItem("Switch account:", None, enabled=False))
            for acc in accounts[:10]:  # cap at 10 to keep menu usable
                name = acc.get("display_name") or acc.get("email") or f"Account {acc['id']}"
                pct = acc.get("best_remaining")
                pct_label = f" [{pct:.0f}%]" if pct is not None else " [—]"
                status = acc.get("status", "")
                status_icon = "🟢" if status == "live" else ("🟡" if status == "stale" else "⚫")

                acc_id = acc["id"]
                # Capture acc_id in closure correctly
                def make_handler(aid: int):
                    def handler(icon: pystray.Icon, item: pystray.MenuItem) -> None:
                        threading.Thread(
                            target=_switch_account, args=(aid, icon), daemon=True
                        ).start()
                    return handler

                items.append(pystray.MenuItem(
                    f"  {status_icon} {name}{pct_label}",
                    make_handler(acc_id),
                ))
            items.append(pystray.Menu.SEPARATOR)

    items += [
        pystray.MenuItem("Open Dashboard", _open_dashboard),
        pystray.MenuItem("Sync Now", _sync_now),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Quit AI-Quota Tray", _quit),
    ]
    return pystray.Menu(*items)


# ── Icon update ───────────────────────────────────────────────────────────

def _update_icon(icon: pystray.Icon) -> None:
    accounts, best_remaining, best_name, online = state.snapshot()
    color = _color_for_remaining(best_remaining) if online else "#555555"
    icon.icon = _make_icon(color)
    icon.menu = _build_menu(accounts, best_remaining, best_name, online)
    # Update tooltip
    if online and best_remaining is not None:
        icon.title = f"AI-Quota — {best_remaining:.0f}% quota ({best_name})"
    elif online:
        icon.title = "AI-Quota — no quota data"
    else:
        icon.title = "AI-Quota — agent offline"


# ── Background polling ────────────────────────────────────────────────────

def _poll_loop(icon: pystray.Icon) -> None:
    """Background thread: refresh state every POLL_INTERVAL seconds."""
    while True:
        time.sleep(POLL_INTERVAL)
        if not icon.visible:
            break
        state.refresh()
        _update_icon(icon)


# ── Main ──────────────────────────────────────────────────────────────────

def main() -> None:
    # Initial data fetch
    state.refresh()
    accounts, best_remaining, best_name, online = state.snapshot()

    color = _color_for_remaining(best_remaining) if online else "#555555"
    icon_img = _make_icon(color)

    icon = pystray.Icon(
        name=APP_NAME,
        icon=icon_img,
        title="AI-Quota",
        menu=_build_menu(accounts, best_remaining, best_name, online),
    )

    # Start background poll thread
    poll_thread = threading.Thread(target=_poll_loop, args=(icon,), daemon=True)
    poll_thread.start()

    icon.run()


if __name__ == "__main__":
    main()
