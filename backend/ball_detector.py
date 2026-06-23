"""영상 프레임에서 테니스 공 탐지 및 궤적 보정."""

from __future__ import annotations

import math

import cv2
import numpy as np


def detect_ball_in_frame(
  bgr: np.ndarray,
  prev_ball: dict | None = None,
) -> dict | None:
  """보정된 영상 프레임에서 테니스 공 탐지 (색상 + 원형 + 허프)."""
  h, w = bgr.shape[:2]
  frame_area = w * h
  min_area = frame_area * 0.00002
  max_area = frame_area * 0.006
  max_track_dist = max(w, h) * 0.22

  candidates: list[dict] = []

  # HSV 색상 마스크 (노랑·연두 테니스공)
  hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
  mask = cv2.inRange(hsv, (16, 50, 50), (98, 255, 255))
  mask = cv2.GaussianBlur(mask, (5, 5), 0)
  mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
  mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))

  contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
  for cnt in contours:
    cand = _contour_to_ball(cnt, min_area, max_area)
    if cand:
      candidates.append(cand)

  # 허프 원 변환 보조
  gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
  gray = cv2.medianBlur(gray, 5)
  circles = cv2.HoughCircles(
    gray,
    cv2.HOUGH_GRADIENT,
    dp=1.2,
    minDist=max(20, int(min(w, h) * 0.04)),
    param1=80,
    param2=18,
    minRadius=max(3, int(min(w, h) * 0.004)),
    maxRadius=max(12, int(min(w, h) * 0.04)),
  )
  if circles is not None:
    for cx, cy, r in circles[0]:
      area = math.pi * r * r
      if min_area <= area <= max_area:
        candidates.append(
          {
            "x": float(cx),
            "y": float(cy),
            "radius": float(r),
            "confidence": 0.65,
            "source": "hough",
          }
        )

  if not candidates:
    return None

  best = None
  best_score = 0.0

  for cand in candidates:
    score = cand["confidence"] * math.sqrt(
      math.pi * cand["radius"] ** 2
    )

    # 색상 일치도 가산
    cx, cy = int(cand["x"]), int(cand["y"])
    if 0 <= cy < h and 0 <= cx < w:
      px = hsv[cy, cx]
      if 16 <= px[0] <= 98 and px[1] > 40:
        score *= 1.3

    if prev_ball:
      dist = math.hypot(cand["x"] - prev_ball["x"], cand["y"] - prev_ball["y"])
      if dist < max_track_dist:
        score *= 1.0 + (1.2 - dist / max_track_dist)
      else:
        score *= 0.35

    if score > best_score:
      best_score = score
      best = cand

  if best:
    best = {k: v for k, v in best.items() if k != "source"}
  return best


def _contour_to_ball(cnt, min_area: float, max_area: float) -> dict | None:
  area = cv2.contourArea(cnt)
  if area < min_area or area > max_area:
    return None

  perimeter = cv2.arcLength(cnt, True)
  if perimeter <= 0:
    return None

  circularity = 4 * math.pi * area / (perimeter * perimeter)
  if circularity < 0.4:
    return None

  m = cv2.moments(cnt)
  if m["m00"] == 0:
    return None

  cx = m["m10"] / m["m00"]
  cy = m["m01"] / m["m00"]
  radius = math.sqrt(area / math.pi)

  return {
    "x": float(cx),
    "y": float(cy),
    "radius": float(radius),
    "confidence": float(min(1.0, circularity)),
  }


def refine_ball_track(detections: list[dict | None], max_gap: int = 6) -> list[dict | None]:
  """궤적 연속성 보정: 스무딩 + 빈 프레임 보간."""
  n = len(detections)
  if n == 0:
    return detections

  refined = [d.copy() if d else None for d in detections]

  # 이동 평균 스무딩
  for i in range(n):
    if refined[i] is None:
      continue
    neighbors = [
      refined[j]
      for j in range(max(0, i - 2), min(n, i + 3))
      if refined[j] is not None
    ]
    if len(neighbors) >= 2:
      refined[i]["x"] = sum(p["x"] for p in neighbors) / len(neighbors)
      refined[i]["y"] = sum(p["y"] for p in neighbors) / len(neighbors)

  # 짧은 구간 선형 보간
  i = 0
  while i < n:
    if refined[i] is not None:
      i += 1
      continue
    gap_start = i
    while i < n and refined[i] is None:
      i += 1
    gap_end = i

    prev_idx = gap_start - 1
    next_idx = gap_end
    gap_len = gap_end - gap_start

    if (
      gap_len > 0
      and gap_len <= max_gap
      and prev_idx >= 0
      and next_idx < n
      and refined[prev_idx] is not None
      and refined[next_idx] is not None
    ):
      p0 = refined[prev_idx]
      p1 = refined[next_idx]
      for k, gi in enumerate(range(gap_start, gap_end)):
        t = (k + 1) / (gap_len + 1)
        refined[gi] = {
          "x": p0["x"] + (p1["x"] - p0["x"]) * t,
          "y": p0["y"] + (p1["y"] - p0["y"]) * t,
          "radius": p0["radius"] * (1 - t) + p1["radius"] * t,
          "confidence": 0.4,
          "interpolated": True,
        }

  return refined
