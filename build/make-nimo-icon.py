from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

BUILD_DIR = Path(__file__).resolve().parent
SIZE = 1024
SS = 4
W = SIZE * SS
ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

BLUE = (37, 99, 235, 255)
PURPLE = (124, 58, 237, 255)
NAVY = (15, 23, 42, 255)
WHITE = (255, 255, 255, 255)
YELLOW = (253, 230, 138, 255)
ORANGE = (249, 115, 22, 255)


def lerp(a, b, t):
    return round(a + (b - a) * t)


def gradient(size):
    img = Image.new("RGBA", (size, size), NAVY)
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x * 0.55 + y * 0.45) / size
            if t < 0.55:
                u = t / 0.55
                c0, c1 = BLUE, PURPLE
            else:
                u = (t - 0.55) / 0.45
                c0, c1 = PURPLE, NAVY
            px[x, y] = tuple(lerp(c0[i], c1[i], u) for i in range(4))
    return img


def rounded_rect_mask(size, radius):
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return mask


def draw_n(layer):
    d = ImageDraw.Draw(layer)
    stroke = int(W * 0.074)
    pts = [(int(W * 0.23), int(W * 0.70)), (int(W * 0.23), int(W * 0.29)), (int(W * 0.62), int(W * 0.70)), (int(W * 0.62), int(W * 0.29))]
    shadow = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    spts = [(x + int(W * 0.012), y + int(W * 0.014)) for x, y in pts]
    sd.line(spts, fill=(2, 6, 23, 95), width=stroke + int(W * 0.014), joint="curve")
    for x, y in spts:
        r = (stroke + int(W * 0.014)) / 2
        sd.ellipse((x - r, y - r, x + r, y + r), fill=(2, 6, 23, 95))
    shadow = shadow.filter(ImageFilter.GaussianBlur(int(W * 0.006)))
    layer.alpha_composite(shadow)
    d.line(pts, fill=WHITE, width=stroke, joint="curve")
    for x, y in pts:
        r = stroke / 2
        d.ellipse((x - r, y - r, x + r, y + r), fill=WHITE)


def draw_bell(layer):
    d = ImageDraw.Draw(layer)
    cx = int(W * 0.70)
    top = int(W * 0.22)
    bell_w = int(W * 0.24)
    bell_h = int(W * 0.25)
    glow = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((cx - bell_w, top - bell_h // 2, cx + bell_w, top + bell_h * 2), fill=(253, 230, 138, 70))
    layer.alpha_composite(glow.filter(ImageFilter.GaussianBlur(int(W * 0.035))))
    d.rounded_rectangle((cx - bell_w // 2, top, cx + bell_w // 2, top + bell_h), radius=int(W * 0.07), fill=YELLOW)
    d.pieslice((cx - bell_w // 2, top - int(W * 0.055), cx + bell_w // 2, top + int(W * 0.09)), 180, 360, fill=YELLOW)
    d.rounded_rectangle((cx - int(W * 0.16), top + bell_h - int(W * 0.02), cx + int(W * 0.16), top + bell_h + int(W * 0.045)), radius=int(W * 0.03), fill=YELLOW)
    d.ellipse((cx - int(W * 0.042), top + bell_h + int(W * 0.03), cx + int(W * 0.042), top + bell_h + int(W * 0.114)), fill=ORANGE)
    d.ellipse((cx - int(W * 0.025), top + int(W * 0.03), cx + int(W * 0.025), top + int(W * 0.08)), fill=(255, 248, 200, 230))


def add_polish(img):
    overlay = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    d.ellipse((int(W * 0.05), -int(W * 0.22), int(W * 0.82), int(W * 0.55)), fill=(255, 255, 255, 34))
    d.rounded_rectangle((int(W * 0.05), int(W * 0.05), int(W * 0.95), int(W * 0.95)), radius=int(W * 0.20), outline=(255, 255, 255, 42), width=int(W * 0.008))
    return Image.alpha_composite(img, overlay)


def create_source():
    img = gradient(W)
    img = add_polish(img)
    draw_n(img)
    draw_bell(img)
    out = img.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    out.save(BUILD_DIR / "icon-source.png", "PNG", optimize=True)
    return out


def rounded_icon(source, size, polish=True):
    base = source.resize((size, size), Image.Resampling.LANCZOS)
    mask = rounded_rect_mask(size, max(2, int(size * 0.22)))
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(base, (0, 0), mask)
    if polish:
        layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        d.rounded_rectangle((1, 1, size - 2, size - 2), radius=max(2, int(size * 0.22)) - 1, outline=(255, 255, 255, 55), width=max(1, int(size * 0.012)))
        out = Image.alpha_composite(out, layer)
    return out


def main():
    source = create_source()
    rounded_icon(source, 512, True).save(BUILD_DIR / "icon.png", "PNG", optimize=True)
    rounded_icon(source, 256, True).save(BUILD_DIR / "icon-256-rounded.png", "PNG", optimize=True)
    icons = [rounded_icon(source, s, s >= 48) for s in ICO_SIZES]
    icons[-1].save(BUILD_DIR / "icon.ico", format="ICO", sizes=[(s, s) for s in ICO_SIZES], append_images=icons[:-1])
    icons[-1].save(BUILD_DIR / "installerHeaderIcon.ico", format="ICO", sizes=[(s, s) for s in ICO_SIZES], append_images=icons[:-1])
    print("wrote Nimo icon resources")


if __name__ == "__main__":
    main()
