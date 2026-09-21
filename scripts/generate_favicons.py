from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "static"

def render_icon(size: int) -> Image.Image:
    scale = 8
    canvas_size = size * scale
    img = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Obsidian tile: #090a0d with subtle border
    bg_color = (9, 10, 13, 255)
    border_color = (255, 255, 255, 30)
    radius = int(canvas_size * 0.22)
    border_w = max(1, int(scale * 1))
    draw.rounded_rectangle(
        [0, 0, canvas_size - 1, canvas_size - 1],
        radius=radius,
        fill=bg_color,
        outline=border_color,
        width=border_w,
    )

    # Center circle geometry
    cx = canvas_size * 0.468
    cy = canvas_size * 0.453
    r = canvas_size * 0.245
    stroke_w = max(2, int(scale * 2.8))

    # Inactive track ring
    track_color = (255, 255, 255, 36)
    bbox = [cx - r, cy - r, cx + r, cy + r]
    draw.arc(bbox, start=0, end=360, fill=track_color, width=stroke_w)

    # Active emerald green quota arc (~270 degrees from 135 to 45 deg)
    emerald = (34, 197, 94, 255)
    draw.arc(bbox, start=135, end=45, fill=emerald, width=stroke_w)

    # Diagonal tick completing the 'Q'
    tail_start = (cx + r * 0.35, cy + r * 0.35)
    tail_end = (cx + r * 1.05, cy + r * 1.05)
    draw.line([tail_start, tail_end], fill=emerald, width=stroke_w)

    # Downsample using high-quality Lanczos resampling
    return img.resize((size, size), Image.Resampling.LANCZOS)

def main():
    sizes = [16, 32, 48, 64, 180, 192]
    icons = {s: render_icon(s) for s in sizes}

    ico_path = STATIC / "favicon.ico"
    icons[32].save(
        ico_path,
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
    )
    print(f"Saved {ico_path}")

    png32 = STATIC / "favicon-32x32.png"
    icons[32].save(png32, format="PNG")
    print(f"Saved {png32}")

    apple_icon = STATIC / "apple-touch-icon.png"
    icons[180].save(apple_icon, format="PNG")
    print(f"Saved {apple_icon}")

if __name__ == "__main__":
    main()
