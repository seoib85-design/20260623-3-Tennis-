"""테니스 스윙 비교 FastAPI 서버."""

from __future__ import annotations

import os
import shutil
import uuid
from pathlib import Path

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from backend.pose_analyzer import PoseAnalyzer
from backend.phase_segmenter import PhaseSegmenter, PHASES
from backend.impact_ball import analyze_impact_ball, compare_impact_balls

app = FastAPI(title="Tennis Swing Comparator", version="1.0.0")

app.add_middleware(
  CORSMiddleware,
  allow_origins=["*"],
  allow_methods=["*"],
  allow_headers=["*"],
)

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
UPLOAD_DIR = Path("/tmp/tennis_swing_uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _normalize_landmarks(frames: list[dict], width: int, height: int, impact_frame: int | None = None) -> list[dict]:
  """캔버스 렌더링용 0~1 정규화 좌표 추가."""
  normalized = []
  for frame in frames:
    lm = frame.get("landmarks", {})
    norm = {}
    for name, pt in lm.items():
      norm[name] = {
        **pt,
        "nx": pt["x"] / width if width else 0,
        "ny": pt["y"] / height if height else 0,
      }

    ball = frame.get("ball_detected")
    ball_norm = None
    if ball:
      ball_norm = {
        **ball,
        "nx": ball["x"] / width if width else 0,
        "ny": ball["y"] / height if height else 0,
      }

    is_impact = impact_frame is not None and frame.get("frame_index") == impact_frame

    normalized.append(
      {
        **frame,
        "landmarks": norm,
        "ball": ball_norm,
        "is_impact": is_impact,
      }
    )
  return normalized


def _process_video(path: str) -> dict:
  analyzer = PoseAnalyzer()
  try:
    pose_data = analyzer.analyze_video(path)

    segmenter = PhaseSegmenter()
    segmentation = segmenter.segment(pose_data)

    w, h = pose_data["width"], pose_data["height"]
    impact_frame = segmentation["impact_frame"]
    all_frames = _normalize_landmarks(pose_data["frames"], w, h, impact_frame)

    phases_out = []
    for phase in segmentation["phases"]:
      phase_frames = _normalize_landmarks(phase["frames"], w, h, impact_frame)
      phases_out.append(
        {
          "id": phase["id"],
          "name_ko": phase["name_ko"],
          "name_en": phase["name_en"],
          "start_frame": phase["start_frame"],
          "end_frame": phase["end_frame"],
          "frame_count": phase["frame_count"],
          "frames": phase_frames,
        }
      )

    return {
      "fps": pose_data["fps"],
      "width": w,
      "height": h,
      "total_frames": pose_data["total_frames"],
      "dominant_hand": pose_data["dominant_hand"],
      "impact_frame": segmentation["impact_frame"],
      "skeleton_connections": pose_data["skeleton_connections"],
      "phases": phases_out,
      "all_frames": all_frames,
      "impact_ball": _impact_ball_info(all_frames, impact_frame, pose_data["dominant_hand"]),
    }
  finally:
    analyzer.close()


def _impact_ball_info(all_frames: list[dict], impact_frame: int, dominant_hand: str) -> dict | None:
  for frame in all_frames:
    if frame.get("frame_index") == impact_frame:
      return analyze_impact_ball(frame, dominant_hand)
  return None


@app.get("/api/health")
def health():
  return {"status": "ok"}


@app.get("/api/phases")
def get_phase_definitions():
  return {"phases": PHASES}


@app.post("/api/analyze")
async def analyze_swings(
  swing_a: UploadFile = File(..., description="내 현재 스윙 영상"),
  swing_b: UploadFile = File(..., description="비교할 스윙 영상"),
):
  allowed = {".mp4", ".avi", ".mov", ".mkv", ".webm"}
  for f in [swing_a, swing_b]:
    ext = Path(f.filename or "").suffix.lower()
    if ext not in allowed:
      raise HTTPException(400, f"지원하지 않는 형식입니다: {ext}")

  session_id = str(uuid.uuid4())
  session_dir = UPLOAD_DIR / session_id
  session_dir.mkdir(parents=True, exist_ok=True)

  paths = {}
  try:
    for key, upload in [("a", swing_a), ("b", swing_b)]:
      ext = Path(upload.filename or "video.mp4").suffix.lower()
      dest = session_dir / f"swing_{key}{ext}"
      with dest.open("wb") as out:
        shutil.copyfileobj(upload.file, out)
      paths[key] = str(dest)

    result_a = _process_video(paths["a"])
    result_b = _process_video(paths["b"])

    segmenter = PhaseSegmenter()
    aligned = segmenter.align_phases(
      {"phases": result_a["phases"]},
      {"phases": result_b["phases"]},
    )

    impact_ball_comparison = compare_impact_balls(
      result_a.get("impact_ball"),
      result_b.get("impact_ball"),
    )

    return {
      "session_id": session_id,
      "phase_definitions": PHASES,
      "impact_ball_comparison": impact_ball_comparison,
      "swing_a": {
        "label": "내 스윙",
        **result_a,
      },
      "swing_b": {
        "label": "비교 스윙",
        **result_b,
      },
      "aligned_phases": aligned["aligned_phases"],
    }
  except Exception as e:
    raise HTTPException(500, f"분석 중 오류: {e}") from e
  finally:
    shutil.rmtree(session_dir, ignore_errors=True)


@app.get("/")
async def serve_index():
  return FileResponse(FRONTEND_DIR / "index.html")


if FRONTEND_DIR.exists():
  app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")
