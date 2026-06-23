"""영상 회전 메타데이터 감지 및 좌표 보정."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import numpy as np


def get_video_rotation(video_path: str) -> int:
  path = Path(video_path)
  if not path.exists():
    return 0

  try:
    result = subprocess.run(
      [
        "ffprobe",
        "-v", "quiet",
        "-print_format", "json",
        "-show_streams",
        str(path),
      ],
      capture_output=True,
      text=True,
      timeout=15,
      check=False,
    )
    if result.returncode == 0 and result.stdout:
      data = json.loads(result.stdout)
      for stream in data.get("streams", []):
        tags = stream.get("tags") or {}
        rotate = tags.get("rotate")
        if rotate is not None:
          return int(rotate) % 360
        for side in stream.get("side_data_list") or []:
          if "rotation" in side:
            return int(side["rotation"]) % 360
  except (FileNotFoundError, subprocess.TimeoutExpired, ValueError, json.JSONDecodeError):
    pass

  return 0


def detect_rotation_from_pose(frames: list[dict], width: int, height: int) -> int:
  nose_x, nose_y, ankle_x, ankle_y = [], [], [], []

  for frame in frames:
    lm = frame.get("landmarks") or {}
    head = lm.get("head") or lm.get("nose")
    if not head:
      continue
    nose_x.append(head["x"])
    nose_y.append(head["y"])
    ankles = [lm[k] for k in ("left_ankle", "right_ankle") if k in lm]
    if ankles:
      ankle_x.append(sum(a["x"] for a in ankles) / len(ankles))
      ankle_y.append(sum(a["y"] for a in ankles) / len(ankles))

  if len(nose_x) < 1:
    return 0

  nx, ny = float(np.mean(nose_x)), float(np.mean(nose_y))
  ax, ay = float(np.mean(ankle_x)), float(np.mean(ankle_y))
  body_dx = ax - nx
  body_dy = ay - ny

  if body_dy > abs(body_dx) and body_dy > height * 0.15:
    return 0
  if abs(body_dx) > abs(body_dy):
    return 90 if body_dx > 0 else 270
  if body_dy < 0 and abs(body_dy) > height * 0.15:
    return 180
  return 0


def rotate_landmarks(
  landmarks: dict, width: int, height: int, rotation: int
) -> tuple[dict, int, int]:
  rotation = rotation % 360
  if rotation == 0 or not landmarks:
    return landmarks, width, height

  rotated: dict = {}
  for name, pt in landmarks.items():
    x, y = pt["x"], pt["y"]
    if rotation == 90:
      rx, ry = y, width - x
    elif rotation == 180:
      rx, ry = width - x, height - y
    elif rotation == 270:
      rx, ry = height - y, x
    else:
      rx, ry = x, y
    rotated[name] = {**pt, "x": rx, "y": ry}

  if rotation in (90, 270):
    return rotated, height, width
  return rotated, width, height


def flip_landmarks_180(landmarks: dict, width: int, height: int) -> dict:
  if not landmarks:
    return landmarks
  return {
    name: {**pt, "x": width - pt["x"], "y": height - pt["y"]}
    for name, pt in landmarks.items()
  }


def transform_ball(
  ball: dict | None,
  src_w: int,
  src_h: int,
  rotation: int,
  flip180: bool = False,
) -> dict | None:
  if not ball:
    return None

  x, y = ball["x"], ball["y"]
  w, h = src_w, src_h
  rotation = rotation % 360

  if rotation == 90:
    x, y = y, w - x
    w, h = h, w
  elif rotation == 180:
    x, y = w - x, h - y
  elif rotation == 270:
    x, y = h - y, x
    w, h = h, w

  if flip180:
    x, y = w - x, h - y

  return {**ball, "x": x, "y": y}
