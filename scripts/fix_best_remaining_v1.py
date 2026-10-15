"""Fix best_remaining = min(usable) -> max(usable) in app/routes/v1.py (CRLF file)."""
import sys
from pathlib import Path

path = Path("app/routes/v1.py")
content = path.read_bytes().decode("utf-8")

old = 'item["best_remaining"] = min(usable) if usable else None'
new = 'item["best_remaining"] = max(usable) if usable else None'

if old not in content:
    print("ERROR: target string not found — already fixed or file changed")
    sys.exit(1)

content = content.replace(old, new, 1)
path.write_bytes(content.encode("utf-8"))
print("OK: fixed best_remaining in app/routes/v1.py")
