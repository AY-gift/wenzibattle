"""Builds public/og.png (1200x630), the Open Graph / X card image for Glyph Soccer.
Run: python scripts/make-og.py   (needs Pillow; uses Windows fonts Microsoft YaHei / Yu Gothic / Segoe UI Emoji)."""
from PIL import Image, ImageDraw, ImageFont
import os

W, H = 1200, 630
F = r'C:\Windows\Fonts'
bold = lambda s: ImageFont.truetype(os.path.join(F, 'msyhbd.ttc'), s)
jp = lambda s: ImageFont.truetype(os.path.join(F, 'YuGothB.ttc'), s)
emoji = ImageFont.truetype(os.path.join(F, 'seguiemj.ttf'), 109)

img = Image.new('RGB', (W, H))
d = ImageDraw.Draw(img)
for x in range(0, W, 100):
    d.rectangle((x, 0, x + 100, H), fill=(79, 179, 82) if (x // 100) % 2 else (70, 166, 74))
d.rectangle((0, 0, W, 210), fill=(31, 42, 34))
d.ellipse((470, 300, 730, 560), outline='white', width=6)
d.line((600, 210, 600, H), fill='white', width=6)
d.rectangle((0, 330, 120, 530), outline='white', width=6)
d.rectangle((1080, 330, 1200, 530), outline='white', width=6)

d.rounded_rectangle((60, 50, 160, 150), 26, fill=(63, 163, 77))
layer = Image.new('RGBA', (140, 140), (0, 0, 0, 0))
ImageDraw.Draw(layer).text((6, 4), '⚽', font=ImageFont.truetype(os.path.join(F, 'seguiemj.ttf'), 80), embedded_color=True)
img.paste(layer, (64, 52), layer)
d.text((186, 46), '字形足球 4v4', font=bold(64), fill='white')
d.text((188, 128), 'グリフサッカー · Glyph Soccer', font=jp(30), fill=(185, 240, 192))

def outlined(xy, text, font, fill):
    x, y = xy
    for dx, dy in ((-3, 0), (3, 0), (0, -3), (0, 3), (-2, -2), (2, 2), (-2, 2), (2, -2)):
        d.text((x + dx, y + dy), text, font=font, fill=(29, 22, 56))
    d.text(xy, text, font=font, fill=fill)

outlined((70, 250), '4 VS 4', bold(150), (255, 210, 63))
# A few glyph "players" on the pitch.
for ch, x, y, col in [('火', 760, 250, (255, 122, 162)), ('水', 900, 330, (124, 200, 255)), ('猫', 1030, 240, (255, 122, 162)), ('雷', 820, 440, (124, 200, 255))]:
    outlined((x, y), ch, bold(110), col)
for ch, x, y in [('⚽', 560, 440), ('🔥', 1040, 430)]:
    layer = Image.new('RGBA', (160, 160), (0, 0, 0, 0))
    ImageDraw.Draw(layer).text((8, 8), ch, font=emoji, embedded_color=True)
    img.paste(layer, (x, y), layer)
outlined((76, 460), 'SOCCER', bold(64), (255, 255, 255))
outlined((76, 560), '免费 · 無料 · Free', bold(30), (255, 255, 255))
os.makedirs('public', exist_ok=True)
img.save('public/og.png', optimize=True)
print('public/og.png', os.path.getsize('public/og.png'), 'bytes')
