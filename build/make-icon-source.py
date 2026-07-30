"""Generate icon-source.png for Pulse / TaPa.

Style: deep navy gradient square + white ECG/pulse line + green heart dot.
Mirrors logo.svg (path "M 6 32 L 22 32 L 26 22 L 32 44 L 38 24 L 42 32 L 58 32"
plus a green circle at 32,44 r=3) but at 1024x1024 with anti-aliased strokes,
soft inner glow and subtle radial highlight, suitable for Windows app icons
after make-icon.py rounds the corners.
"""
from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

BUILD_DIR = Path(__file__).resolve().parent
SIZE = 1024
SS = 4  # supersample factor for clean anti-aliased strokes
W = SIZE * SS

# --- Color palette ----------------------------------------------------------
NAVY_TOP = (38, 86, 168, 255)      # #2656A8 — lighter top edge
NAVY_MID = (24, 60, 140, 255)      # #183C8C — main body
NAVY_BOT = (10, 28, 70, 255)       # #0A1C46 — deep bottom corner
EDGE_RING = (255, 255, 255, 36)    # subtle inner ring
HIGHLIGHT = (255, 255, 255, 26)    # top sheen
LINE_WHITE = (255, 255, 255, 255)
LINE_SHADOW = (5, 16, 42, 90)      # soft dark shadow under the line
HEART_GREEN = (34, 197, 94, 255)   # #22C55E (matches logo.svg circle)
HEART_GLOW = (34, 197, 94, 110)    # outer glow halo


def vertical_gradient(w: int, h: int, top, mid, bot) -> Image.Image:
    """3-stop vertical gradient. Smooth navy fade from top to bottom."""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = img.load()
    half = h // 2
    for y in range(h):
        if y < half:
            t = y / max(1, half)
            r = round(top[0] + (mid[0] - top[0]) * t)
            g = round(top[1] + (mid[1] - top[1]) * t)
            b = round(top[2] + (mid[2] - top[2]) * t)
        else:
            t = (y - half) / max(1, h - half)
            r = round(mid[0] + (bot[0] - mid[0]) * t)
            g = round(mid[1] + (bot[1] - mid[1]) * t)
            b = round(mid[2] + (bot[2] - mid[2]) * t)
        for x in range(w):
            px[x, y] = (r, g, b, 255)
    return img


def radial_glow(w: int, h: int, cx: float, cy: float, radius: float,
                color, max_alpha: int = 70) -> Image.Image:
    """Soft radial highlight, rendered via blurred circle."""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(radius)
    fill = (*color[:3], max_alpha)
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=fill)
    return img.filter(ImageFilter.GaussianBlur(radius=r * 0.4))


def map_xy(x: float, y: float) -> tuple[int, int]:
    """Map logo.svg's 0..64 viewBox to our supersampled canvas."""
    # Inset 6% so the line breathes inside the rounded corners that
    # make-icon.py later applies.
    inset = 0.08
    nx = inset + (x / 64.0) * (1 - 2 * inset)
    ny = inset + (y / 64.0) * (1 - 2 * inset)
    return (round(nx * W), round(ny * W))


def draw_ecg_line(layer: Image.Image, color, width_px: int) -> None:
    """Draw the ECG path as a series of anti-aliased line segments."""
    pts_64 = [(6, 32), (22, 32), (26, 22), (32, 44), (38, 24), (42, 32), (58, 32)]
    pts = [map_xy(*p) for p in pts_64]
    d = ImageDraw.Draw(layer)
    # joined path with rounded caps so the peaks read clean
    d.line(pts, fill=color, width=width_px, joint="curve")
    # round caps at each vertex
    half = width_px / 2
    for (x, y) in pts:
        d.ellipse((x - half, y - half, x + half, y + half), fill=color)


def main() -> None:
    # 1) Background: vertical navy gradient at supersampled size
    bg = vertical_gradient(W, W, NAVY_TOP, NAVY_MID, NAVY_BOT)

    # 2) Subtle radial highlight (top-left quadrant glow)
    sheen = radial_glow(W, W, cx=W * 0.36, cy=W * 0.30,
                        radius=W * 0.45, color=(255, 255, 255), max_alpha=44)
    bg = Image.alpha_composite(bg, sheen)

    # 3) Faint inner ring to suggest a bezel (matches NIMO source feel,
    #    but cleaner). Drawn INSIDE before corners are rounded later.
    ring_layer = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    ring_inset = int(W * 0.05)
    ring_radius = int(W * 0.20)
    ImageDraw.Draw(ring_layer).rounded_rectangle(
        (ring_inset, ring_inset, W - ring_inset, W - ring_inset),
        radius=ring_radius,
        outline=EDGE_RING,
        width=max(2, int(W * 0.005)),
    )
    bg = Image.alpha_composite(bg, ring_layer)

    # 4) ECG shadow layer (offset blurred dark stroke beneath the white line)
    shadow_layer = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    draw_ecg_line(shadow_layer, LINE_SHADOW, width_px=int(W * 0.058))
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(radius=W * 0.012))
    # nudge shadow slightly down-right
    shifted = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    shifted.paste(shadow_layer, (int(W * 0.006), int(W * 0.012)))
    bg = Image.alpha_composite(bg, shifted)

    # 5) ECG line (white)
    line_layer = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    draw_ecg_line(line_layer, LINE_WHITE, width_px=int(W * 0.052))
    bg = Image.alpha_composite(bg, line_layer)

    # 6) Heart dot at (32, 44) of the 0..64 path, with outer glow
    cx, cy = map_xy(32, 44)
    glow = radial_glow(W, W, cx=cx, cy=cy,
                       radius=int(W * 0.085),
                       color=HEART_GREEN, max_alpha=130)
    bg = Image.alpha_composite(bg, glow)

    dot_layer = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    dot_r = int(W * 0.052)
    ImageDraw.Draw(dot_layer).ellipse(
        (cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r),
        fill=HEART_GREEN,
    )
    # tiny inner highlight on the dot for liveliness
    inner_r = int(dot_r * 0.42)
    inner_cx = cx - dot_r * 0.32
    inner_cy = cy - dot_r * 0.34
    ImageDraw.Draw(dot_layer).ellipse(
        (inner_cx - inner_r, inner_cy - inner_r,
         inner_cx + inner_r, inner_cy + inner_r),
        fill=(220, 255, 232, 180),
    )
    bg = Image.alpha_composite(bg, dot_layer)

    # 7) Downsample to 1024
    out = bg.resize((SIZE, SIZE), Image.LANCZOS)
    target = BUILD_DIR / "icon-source.png"
    out.save(target, "PNG", optimize=True)
    print(f"wrote {target} {SIZE}x{SIZE}")


if __name__ == "__main__":
    main()
