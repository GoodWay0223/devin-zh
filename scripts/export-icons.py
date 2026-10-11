"""Maintainer-only format export; the launcher and userscript do not require Python."""
from pathlib import Path
from PIL import Image

assets = Path(__file__).resolve().parent.parent / "assets"
source = Image.open(assets / "devin-zh-master.png").convert("RGBA")
if source.width != source.height:
    raise ValueError("The approved icon must be square")

for size in (32, 64, 128, 512):
    target = assets / ("devin-zh.png" if size == 512 else f"devin-zh-{size}.png")
    source.resize((size, size), Image.Resampling.LANCZOS).save(target, optimize=True)
source.save(assets / "devin-zh.ico", sizes=[(n, n) for n in (16, 24, 32, 48, 64, 128, 256)])
source.resize((1024, 1024), Image.Resampling.LANCZOS).save(assets / "devin-zh.icns")
print("Exported shared PNG, Windows ICO and macOS ICNS assets from the approved master.")
