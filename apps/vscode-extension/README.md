<div align="center">

<img src="media/icon.png" alt="AI-Quota" width="140" height="140" />

# AI-Quota

**Universal AI Account & Quota Manager for VS Code, Google Antigravity IDE, Cursor & VSCodium**

*Monitor live quotas, forecast exhaustion, auto-switch accounts on low quota, and track usage across all AI models — directly from your IDE.*

[![Version](https://img.shields.io/badge/version-2.0.7-blue?style=flat-square)](https://github.com/Kesicode/AI-Quota/releases)
[![Open VSX](https://img.shields.io/open-vsx/v/Kesicode/ai-quota?style=flat-square&color=blue&logo=eclipseche)](https://open-vsx.org/extension/Kesicode/ai-quota)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.85%2B-blue?style=flat-square&logo=visual-studio-code)](https://code.visualstudio.com)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](https://github.com/Kesicode/AI-Quota/blob/main/LICENSE)

[**Install via Open VSX**](https://open-vsx.org/extension/Kesicode/ai-quota) · [**GitHub Repository**](https://github.com/Kesicode/AI-Quota) · [**Report Issue**](https://github.com/Kesicode/AI-Quota/issues)

</div>

---

## ⚡ What's New in v2.0.7

- ⚡ **Auto-Switch on Low Quota**: Seamlessly auto-switches your active session to the account with the highest remaining quota when your current account falls below your safety threshold (e.g. 20%). Configurable cooldown prevents bouncing.
- 📌 **Pin Model to Status Bar**: Pin specific models (e.g. Gemini Models, Claude/GPT models) directly into the IDE status bar for permanent glanceability.
- 🔄 **Antigravity 2.0 Local RPC**: Zero configuration auto-discovery of Antigravity IDE language servers (`language_server.exe`) — no external API keys required!
- ➕ **One-Click Account Addition (`+` button)**: Quick account adding directly from sidebar header with guided input.
- 🎨 **Obsidian & Emerald Dark UI**: High-contrast modern interface with smooth progress transitions, glowing live status indicators, and clean layout.

---

## 📦 Installation

### Option 1: Install from Open VSX / Extensions View (Recommended)
1. Open your IDE's Extensions view (`Ctrl+Shift+X` or `Cmd+Shift+X`).
2. Search for **`AI-Quota`** by **Kesicode**.
3. Click **Install**.

Or install directly via CLI:
```bash
# Google Antigravity IDE
antigravity --install-extension Kesicode.ai-quota

# VS Code / Cursor / VSCodium
code --install-extension Kesicode.ai-quota
codium --install-extension Kesicode.ai-quota
cursor --install-extension Kesicode.ai-quota
```

### Option 2: Install from VSIX Release
Download `ai-quota.vsix` from the [latest GitHub Releases](https://github.com/Kesicode/AI-Quota/releases/latest) and install via:
- Extensions view (`Ctrl+Shift+X`) → `···` → **Install from VSIX…**
- Or via terminal:
  ```bash
  code --install-extension ai-quota.vsix
  ```

---

## 🚀 Requirements & Quick Start

AI-Quota operates on a **local-first** architecture. The extension connects to the AI-Quota local daemon running at `http://127.0.0.1:8765`.

### Starting the Local Engine:
```bash
# Windows
run.bat

# macOS / Linux
chmod +x run.sh && ./run.sh
```

*(Alternatively, run `python -m app.main` inside the repository directory).*

Once running, the extension connects automatically within seconds!

---

## ✨ Features

### 1. 📊 Activity Bar Sidebar
- **Real-Time Model Quota Bars**: 5-hour and weekly quota breakdown with live reset countdown timers (e.g. `↺ 2h 15m`).
- **Live Status Dot**: Glowing green (🟢 live), amber (🟡 warning), red (🔴 critical), or grey (⚪ offline).
- **Auto-Switch Toggle**: Turn auto-switch on or off with a single click (`⚡ Auto: ON/OFF`).
- **Low-Quota Threshold Pill**: Quick-adjust warning threshold (`⚠ 20%`).
- **Account Cards**: Click to switch active accounts instantly with verified capability checks.
- **Privacy Mode**: Mask email addresses and sensitive account details with one click (`👁`).

### 2. 📌 Status Bar Integration
Shows your active quota and countdown directly at the bottom of your IDE:
```
$(pulse) AI-Quota 84% · 1h 42m
```
- **Color-Coded**: 🟢 Healthy (≥ 20%) · 🟡 Warning (< 20%) · 🔴 Critical (< 10%)
- **Customizable Format**: Configure `{percent}`, `{reset}`, `{account}`, or `{provider}`.
- **Pin Any Model**: Pin a specific model or window to monitor what matters most to your workflow.

### 3. 🌐 Quota Matrix Panel
Open a full cross-provider quota comparison matrix (`AI-Quota: Quota Matrix (All Accounts)`):
- Side-by-side view: **All Accounts × All Quota Windows**.
- Color-coded health: 🟢 ≥ 60% · 🔵 ≥ 30% · 🟡 ≥ 15% · 🔴 < 15%.
- Real-time refresh without reloading the window.
- Provider filters & summary metrics.

---

## ⌨️ Keybindings & Shortcuts

| Shortcut | Command | Action |
|---|---|---|
| `Alt+A` / `Option+A` | `ai-quota.statusBarMenu` | Open quick account switcher sorted by highest quota |
| `Alt+Shift+A` / `Option+Shift+A` | `ai-quota.refresh` | Force quota refresh from all providers |
| `Alt+Q` / `Option+Q` | `ai-quota.showQuotaQuickPick` | Open quick quota overview popup |

---

## 🛠️ Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)

| Command | Description |
|---|---|
| `AI-Quota: Focus View` | Opens and focuses the AI-Quota sidebar |
| `AI-Quota: Switch Account` | Select and switch active AI account |
| `AI-Quota: Add Account` | Register a new account / provider identity |
| `AI-Quota: Refresh Quota` | Refresh telemetry from local backend |
| `AI-Quota: Pin Model to Status Bar` | Pin a specific model's quota into the status bar |
| `AI-Quota: Unpin Model from Status Bar` | Revert status bar to aggregate account quota |
| `AI-Quota: Quota Matrix (All Accounts)` | Open rich cross-provider comparison matrix |
| `AI-Quota: Open Dashboard` | Open browser-based dashboard (`127.0.0.1:8765`) |
| `AI-Quota: Start Local Engine` | Launch the local background engine |
| `AI-Quota: Diagnostics` | Inspect agent health and provider connections |
| `AI-Quota: Export Saved Accounts...` | Backup accounts to JSON |
| `AI-Quota: Import Saved Accounts...` | Restore accounts from JSON |
| `AI-Quota: Export Quota Analytics...` | Export quota history to CSV or JSON |
| `AI-Quota: Clear Stored Token Vault...` | Purge encrypted credentials |

---

## ⚙️ Configuration (`settings.json`)

Configure AI-Quota preferences via **Settings** (`Ctrl+,`) → Search **`AI-Quota`**:

```json
{
  // Local agent URL (default: http://127.0.0.1:8765)
  "ai-quota.agentUrl": "http://127.0.0.1:8765",

  // UI polling interval in seconds
  "ai-quota.pollInterval": 30,

  // Low quota warning notification threshold (percentage)
  "ai-quota.notificationThreshold": 20,

  // Automatically switch to fullest account when below threshold
  "ai-quota.autoSwitch": false,

  // Minimum minutes to wait between automatic account switches
  "ai-quota.autoSwitchCooldownMinutes": 5,

  // Status bar format string
  "ai-quota.statusBarFormat": "$(pulse) AI-Quota {percent}% · {reset}",

  // Background provider full-sync interval in minutes
  "ai-quota.syncIntervalMinutes": 5
}
```

---

## 🔒 Security & Privacy

- **100% Local-First**: All quota data and credentials stay on your machine.
- **Zero Cloud Relay**: The extension communicates exclusively with `http://127.0.0.1:8765`.
- **OS Credential Protection**: Passwords, tokens, and cookies are secured using OS-backed Secret Storage (Windows Credential Manager / DPAPI, macOS Keychain, Linux Secret Service).

---

## 📄 License & Links

- **Publisher**: [Kesicode](https://github.com/Kesicode)
- **Open VSX**: [open-vsx.org/extension/Kesicode/ai-quota](https://open-vsx.org/extension/Kesicode/ai-quota)
- **Repository**: [github.com/Kesicode/AI-Quota](https://github.com/Kesicode/AI-Quota)
- **License**: MIT
