"""
AI-Quota 2.0 — Core data models.

These Pydantic models form the canonical data contract for the entire system:
the agent API, the extension, the CLI, and all provider adapters.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


# ─────────────────────────────────────────────────────────────────
# Enums
# ─────────────────────────────────────────────────────────────────

class AccountStatus(str, Enum):
    LIVE = "live"
    RECENT = "recent"
    STALE = "stale"
    VERY_STALE = "very_stale"
    NOT_CONNECTED = "not_connected"
    ERROR = "error"


class SwitchMethod(str, Enum):
    INSTANT = "instant"       # Windows DPAPI / credential swap — no browser
    ASSISTED = "assisted"     # Browser-based OAuth flow
    UNSUPPORTED = "unsupported"


class SwitchStatus(str, Enum):
    SUCCESS = "success"
    FAILED = "failed"
    PENDING = "pending"
    VERIFICATION_FAILED = "verification_failed"
    COOLDOWN = "cooldown"
    LOCKED = "locked"


class StalenessLevel(str, Enum):
    LIVE = "LIVE"
    RECENT = "RECENT"
    STALE = "STALE"
    VERY_STALE = "VERY_STALE"
    UNKNOWN = "UNKNOWN"


# ─────────────────────────────────────────────────────────────────
# Provider capability declaration (per adapter)
# ─────────────────────────────────────────────────────────────────

@dataclass
class ProviderCapabilities:
    supports_quota: bool = False
    supports_usage: bool = False
    supports_account_detection: bool = False
    supports_account_switching: bool = False
    supports_instant_switch: bool = False          # Windows DPAPI only
    supports_credential_vault: bool = False
    supports_history: bool = False
    supports_realtime: bool = False
    switch_method: SwitchMethod = SwitchMethod.UNSUPPORTED
    switch_requires_restart: bool = False          # must restart IDE backend after switch
    switch_cooldown_seconds: int = 30
    switch_max_per_hour: int = 10


# ─────────────────────────────────────────────────────────────────
# Provider truth metadata (source authority classification)
# ─────────────────────────────────────────────────────────────────

@dataclass
class ProviderTruth:
    key: str
    label: str
    priority: int
    live: bool
    truth: str
    note: str
    authority_type: str = "unknown"
    source_description: str = ""


# ─────────────────────────────────────────────────────────────────
# Provider health snapshot
# ─────────────────────────────────────────────────────────────────

@dataclass
class ProviderHealth:
    provider_id: str
    status: str = "unknown"         # "ok" | "degraded" | "offline" | "unknown"
    last_check_at: str | None = None
    error: str | None = None
    latency_ms: float | None = None


# ─────────────────────────────────────────────────────────────────
# Quota window / bucket
# ─────────────────────────────────────────────────────────────────

@dataclass
class QuotaWindowResult:
    window_name: str
    model: str = ""
    remaining_percent: float | None = None
    used_units: float | None = None
    limit_units: float | None = None
    unit: str | None = None
    reset_at: str | None = None
    source: str = ""
    description: str | None = None
    quota_bucket: str = "default"           # e.g. "5h", "weekly", "monthly"
    staleness_tier: str = "UNKNOWN"


@dataclass
class QuotaBucket:
    bucket_name: str                        # "5h" | "weekly" | "daily" | "monthly"
    remaining_percent: float | None = None
    used_units: float | None = None
    limit_units: float | None = None
    unit: str | None = None
    reset_at: str | None = None
    staleness_tier: str = "UNKNOWN"


# ─────────────────────────────────────────────────────────────────
# Account identity (lightweight, returned by detect() / get_current_account())
# ─────────────────────────────────────────────────────────────────

@dataclass
class AccountIdentity:
    account_id: str           # e.g. acc_01JKVP... or acc_000000000001 (legacy)
    email: str                # primary identifier visible to user
    provider: str
    client: str
    display_name: str = ""
    detected_at: str | None = None


# ─────────────────────────────────────────────────────────────────
# Provider detection result
# ─────────────────────────────────────────────────────────────────

@dataclass
class ProviderDetection:
    detected: bool = False
    process_name: str | None = None
    port: int | None = None
    version: str | None = None
    hub_url: str | None = None
    detail: str = ""


# ─────────────────────────────────────────────────────────────────
# Switch result
# ─────────────────────────────────────────────────────────────────

@dataclass
class SwitchResult:
    requested_account_id: str
    status: SwitchStatus = SwitchStatus.PENDING
    method_used: SwitchMethod = SwitchMethod.UNSUPPORTED
    verified: bool = False
    active_account_id: str | None = None
    reason: str = ""
    switch_event_id: int | None = None


# ─────────────────────────────────────────────────────────────────
# Pydantic API models (wire format for HTTP API + extension)
# ─────────────────────────────────────────────────────────────────

class AccountIn(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    provider: str = Field(default="Antigravity", min_length=1, max_length=80)
    client: str = Field(default="Antigravity CLI", min_length=1, max_length=100)
    display_name: str = Field(default="", max_length=120)
    label: str = Field(default="", max_length=80)
    group_name: str = Field(default="", max_length=80)
    color: str = Field(default="", max_length=20)
    priority: int = Field(default=50, ge=0, le=100)


class SnapshotIn(BaseModel):
    account_id: int
    service: str = Field(min_length=1, max_length=80)
    client: str = Field(default="", max_length=100)
    model: str = Field(default="", max_length=120)
    window_name: str = Field(min_length=1, max_length=80)
    quota_bucket: str = Field(default="default", max_length=40)
    remaining_percent: float | None = Field(default=None, ge=0, le=100)
    used_units: float | None = None
    limit_units: float | None = None
    unit: str | None = Field(default=None, max_length=40)
    reset_at: str | None = None
    source: str = Field(default="manual", max_length=80)
    staleness_tier: str = Field(default="UNKNOWN", max_length=20)


class SnapshotOut(BaseModel):
    id: int
    account_id: int
    service: str
    client: str
    model: str
    window_name: str
    quota_bucket: str = "default"
    remaining_percent: float | None
    used_units: float | None
    limit_units: float | None
    unit: str | None
    reset_at: str | None
    source: str
    staleness_tier: str = "UNKNOWN"
    captured_at: str


class AccountOut(BaseModel):
    id: int
    account_id: str = ""
    email: str
    provider: str
    client: str
    display_name: str
    label: str = ""
    group_name: str = ""
    color: str = ""
    priority: int = 50
    enabled: int = 1
    created_at: str
    status: str
    plan_tier: str | None = None
    last_seen_at: str | None = None
    last_error: str | None = None
    credits_remaining: float | None = None
    credits_updated_at: str | None = None
    source_kind: str = "manual"
    telemetry_age_seconds: float | None = None
    model: str | None = None
    context_window: dict[str, Any] = Field(default_factory=dict)
    snapshots: list[dict[str, Any]] = Field(default_factory=list)
    best_remaining: float | None = None
    staleness_tier: str = "UNKNOWN"
    health_score: float | None = None
    quota_buckets: list[dict[str, Any]] = Field(default_factory=list)


class DashboardSummary(BaseModel):
    accounts: int = 0
    live: int = 0
    stale: int = 0
    not_connected: int = 0
    exhausted: int = 0
    best_account_id: int | None = None


class ProviderSyncResult(BaseModel):
    ok: bool = True
    changed: int = 0
    matched: int = 0
    discovered: int = 0
    error: str | None = None
    details: dict[str, Any] = Field(default_factory=dict)


class DashboardResponse(BaseModel):
    summary: DashboardSummary
    accounts: list[AccountOut]
    ranking: list[AccountOut]
    sync: dict[str, Any]
    generated_at: str


class SwitchRequest(BaseModel):
    account_id: str = Field(min_length=1, description="Target account_id (acc_xxx)")
    force: bool = Field(default=False, description="Bypass cooldown check")


class SwitchResponse(BaseModel):
    requested_account_id: str
    status: str                          # success | failed | pending | verification_failed | cooldown | locked
    method_used: str                     # instant | assisted | unsupported
    verified: bool = False
    active_account_id: str | None = None
    reason: str = ""
    switch_event_id: int | None = None


class EventOut(BaseModel):
    id: int
    account_id: str | None
    event_type: str
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at: str


class DiagnosticsResponse(BaseModel):
    agent_version: str = "2.0.0"
    db_path: str
    db_size_bytes: int
    providers: list[dict[str, Any]] = Field(default_factory=list)
    settings: dict[str, str] = Field(default_factory=dict)
    generated_at: str


class SettingIn(BaseModel):
    key: str = Field(min_length=1, max_length=100)
    value: str = Field(max_length=1000)


class HistoryPoint(BaseModel):
    timestamp: str
    remaining_percent: float | None
    window_name: str
    source: str
    staleness_tier: str = "UNKNOWN"


class AccountHistoryResponse(BaseModel):
    account_id: str
    period: str
    points: list[HistoryPoint] = Field(default_factory=list)
