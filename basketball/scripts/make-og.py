"""Builds public/og.png (1200x630), the Open Graph / X card image for Glyph Basketball.
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
# Maple court planks, key and three-point arc.
for y in range(210, H, 28):
    d.rectangle((0, y, W, y + 28), fill=(226, 178, 119) if (y // 28) % 2 else (220, 170, 110))
d.rectangle((0, 0, W, 210), fill=(43, 29, 20))
d.rectangle((900, 330, 1200, 530), fill=(122, 92, 255), outline='white', width=6)
d.arc((700, 230, 1300, 630), 90, 270, fill='white', width=6)
d.line((560, 210, 560, H), fill='white', width=6)
d.ellipse((470, 330, 650, 510), outline='white', width=6)

d.rounded_rectangle((60, 50, 160, 150), 26, fill=(255, 138, 0))
layer = Image.new('RGBA', (140, 140), (0, 0, 0, 0))
ImageDraw.Draw(layer).text((6, 4), '🏀', font=ImageFont.truetype(os.path.join(F, 'seguiemj.ttf'), 80), embedded_color=True)
img.paste(layer, (64, 52), layer)
d.text((186, 46), '字形篮球 2v2', font=bold(64), fill='white')
d.text((188, 128), 'グリフバスケ · Glyph Basketball', font=jp(30), fill=(255, 217, 176))

def outlined(xy, text, font, fill):
    x, y = xy
    for dx, dy in ((-3, 0), (3, 0), (0, -3), (0, 3), (-2, -2), (2, 2), (-2, 2), (2, -2)):
        d.text((x + dx, y + dy), text, font=font, fill=(29, 22, 56))
    d.text(xy, text, font=font, fill=fill)

outlined((70, 250), '2 VS 2', bold(150), (255, 210, 63))
# Two duos: one flying for a dunk.
for ch, x, y, col in [('冰', 700, 380, (124, 200, 255)), ('火', 860, 230, (255, 122, 162)), ('兄', 1000, 420, (255, 210, 63)), ('弟', 1080, 300, (255, 210, 63))]:
    outlined((x, y), ch, bold(110), col)
for ch, x, y in [('🏀', 980, 200), ('🔥', 760, 250)]:
    layer = Image.new('RGBA', (160, 160), (0, 0, 0, 0))
    ImageDraw.Draw(layer).text((8, 8), ch, font=emoji, embedded_color=True)
    img.paste(layer, (x, y), layer)
outlined((76, 460), 'BASKETBALL', bold(64), (255, 255, 255))
outlined((76, 560), '免费 · 無料 · Free', bold(30), (255, 255, 255))
os.makedirs('public', exist_ok=True)
img.save('public/og.png', optimize=True)
print('public/og.png', os.path.getsize('public/og.png'), 'bytes')
