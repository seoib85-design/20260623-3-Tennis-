"""라켓 위치 추정."""

from __future__ import annotations

import math


GRIP_INSET_RATIO = 0.15
RACKET_LENGTH_RATIO = 2.4


def _wrist_velocity(frames: list[dict], idx: int, wrist_key: str) -> tuple[float, float]:
  if idx <= 0 or idx >= len(frames):
    return (0.0, 0.0)
  prev = frames[idx - 1]["landmarks"].get(wrist_key)
  curr = frames[idx]["landmarks"].get(wrist_key)
  if not prev or not curr:
    return (0.0, 0.0)
  return (curr["x"] - prev["x"], curr["y"] - prev["y"])


def estimate_racket(
  landmarks: dict,
  dominant_hand: str,
  wrist_vel: tuple[float, float] = (0.0, 0.0),
) -> dict | None:
  wrist_key = f"{dominant_hand}_wrist"
  elbow_key = f"{dominant_hand}_elbow"

  wrist = landmarks.get(wrist_key)
  elbow = landmarks.get(elbow_key)
  if not wrist or not elbow:
    return None

  fx = wrist["x"] - elbow["x"]
  fy = wrist["y"] - elbow["y"]
  forearm = math.hypot(fx, fy)
  if forearm < 1e-6:
    return None

  ux, uy = fx / forearm, fy / forearm
  vx, vy = wrist_vel
  vm = math.hypot(vx, vy)

  if vm > forearm * 0.04:
    dx, dy = vx / vm, vy / vm
    dx = 0.75 * dx + 0.25 * ux
    dy = 0.75 * dy + 0.25 * uy
    dm = math.hypot(dx, dy) or 1.0
    dx, dy = dx / dm, dy / dm
  else:
    dx, dy = ux, uy

  inset = forearm * GRIP_INSET_RATIO
  grip_x = wrist["x"] - ux * inset
  grip_y = wrist["y"] - uy * inset
  racket_len = forearm * RACKET_LENGTH_RATIO

  return {
    "grip": {"x": grip_x, "y": grip_y},
    "wrist": {"x": wrist["x"], "y": wrist["y"]},
    "head": {"x": grip_x + dx * racket_len, "y": grip_y + dy * racket_len},
    "angle": math.degrees(math.atan2(dy, dx)),
    "length": racket_len,
  }


def enrich_frame(frame: dict, dominant_hand: str, wrist_vel: tuple[float, float]) -> dict:
  landmarks = frame.get("landmarks", {})
  racket = estimate_racket(landmarks, dominant_hand, wrist_vel)
  return {**frame, "racket": racket}


def enrich_pose_data(pose_data: dict) -> dict:
  dominant = pose_data["dominant_hand"]
  frames = pose_data["frames"]
  wrist_key = f"{dominant}_wrist"

  enriched = []
  for i, frame in enumerate(frames):
    vel = _wrist_velocity(frames, i, wrist_key)
    enriched.append(enrich_frame(frame, dominant, vel))
  return {**pose_data, "frames": enriched}
