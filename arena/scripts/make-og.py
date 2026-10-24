"""Builds public/og.png (1200x630), the site-wide Open Graph / Twitter card image.
Run: python scripts/make-og.py   (needs Pillow; uses Windows fonts Microsoft YaHei / Yu Gothic / Segoe UI Emoji)."""
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import os

W, H = 1200, 630
F = r'C:\Windows\Fonts'
bold = lambda s: ImageFont.truetype(os.path.join(F, 'msyhbd.ttc'), s)
jp = lambda s: ImageFont.truetype(os.path.join(F, 'YuGothB.ttc'), s)
emoji = ImageFont.truetype(os.path.join(F, 'seguiemj.ttf'), 109)

img = Image.new('RGB', (W, H))
d = ImageDraw.Draw(img)
for y in range(H):
    t = y / H
    d.line([(0, y), (W, y)], fill=(int(58 + (22 - 58) * t), int(42 + (18 - 42) * t), int(110 + (43 - 110) * t)))
# Soft spotlight.
glow = Image.new('L', (W, H), 0)
ImageDraw.Draw(glow).ellipse((620, -120, 1260, 520), fill=90)
glow = glow.filter(ImageFilter.GaussianBlur(90))
img.paste(Image.new('RGB', (W, H), (255, 120, 190)), (0, 0), glow)
d = ImageDraw.Draw(img)

# Logo.
d.rounded_rectangle((64, 60, 164, 160), 26, fill=(255, 79, 139))
d.text((114, 110), '字', font=bold(70), fill='white', anchor='mm')
d.text((190, 72), '字形乱斗 3D', font=bold(64), fill='white')
d.text((192, 152), '字形乱闘 3D · Glyph Rumble 3D', font=jp(30), fill=(201, 184, 255))

d.text((66, 236), '输入任何文字，变成 3D 玩具自动对战', font=bold(40), fill=(255, 210, 63))
d.text((66, 296), '文字・絵文字・顔文字が 3D のおもちゃになって戦う', font=jp(32), fill='white')
d.text((66, 346), 'Type anything — watch it fight as a 3D toy', font=bold(30), fill=(201, 184, 255))

# Matchup.
d.text((80, 418), '火', font=bold(136), fill=(255, 122, 162))
d.text((280, 470), 'VS', font=bold(56), fill=(255, 255, 255))
d.text((400, 418), '水', font=bold(136), fill=(124, 200, 255))
for i, (ch, x, y) in enumerate([('🔥', 760, 380), ('🍣', 900, 300), ('💀', 1030, 400)]):
    layer = Image.new('RGBA', (160, 160), (0, 0, 0, 0))
    ImageDraw.Draw(layer).text((8, 8), ch, font=emoji, embedded_color=True)
    img.paste(layer, (x, y), layer)
d.text((740, 520), '(・ω・)  (>_<)  orz', font=bold(32), fill=(255, 255, 255))
d.text((740, 576), '免费 · 无需注册 · 浏览器直接玩', font=bold(24), fill=(201, 184, 255))

os.makedirs('public', exist_ok=True)
img.save('public/og.png', optimize=True)
print('public/og.png', os.path.getsize('public/og.png'), 'bytes')
