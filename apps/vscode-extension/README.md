# AI-Quota Extension for VS Code & Antigravity IDE

**Universal AI Account & Quota Manager** — Monitor usage, manage accounts, track reset timers, predict quota exhaustion, and switch accounts directly from your IDE.

---

## ✨ Features

- **Activity Bar & Sidebar**: Live status, account cards, prediction indicators, inline label/notes editor.
- **Status Bar Integration**: Instant overview of your active account and remaining quota.
- **Account Switching**: Switch between registered accounts with instant capability verification.
- **Quota Matrix**: Real-time cross-account and cross-window quota grid.
- **Prediction Engine**: Velocity-based forecasting, exhaustion ETA, reset timing, and account recommendations.
- **Local-First & Zero-Secret Security**: Local SQLite storage; secrets stay in your OS keyring (never sent to any external server).

---

## 🚀 Quick Setup

1. Start your local **AI-Quota** service:
   ```bash
   python -m uvicorn app.main:app --host 127.0.0.1 --port 8765
   ```
2. Open this extension in your IDE — it connects automatically to `http://127.0.0.1:8765`.
3. Open the **AI-Quota** icon in the Activity Bar to manage accounts and quotas.

---

## 🛠 Commands

- `AI-Quota: Open Dashboard` — Open the browser web UI
- `AI-Quota: Switch Account` — Quick-pick account switcher
- `AI-Quota: Show Quota Matrix` — Open the visual cross-provider quota matrix
- `AI-Quota: Sync Quota Data` — Manually poll all connected providers
- `AI-Quota: Show Diagnostics` — Inspect local health and adapter status

---

## 🔒 Security

AI-Quota operates on a strict **Zero Remote Secret Storage Policy**. All API tokens, cookies, and credentials remain inside local OS credential stores.
