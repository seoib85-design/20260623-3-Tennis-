"""테니스 스윙 비교 서버 실행."""

import uvicorn

if __name__ == "__main__":
  uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
