"""frontend/ → public/ 및 Vercel 루트(index.html, static/) 동기화."""

from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"
PUBLIC = ROOT / "public"


def _copy_assets(dest_static: Path, index_dest: Path) -> None:
  shutil.copy2(FRONTEND / "index.html", index_dest)
  if dest_static.exists():
    shutil.rmtree(dest_static)
  shutil.copytree(FRONTEND / "css", dest_static / "css")
  shutil.copytree(FRONTEND / "js", dest_static / "js")


def main() -> None:
  if PUBLIC.exists():
    shutil.rmtree(PUBLIC)
  PUBLIC.mkdir()
  _copy_assets(PUBLIC / "static", PUBLIC / "index.html")
  _copy_assets(ROOT / "static", ROOT / "index.html")
  print("assets ready: public/ and root index.html + static/")


if __name__ == "__main__":
  main()
