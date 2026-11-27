"""Copy the published site files into the Cloudflare asset directory."""
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "deploy" / "public" / "singapore"
files = subprocess.check_output(
    ["git", "ls-files", "-z", "--", "index.html", "art", "audio", "dishes", "people"],
    cwd=ROOT,
).decode().split("\0")

if PUBLIC.exists():
    shutil.rmtree(PUBLIC)
for name in filter(None, files):
    target = PUBLIC / name
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(ROOT / name, target)
