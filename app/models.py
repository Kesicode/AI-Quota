from __future__ import annotations

from typing import Any
from pydantic import BaseModel, Field


class AccountIn(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    provider: str = Field(default="Antigravity", min_length=1, max_length=80)
    client: str = Field(default="Antigravity CLI", min_length=1, max_length=100)
    display_name: str = Field(default="", max_length=120)


class SnapshotIn(BaseModel):
    account_id: int
    service: str = Field(min_length=1, max_length=80)
    client: str = Field(default="", max_length=100)
    model: str = Field(default="", max_length=120)
    window_name: str = Field(min_length=1, max_length=80)
    remaining_percent: float | None = Field(default=None, ge=0, le=100)
    used_units: float | None = None
    limit_units: float | None = None
    unit: str | None = Field(default=None, max_length=40)
    reset_at: str | None = None
    source: str = Field(default="manual", max_length=80)


class SnapshotOut(BaseModel):
    id: int
    account_id: int
    service: str
    client: str
    model: str
    window_name: str
    remaining_percent: float | None
    used_units: float | None
    limit_units: float | None
    unit: str | None
    reset_at: str | None
    source: str
    captured_at: str


class AccountOut(BaseModel):
    id: int
    email: str
    provider: str
    client: str
    display_name: str
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
