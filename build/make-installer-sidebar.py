"""Render the NSIS installer / uninstaller sidebar BMPs for Pulse.

Output: 164x314 24-bit BMP (NSIS Modern UI 2 spec).
Style: navy gradient + soft ECG line + Pulse wordmark.
"""
from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

BUILD_DIR = Path(__file__).resolve().parent
W, H = 164, 314
SS = 4  # supersample for smooth lines
WS, HS = W * SS, H * SS

NAVY_TOP = (38, 86, 168)
NAVY_MID = (24, 60, 140)
NAVY_BOT = (10, 28, 70)
LINE_WHITE = (255, 255, 255, 255)
LINE_SHADOW = (5, 16, 42, 110)
HEART_GREEN = (34, 197, 94, 255)
HEART_GLOW = (34, 197, 94, 130)
TEXT_PRIMARY = (255, 255, 255, 255)
TEXT_SECONDARY = (180, 200, 230, 220)
TEXT_FOOTER = (140, 165, 200, 200)


def vertical_gradient(w: int, h: int, top, mid, bot) -> Image.Image:
    img = Image.new("RGBA", (w, h), (0, 0, 0, 255))
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


def radial_glow(w, h, cx, cy, radius, color, max_alpha=120):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(radius)
    fill = (*color[:3], max_alpha)
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=fill)
    return img.filter(ImageFilter.GaussianBlur(radius=r * 0.45))


def load_font(filenames, size):
    fonts_dir = Path("C:/Windows/Fonts")
    for name in filenames:
        for cand in (fonts_dir / name, Path(name)):
            if cand.exists():
                try:
                    return ImageFont.truetype(str(cand), size=size)
                except OSError:
                    pass
    return ImageFont.load_default()


def draw_centered(d: ImageDraw.ImageDraw, xy_center, text, font, fill):
    bbox = d.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    x = xy_center[0] - tw / 2 - bbox[0]
    y = xy_center[1] - th / 2 - bbox[1]
    d.text((x, y), text, font=font, fill=fill)


def draw_ecg(layer: Image.Image, color, width_px: int,
             box: tuple[int, int, int, int]) -> list[tuple[int, int]]:
    """Draw ECG path inside a bounding box. Returns vertex positions."""
    pts_64 = [(6, 32), (22, 32), (26, 22), (32, 44), (38, 24), (42, 32), (58, 32)]
    x0, y0, x1, y1 = box
    bw, bh = x1 - x0, y1 - y0
    pts = [(round(x0 + (x / 64.0) * bw), round(y0 + (y / 64.0) * bh)) for (x, y) in pts_64]
    d = ImageDraw.Draw(layer)
    d.line(pts, fill=color, width=width_px, joint="curve")
    half = width_px / 2
    for (x, y) in pts:
        d.ellipse((x - half, y - half, x + half, y + half), fill=color)
    return pts


def render() -> Image.Image:
    # Background gradient at supersampled size for smooth gradient
    bg = vertical_gradient(WS, HS, NAVY_TOP, NAVY_MID, NAVY_BOT)

    # Soft top-left highlight
    sheen = radial_glow(WS, HS, cx=WS * 0.30, cy=HS * 0.18,
                        radius=WS * 0.55, color=(255, 255, 255), max_alpha=42)
    bg = Image.alpha_composite(bg, sheen)

    # ECG band — placed in the upper-middle area
    ecg_top = int(HS * 0.20)
    ecg_bot = int(HS * 0.42)
    ecg_box = (int(WS * 0.10), ecg_top, int(WS * 0.90), ecg_bot)

    # Shadow under ECG line
    shadow_layer = Image.new("RGBA", (WS, HS), (0, 0, 0, 0))
    draw_ecg(shadow_layer, LINE_SHADOW, width_px=int(WS * 0.038), box=ecg_box)
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(radius=WS * 0.010))
    shifted = Image.new("RGBA", (WS, HS), (0, 0, 0, 0))
    shifted.paste(shadow_layer, (int(WS * 0.005), int(WS * 0.010)))
    bg = Image.alpha_composite(bg, shifted)

    # White ECG line
    line_layer = Image.new("RGBA", (WS, HS), (0, 0, 0, 0))
    pts = draw_ecg(line_layer, LINE_WHITE, width_px=int(WS * 0.034), box=ecg_box)
    bg = Image.alpha_composite(bg, line_layer)

    # Heart dot at vertex (32,44) — index 3 in pts list
    cx, cy = pts[3]
    glow = radial_glow(WS, HS, cx=cx, cy=cy,
                       radius=int(WS * 0.085), color=HEART_GREEN, max_alpha=140)
    bg = Image.alpha_composite(bg, glow)
    dot_layer = Image.new("RGBA", (WS, HS), (0, 0, 0, 0))
    dot_r = int(WS * 0.045)
    ImageDraw.Draw(dot_layer).ellipse(
        (cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r), fill=HEART_GREEN
    )
    inner_r = int(dot_r * 0.42)
    inner_cx = cx - dot_r * 0.32
    inner_cy = cy - dot_r * 0.34
    ImageDraw.Draw(dot_layer).ellipse(
        (inner_cx - inner_r, inner_cy - inner_r,
         inner_cx + inner_r, inner_cy + inner_r),
        fill=(220, 255, 232, 200),
    )
    bg = Image.alpha_composite(bg, dot_layer)

    # Downsample to final resolution before drawing crisp text
    out = bg.resize((W, H), Image.LANCZOS)

    # Text on the final-resolution canvas (sharper)
    d = ImageDraw.Draw(out)
    title_font = load_font(["segoeuib.ttf", "segoeui.ttf"], size=26)
    sub_font = load_font(["segoeui.ttf"], size=11)
    foot_font = load_font(["segoeui.ttf"], size=10)

    draw_centered(d, (W / 2, H * 0.56), "Pulse", title_font, TEXT_PRIMARY)
    draw_centered(d, (W / 2, H * 0.65), "Cognitive Surface", sub_font, TEXT_SECONDARY)
    draw_centered(d, (W / 2, H * 0.91), "Install your AI companion", foot_font, TEXT_FOOTER)

    return out.convert("RGB")


def main() -> None:
    img = render()
    for name in ("installerSidebar.bmp", "uninstallerSidebar.bmp"):
        path = BUILD_DIR / name
        img.save(path, "BMP")
        print(f"wrote {path} {img.size}")


if __name__ == "__main__":
    main()
