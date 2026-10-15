import math
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "static"
MEDIA = ROOT / "apps" / "vscode-extension" / "media"
DOCS = ROOT / "docs"

def render_ultra_minimal(size: int, supersample: int = 4) -> Image.Image:
    dim = size * supersample
    
    # Base transparent canvas
    img = Image.new("RGBA", (dim, dim), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    radius = int(dim * 0.225)
    
    # 1. Solid opaque Obsidian tile: #090a0f
    draw.rounded_rectangle([0, 0, dim - 1, dim - 1], radius=radius, fill=(9, 10, 15, 255))
    
    # 2. Minimal hairline border
    border_w = max(2, int(dim * 0.005))
    draw.rounded_rectangle(
        [0, 0, dim - 1, dim - 1],
        radius=radius,
        outline=(255, 255, 255, 20),
        width=border_w,
    )

    # Center & Geometry (proportional bold geometry)
    cx = dim * 0.468
    cy = dim * 0.455
    r = dim * 0.252
    stroke_w = int(dim * 0.088)
    r_mid = r - stroke_w / 2
    track_bbox = [cx - r, cy - r, cx + r, cy + r]

    # 3. Inactive Track (Clean dark graphite ring #1f242d, completely flat)
    draw.arc(track_bbox, start=0, end=360, fill=(31, 36, 45, 255), width=stroke_w)

    # 4. Active Quota Arc (Pure vibrant Emerald #22c55e, 100% solid, NO GLOSS, NO WHITE SPOT)
    emerald = (34, 197, 94, 255)
    draw.arc(track_bbox, start=135, end=45, fill=emerald, width=stroke_w)

    # Precision rounded endcaps on the active arc
    cap_r = stroke_w / 2
    # Start cap at 135 deg
    x_135 = cx + r_mid * math.cos(math.radians(135))
    y_135 = cy + r_mid * math.sin(math.radians(135))
    draw.ellipse([x_135 - cap_r, y_135 - cap_r, x_135 + cap_r, y_135 + cap_r], fill=emerald)

    # End cap at 45 deg
    x_45 = cx + r_mid * math.cos(math.radians(45))
    y_45 = cy + r_mid * math.sin(math.radians(45))
    draw.ellipse([x_45 - cap_r, y_45 - cap_r, x_45 + cap_r, y_45 + cap_r], fill=emerald)

    # 5. Diagonal Q-Tail Spur (Solid engineered capsule at 45 degrees, matching emerald)
    tail_s = (cx + r_mid * 0.38, cy + r_mid * 0.38)
    tail_e = (cx + r_mid * 1.36, cy + r_mid * 1.36)
    draw.line([tail_s, tail_e], fill=emerald, width=stroke_w)
    draw.ellipse([tail_s[0] - cap_r, tail_s[1] - cap_r, tail_s[0] + cap_r, tail_s[1] + cap_r], fill=emerald)
    draw.ellipse([tail_e[0] - cap_r, tail_e[1] - cap_r, tail_e[0] + cap_r, tail_e[1] + cap_r], fill=emerald)

    return img.resize((size, size), Image.Resampling.LANCZOS)

def main():
    sizes = [16, 32, 48, 64, 128, 180, 256]
    icons = {s: render_ultra_minimal(s) for s in sizes}

    # 1. Favicon 32x32 PNG (The source of truth)
    STATIC.mkdir(parents=True, exist_ok=True)
    png32 = STATIC / "favicon-32x32.png"
    icons[32].save(png32, format="PNG")
    print(f"Saved {png32} (32x32)")

    # 2. Docs Logo (256x256)
    DOCS.mkdir(parents=True, exist_ok=True)
    docs_logo = DOCS / "logo.png"
    icons[256].save(docs_logo, format="PNG")
    print(f"Saved {docs_logo} (256x256)")

    # 3. Extension Media Icon (256x256)
    MEDIA.mkdir(parents=True, exist_ok=True)
    ext_icon = MEDIA / "icon.png"
    icons[256].save(ext_icon, format="PNG")
    print(f"Saved {ext_icon} (256x256)")

    # 4. Static Favicon PNG (128x128)
    png128 = STATIC / "favicon.png"
    icons[128].save(png128, format="PNG")
    print(f"Saved {png128} (128x128)")

    # 5. Apple Touch Icon (180x180)
    apple_icon = STATIC / "apple-touch-icon.png"
    icons[180].save(apple_icon, format="PNG")
    print(f"Saved {apple_icon} (180x180)")

    # 6. Favicon .ico
    ico_path = STATIC / "favicon.ico"
    icons[32].save(
        ico_path,
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
    )
    print(f"Saved {ico_path}")

if __name__ == "__main__":
    main()
