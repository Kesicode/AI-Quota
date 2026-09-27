"""
AI-Quota 2.0 — Antigravity hub port detector.

Discovers the running Antigravity Language Server / Hub port dynamically.
NO hardcoded ports — scans running processes and listening ports.

Reference implementation:
  BoyGR/antigravity-account-switcher / src/antigravity/hub-detector.ts

Strategy:
  1. Check known AGY environment variable hints
  2. Scan running processes for AGY-related executables
  3. For each candidate process, find its listening TCP ports
  4. Probe each port for AGY hub fingerprint (/api/health or /api/status)
  5. Cache the confirmed port for the session
  6. Never crash — return None if not found
"""
from __future__ import annotations

import json
import logging
import re
import subprocess
import sys
import time
import urllib.request
import urllib.error
from dataclasses import dataclass

logger = logging.getLogger("ai_quota.antigravity.hub_detector")

# Candidate port scan range used by AGY hub (typical range 40000-49999)
_PORT_SCAN_MIN = 40000
_PORT_SCAN_MAX = 49999

# Known AGY process name fragments (cross-platform)
_AGY_PROCESS_NAMES = [
    "antigravity",
    "agy",
    "agy-ide",
    "agy-hub",
    "agy-server",
    "code",          # VS Code with AGY extension — may host hub
]

# Hub fingerprint paths to probe
_FINGERPRINT_PATHS = [
    "/api/health",
    "/api/status",
    "/v1/health",
    "/_status",
]

_PROBE_TIMEOUT = 1.0  # seconds per probe

# Session cache
_cached_hub_url: str | None = None
_cached_at: float = 0.0
_CACHE_TTL = 60.0  # seconds


@dataclass
class HubInfo:
    port: int
    url: str
    process_name: str | None = None
    version: str | None = None
    fingerprint_path: str = "/api/health"


def _probe_port(port: int) -> HubInfo | None:
    """
    Try to fingerprint an Antigravity hub at http://127.0.0.1:<port>.
    Returns HubInfo if confirmed, None otherwise.
    """
    for path in _FINGERPRINT_PATHS:
        url = f"http://127.0.0.1:{port}{path}"
        try:
            req = urllib.request.Request(url, headers={"Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=_PROBE_TIMEOUT) as resp:
                body = resp.read(4096).decode("utf-8", errors="ignore").lower()
                # Accept if response contains AGY-like fingerprints
                if any(kw in body for kw in ("antigravity", "agy", "quota", "account", "hub")):
                    version = None
                    try:
                        data = json.loads(body)
                        version = data.get("version") or data.get("agentVersion")
                    except Exception:
                        pass
                    return HubInfo(port=port, url=f"http://127.0.0.1:{port}", version=version, fingerprint_path=path)
        except (urllib.error.URLError, OSError, TimeoutError):
            continue
    return None


def _get_agy_ports_windows() -> list[int]:
    """On Windows, use netstat to find listening TCP ports for AGY-related PIDs."""
    ports: list[int] = []
    try:
        # Get list of PIDs for AGY processes
        result = subprocess.run(
            ["tasklist", "/FO", "CSV", "/NH"],
            capture_output=True, text=True, timeout=5
        )
        agy_pids: set[str] = set()
        for line in result.stdout.splitlines():
            parts = [p.strip('"') for p in line.split('","')]
            if len(parts) >= 2:
                name = parts[0].lower()
                pid = parts[1]
                if any(kw in name for kw in _AGY_PROCESS_NAMES):
                    agy_pids.add(pid)

        if not agy_pids:
            return ports

        # Get listening ports for those PIDs
        netstat = subprocess.run(
            ["netstat", "-ano"],
            capture_output=True, text=True, timeout=5
        )
        for line in netstat.stdout.splitlines():
            parts = line.split()
            if len(parts) >= 5 and parts[3].upper() == "LISTENING":
                pid = parts[4]
                if pid in agy_pids:
                    addr = parts[1]
                    m = re.search(r":(\d+)$", addr)
                    if m:
                        port = int(m.group(1))
                        if _PORT_SCAN_MIN <= port <= _PORT_SCAN_MAX:
                            ports.append(port)
    except Exception as exc:
        logger.debug("Windows port scan error: %s", exc)
    return ports


def _get_agy_ports_unix() -> list[int]:
    """On macOS/Linux, use lsof or ss to find AGY listening ports."""
    ports: list[int] = []
    try:
        result = subprocess.run(
            ["lsof", "-nP", "-i", "TCP", "-sTCP:LISTEN"],
            capture_output=True, text=True, timeout=5
        )
        for line in result.stdout.splitlines():
            lower = line.lower()
            if any(kw in lower for kw in _AGY_PROCESS_NAMES):
                m = re.search(r":(\d+)\s*\(", line)
                if m:
                    port = int(m.group(1))
                    if _PORT_SCAN_MIN <= port <= _PORT_SCAN_MAX:
                        ports.append(port)
    except Exception:
        pass
    return ports


def detect_hub() -> HubInfo | None:
    """
    Discover the running Antigravity hub port.
    Returns HubInfo if found, None if AGY is not running.
    Uses session cache to avoid repeated scans.
    """
    global _cached_hub_url, _cached_at

    now = time.monotonic()
    if _cached_hub_url and (now - _cached_at) < _CACHE_TTL:
        m = re.search(r":(\d+)", _cached_hub_url)
        if m:
            port = int(m.group(1))
            hub = _probe_port(port)
            if hub:
                return hub
        # Cache stale or invalid — fall through to re-detect
        _cached_hub_url = None

    # Step 1: Check environment variable hints
    import os
    env_port = os.environ.get("AGY_HUB_PORT") or os.environ.get("ANTIGRAVITY_HUB_PORT")
    if env_port:
        try:
            port = int(env_port)
            hub = _probe_port(port)
            if hub:
                _cached_hub_url = hub.url
                _cached_at = now
                logger.info("Detected AGY hub from env var on port %d", port)
                return hub
        except ValueError:
            pass

    # Step 2: Scan processes for candidate ports
    if sys.platform == "win32":
        candidate_ports = _get_agy_ports_windows()
    else:
        candidate_ports = _get_agy_ports_unix()

    for port in candidate_ports:
        hub = _probe_port(port)
        if hub:
            _cached_hub_url = hub.url
            _cached_at = now
            logger.info("Detected AGY hub at port %d (process scan)", port)
            return hub

    # Step 3: Broader scan of the known range (last resort, lightweight probes)
    # Only scan if no candidates found — limit to quick connect-only probes
    for port in range(40000, 40100):  # scan first 100 ports of range
        hub = _probe_port(port)
        if hub:
            _cached_hub_url = hub.url
            _cached_at = now
            logger.info("Detected AGY hub at port %d (range scan)", port)
            return hub

    logger.debug("Antigravity hub not detected.")
    return None


def invalidate_cache() -> None:
    """Force re-detection on next call (e.g. after a restart)."""
    global _cached_hub_url, _cached_at
    _cached_hub_url = None
    _cached_at = 0.0
