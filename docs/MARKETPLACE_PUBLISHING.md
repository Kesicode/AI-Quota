# Publishing AI-Quota to IDE Marketplaces

This guide explains how to make **AI-Quota** searchable and installable directly inside:
1. **Antigravity IDE / Cursor / VSCodium / Eclipse Theia** (via Open VSX Registry)
2. **VS Code Official** (via Visual Studio Marketplace)
3. **Direct GitHub Releases** (one-click `.vsix` download)

---

## 1. Open VSX Registry (For Antigravity IDE, Cursor & Open-source IDEs)

Antigravity IDE and Cursor use the **[Open VSX Registry](https://open-vsx.org)** as their default extension repository.

### Steps to register:
1. Go to [https://open-vsx.org/](https://open-vsx.org/) and sign in with your GitHub account.
2. Go to **Settings** → **Access Tokens** → Generate a new Personal Access Token (PAT).
3. Create a namespace named `Kesicode` (matches the `"publisher": "Kesicode"` in `package.json`).
4. Add the token to your GitHub repository secrets:
   - Name: `OVSX_PAT`
   - Value: `<your-open-vsx-token>`

Once added, every new Git release automatically publishes AI-Quota to Open VSX, making it immediately searchable inside **Antigravity IDE**.

---

## 2. Visual Studio Marketplace (For Official VS Code)

VS Code uses the Microsoft Visual Studio Marketplace.

### Steps to register:
1. Go to [Azure DevOps](https://dev.azure.com/) and create/select an organization.
2. Click **User settings** (top right) → **Personal access tokens**.
3. Create a token with **Marketplace (Acquire & Publish)** scope.
4. Go to the [VS Code Marketplace Management Portal](https://marketplace.visualstudio.com/manage) and create a Publisher with ID `Kesicode`.
5. Add the token to your GitHub repository secrets:
   - Name: `VSCE_PAT`
   - Value: `<your-azure-devops-pat>`

Once added, every new Git release automatically deploys to the official VS Code marketplace.

---

## 3. Direct GitHub Release / VSIX Installation

Every time you create a release or push a version tag (e.g. `git tag v2.0.0; git push origin v2.0.0`), the GitHub Actions workflow compiles and attaches `ai-quota.vsix` to the release assets.

Users can install it in any IDE with:
```bash
# In Antigravity IDE
antigravity --install-extension ai-quota.vsix

# In VS Code
code --install-extension ai-quota.vsix

# In Cursor
cursor --install-extension ai-quota.vsix
```
Or via IDE UI:
1. Open Extensions (`Ctrl+Shift+X` or `Cmd+Shift+X`).
2. Click the `...` menu (Views and More Actions) at the top right of the extensions pane.
3. Select **Install from VSIX...** and pick `ai-quota.vsix`.
