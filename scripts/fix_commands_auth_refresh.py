"""Add antigravity.handleAuthRefresh trigger to commands.ts on successful account switch."""
import sys
from pathlib import Path

path = Path("apps/vscode-extension/src/commands.ts")
content = path.read_bytes().decode("utf-8")

old_text = """          if (result.status === "success" && result.verified) {
            vscode.window.showInformationMessage(
              `✓ Switched to ${selected.label} (verified via ${result.method_used})`
            );"""

new_text = """          if (result.status === "success" && result.verified) {
            // Signal official extension UI panels to refresh immediately without window reload
            try {
              const allCmds = await vscode.commands.getCommands(true);
              if (allCmds.includes("antigravity.handleAuthRefresh")) {
                await vscode.commands.executeCommand("antigravity.handleAuthRefresh");
              }
            } catch {
              // best effort
            }
            vscode.window.showInformationMessage(
              `✓ Switched to ${selected.label} (verified via ${result.method_used})`
            );"""

content_norm = content.replace("\r\n", "\n")
old_norm = old_text.replace("\r\n", "\n")
new_norm = new_text.replace("\r\n", "\n")

if old_norm in content_norm:
    content_norm = content_norm.replace(old_norm, new_norm, 1)
    final_content = content_norm.replace("\n", "\r\n") if "\r\n" in content else content_norm
    path.write_bytes(final_content.encode("utf-8"))
    print("OK: added handleAuthRefresh trigger to commands.ts")
else:
    print("ERROR: old_text not found in commands.ts")
    sys.exit(1)
