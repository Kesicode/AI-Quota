import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "static"
MEDIA = ROOT / "apps" / "vscode-extension" / "media"
DOCS = ROOT / "docs"

def render_designer_icon(size: int, supersample: int = 4) -> Image.Image:
    dim = size * supersample
    
    # Base Squircle Layer
    base_layer = Image.new("RGBA", (dim, dim), (0, 0, 0, 0))
    b_draw = ImageDraw.Draw(base_layer)
    radius = int(dim * 0.225)
    
    # 1. Solid opaque Obsidian tile: #07080B
    b_draw.rounded_rectangle([0, 0, dim - 1, dim - 1], radius=radius, fill=(7, 8, 11, 255))
    
    # Outer hairline bezel
    border_w = max(2, int(dim * 0.005))
    b_draw.rounded_rectangle([0, 0, dim - 1, dim - 1], radius=radius,
                             outline=(255, 255, 255, 26), width=border_w)
    
    # Inner rim (high-precision double bezel)
    inner_inset = int(dim * 0.012)
    b_draw.rounded_rectangle([inner_inset, inner_inset, dim - 1 - inner_inset, dim - 1 - inner_inset],
                             radius=radius - inner_inset, outline=(255, 255, 255, 9), width=max(1, border_w // 2))

    # Center & Geometry (proportional bold geometry)
    cx = dim * 0.468
    cy = dim * 0.455
    r = dim * 0.252
    stroke_w = int(dim * 0.088)
    r_mid = r - stroke_w / 2

    # 2. Emissive Ambient Aura (Dark-field glow, zero gloss)
    glow_layer = Image.new("RGBA", (dim, dim), (0, 0, 0, 0))
    g_draw = ImageDraw.Draw(glow_layer)
    track_bbox = [cx - r, cy - r, cx + r, cy + r]
    glow_w = stroke_w + int(dim * 0.05)
    g_draw.arc(track_bbox, start=135, end=45, fill=(16, 185, 129, 65), width=glow_w)
    
    tail_s = (cx + r_mid * 0.38, cy + r_mid * 0.38)
    tail_e = (cx + r_mid * 1.36, cy + r_mid * 1.36)
    g_draw.line([tail_s, tail_e], fill=(16, 185, 129, 65), width=glow_w)
    glow_blurred = glow_layer.filter(ImageFilter.GaussianBlur(radius=int(dim * 0.042)))
    base_layer.alpha_composite(glow_blurred)

    # 3. Graphic Mark Layer
    mark_layer = Image.new("RGBA", (dim, dim), (0, 0, 0, 0))
    m_draw = ImageDraw.Draw(mark_layer)

    # Inactive Track (Dark graphite precision scale #222730)
    m_draw.arc(track_bbox, start=0, end=360, fill=(34, 39, 48, 255), width=stroke_w)

    # Active Quota Arc (Precision emerald sweep with smooth angular color transition)
    cap_r = stroke_w / 2
    steps = 120
    start_deg = 140
    total_span = 265
    for i in range(steps):
        deg1 = (start_deg + (i * total_span) / steps) % 360
        deg2 = (start_deg + ((i + 1.2) * total_span) / steps) % 360
        progress = i / steps
        
        if progress < 0.12: # Leading white node fading into mint
            t = progress / 0.12
            cr = int(255 - t * (255 - 74))
            cg = int(255 - t * (255 - 222))
            cb = int(255 - t * (255 - 128))
        else: # Mint to emerald
            t = (progress - 0.12) / 0.88
            cr = int(74 - t * (74 - 16))
            cg = int(222 - t * (222 - 185))
            cb = int(128 - t * (128 - 129))
            
        color = (cr, cg, cb, 255)
        m_draw.arc(track_bbox, start=deg1, end=deg2, fill=color, width=stroke_w)

    # Rounded end cap at 140 deg (Pure White focal pip)
    x_140 = cx + r_mid * math.cos(math.radians(140))
    y_140 = cy + r_mid * math.sin(math.radians(140))
    m_draw.ellipse([x_140 - cap_r, y_140 - cap_r, x_140 + cap_r, y_140 + cap_r], fill=(255, 255, 255, 255))

    # Rounded end cap at 45 deg (Emerald)
    x_45 = cx + r_mid * math.cos(math.radians(45))
    y_45 = cy + r_mid * math.sin(math.radians(45))
    emerald_end = (16, 185, 129, 255)
    m_draw.ellipse([x_45 - cap_r, y_45 - cap_r, x_45 + cap_r, y_45 + cap_r], fill=emerald_end)

    # Diagonal Q-Spur (Engineered Capsule)
    m_draw.line([tail_s, tail_e], fill=emerald_end, width=stroke_w)
    m_draw.ellipse([tail_s[0]-cap_r, tail_s[1]-cap_r, tail_s[0]+cap_r, tail_s[1]+cap_r], fill=emerald_end)
    m_draw.ellipse([tail_e[0]-cap_r, tail_e[1]-cap_r, tail_e[0]+cap_r, tail_e[1]+cap_r], fill=emerald_end)

    base_layer.alpha_composite(mark_layer)
    return base_layer.resize((size, size), Image.Resampling.LANCZOS)

def main():
    sizes = [16, 32, 48, 64, 128, 180, 256]
    icons = {s: render_designer_icon(s) for s in sizes}

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
