/**
 * AI-Quota Agent HTTP Client
 *
 * All extension logic that needs data calls through this client.
 * Communicates with the AI-Quota local agent at 127.0.0.1:8765 ONLY.
 * Never makes any external network calls.
 */

import * as https from "https";
import * as http from "http";

export interface AccountData {
  id: number;
  account_id: string;
  email: string;
  provider: string;
  client: string;
  display_name: string;
  label: string;
  group_name: string;
  color: string;
  priority: number;
  status: string;
  best_remaining: number | null;
  telemetry_age_seconds: number | null;
  snapshots: SnapshotData[];
  provider_truth: ProviderTruth;
}

export interface SnapshotData {
  window_name: string;
  quota_bucket: string;
  remaining_percent: number | null;
  used_units: number | null;
  limit_units: number | null;
  unit: string | null;
  reset_at: string | null;
  staleness_tier: string;
}

export interface ProviderTruth {
  authority_type: string;
  label: string;
  live: boolean;
  note: string;
}

export interface ProviderData {
  id: string;
  display_name: string;
  capabilities: {
    quota: boolean;
    detection: boolean;
    switching: boolean;
    instant_switch: boolean;
    switch_method: string;
  };
  detected: boolean;
  hub_url: string | null;
  truth: ProviderTruth;
}

export interface SwitchResult {
  requested_account_id: string;
  status: "success" | "failed" | "pending" | "verification_failed" | "cooldown" | "locked";
  method_used: "instant" | "assisted" | "unsupported";
  verified: boolean;
  active_account_id: string | null;
  reason: string;
}

export interface DiagnosticsData {
  agent_version: string;
  db_size_bytes: number;
  providers: Array<{ id: string; display_name: string; status: string; error?: string; latency_ms?: number }>;
  settings: Record<string, string>;
  generated_at: string;
}

export class AgentClient {
  private baseUrl: string;
  private timeout: number;

  constructor(baseUrl: string, timeoutMs = 8000) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.timeout = timeoutMs;
  }

  private async fetch<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      const response = await globalThis.fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          ...options?.headers,
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${path}`);
      }
      return await response.json() as T;
    } finally {
      clearTimeout(timer);
    }
  }

  async isAgentRunning(): Promise<boolean> {
    try {
      await this.fetch("/api/v1/health");
      return true;
    } catch {
      return false;
    }
  }

  async getAccounts(): Promise<AccountData[]> {
    return this.fetch<AccountData[]>("/api/v1/accounts");
  }

  async getProviders(): Promise<ProviderData[]> {
    return this.fetch<ProviderData[]>("/api/v1/providers");
  }

  async sync(): Promise<Record<string, unknown>> {
    return this.fetch<Record<string, unknown>>("/api/v1/sync", { method: "POST" });
  }

  async switchAccount(accountId: number, force = false): Promise<SwitchResult> {
    return this.fetch<SwitchResult>(
      `/api/v1/accounts/${accountId}/switch?force=${force}`,
      { method: "POST" }
    );
  }

  async refreshAccount(accountId: number): Promise<Record<string, unknown>> {
    return this.fetch<Record<string, unknown>>(
      `/api/v1/accounts/${accountId}/refresh`,
      { method: "POST" }
    );
  }

  async getDiagnostics(): Promise<DiagnosticsData> {
    return this.fetch<DiagnosticsData>("/api/v1/diagnostics");
  }

  async getSettings(): Promise<Record<string, string>> {
    return this.fetch<Record<string, string>>("/api/v1/settings");
  }

  async updateSettings(updates: Record<string, string>): Promise<unknown> {
    return this.fetch("/api/v1/settings", {
      method: "PUT",
      body: JSON.stringify(updates),
    });
  }

  async addAccount(data: {
    email: string;
    provider: string;
    client: string;
    display_name?: string;
    label?: string;
    group_name?: string;
  }): Promise<AccountData> {
    return this.fetch<AccountData>("/api/v1/accounts", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async deleteAccount(accountId: number): Promise<void> {
    await this.fetch(`/api/v1/accounts/${accountId}`, { method: "DELETE" });
  }

  getDashboardUrl(): string {
    return `${this.baseUrl}/`;
  }
}
