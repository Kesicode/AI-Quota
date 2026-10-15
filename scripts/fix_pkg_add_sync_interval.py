"""Add syncIntervalMinutes config to apps/vscode-extension/package.json."""
import sys, json
from pathlib import Path

path = Path("apps/vscode-extension/package.json")
content = path.read_bytes().decode("utf-8")

# Parse the JSON (strip trailing whitespace / BOM issues)
data = json.loads(content)

props = data["contributes"]["configuration"]["properties"]
if "ai-quota.syncIntervalMinutes" in props:
    print("Already present — no change needed")
    sys.exit(0)

props["ai-quota.syncIntervalMinutes"] = {
    "type": "number",
    "default": 5,
    "minimum": 1,
    "maximum": 60,
    "description": (
        "How often (in minutes) to run a full provider sync (port discovery + quota fetch). "
        "The fast UI poll (ai-quota.pollInterval) reads cached data only; "
        "this setting controls when actual quota data is fetched from providers."
    )
}

# Write back with same formatting style (4-space indent)
out = json.dumps(data, indent=4, ensure_ascii=False)
path.write_bytes(out.encode("utf-8"))
print("OK: added ai-quota.syncIntervalMinutes to package.json")
