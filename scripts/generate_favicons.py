import base64
import io
from pathlib import Path
from PIL import Image, ImageFilter
from collections import deque

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "static"
MEDIA = ROOT / "apps" / "vscode-extension" / "media"
DOCS = ROOT / "docs"

SRC_PATH = Path(r"C:/Users/kesi/.gemini/antigravity/brain/ef642a4a-08b5-4de3-b967-ea04ba2dd8b4/.user_uploaded/media_1792086397832_b6f5aa42.jpg")

def process_master_image() -> Image.Image:
    if SRC_PATH.exists():
        im = Image.open(SRC_PATH).convert("RGBA")
    else:
        im = Image.open(DOCS / "logo.png").convert("RGBA")
    w, h = im.size

    # Flood fill outer corner background to transparency
    visited = set()
    for start in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        q = deque([start])
        visited.add(start)
        while q:
            x, y = q.popleft()
            for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in visited:
                    r, g, b, _ = im.getpixel((nx, ny))
                    if r <= 3 and g <= 3 and b <= 3:
                        visited.add((nx, ny))
                        q.append((nx, ny))

    mask = Image.new("L", (w, h), 255)
    for x, y in visited:
        mask.putpixel((x, y), 0)

    mask = mask.filter(ImageFilter.GaussianBlur(radius=1.2))
    im.putalpha(mask)
    return im

def main():
    im = process_master_image()

    STATIC.mkdir(parents=True, exist_ok=True)
    MEDIA.mkdir(parents=True, exist_ok=True)
    DOCS.mkdir(parents=True, exist_ok=True)

    # 1. docs/logo.png (512x512)
    logo512 = im.resize((512, 512), Image.Resampling.LANCZOS)
    logo512.save(DOCS / "logo.png", format="PNG")
    print(f"Saved {DOCS / 'logo.png'} (512x512)")

    # 2. apps/vscode-extension/media/icon.png (256x256)
    icon256 = im.resize((256, 256), Image.Resampling.LANCZOS)
    icon256.save(MEDIA / "icon.png", format="PNG")
    print(f"Saved {MEDIA / 'icon.png'} (256x256)")

    # 3. static/favicon-32x32.png (32x32)
    fav32 = im.resize((32, 32), Image.Resampling.LANCZOS)
    fav32.save(STATIC / "favicon-32x32.png", format="PNG")
    print(f"Saved {STATIC / 'favicon-32x32.png'} (32x32)")

    # 4. static/favicon.png (128x128)
    fav128 = im.resize((128, 128), Image.Resampling.LANCZOS)
    fav128.save(STATIC / "favicon.png", format="PNG")
    print(f"Saved {STATIC / 'favicon.png'} (128x128)")

    # 5. static/apple-touch-icon.png (180x180)
    fav180 = im.resize((180, 180), Image.Resampling.LANCZOS)
    fav180.save(STATIC / "apple-touch-icon.png", format="PNG")
    print(f"Saved {STATIC / "apple-touch-icon.png"} (180x180)")

    # 6. static/favicon.ico (Multi-size ICO)
    ico32 = im.resize((32, 32), Image.Resampling.LANCZOS)
    ico32.save(
        STATIC / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64)],
    )
    print(f"Saved {STATIC / 'favicon.ico'} (multi-size)")

    # 7. static/favicon.svg (SVG format with embedded high-res master)
    buf = io.BytesIO()
    logo512.save(buf, format="PNG")
    b64_logo = base64.b64encode(buf.getvalue()).decode("ascii")
    svg_content = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">\n'
        f'  <image href="data:image/png;base64,{b64_logo}" width="512" height="512" />\n'
        '</svg>\n'
    )
    (STATIC / "favicon.svg").write_text(svg_content, encoding="utf-8")
    print(f"Saved {STATIC / 'favicon.svg'}")

    # 8. apps/vscode-extension/media/quota-icon.svg (Activity Bar SVG)
    buf_activity = io.BytesIO()
    im.resize((96, 96), Image.Resampling.LANCZOS).save(buf_activity, format="PNG")
    b64_act = base64.b64encode(buf_activity.getvalue()).decode("ascii")
    activity_svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">\n'
        f'  <image href="data:image/png;base64,{b64_act}" width="24" height="24" />\n'
        '</svg>\n'
    )
    (MEDIA / "quota-icon.svg").write_text(activity_svg, encoding="utf-8")
    print(f"Saved {MEDIA / 'quota-icon.svg'}")

if __name__ == "__main__":
    main()
