"""frontend/ → public/ 복사 (Vercel 정적 호스팅용)."""

from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"
PUBLIC = ROOT / "public"


def main() -> None:
  if PUBLIC.exists():
    shutil.rmtree(PUBLIC)
  PUBLIC.mkdir()

  shutil.copy2(FRONTEND / "index.html", PUBLIC / "index.html")
  shutil.copytree(FRONTEND / "css", PUBLIC / "static" / "css")
  shutil.copytree(FRONTEND / "js", PUBLIC / "static" / "js")
  print(f"public assets ready: {PUBLIC}")


if __name__ == "__main__":
  main()
