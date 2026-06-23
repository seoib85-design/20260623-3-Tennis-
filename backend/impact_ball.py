"""임팩트 순간 공 위치 분석."""

from __future__ import annotations

import math


def _body_ref(landmarks: dict, hand: str) -> tuple[float, float, float]:
  scale = 1.0
  if "left_shoulder" in landmarks and "left_ankle" in landmarks:
    s, a = landmarks["left_shoulder"], landmarks["left_ankle"]
    scale = math.hypot(s["x"] - a["x"], s["y"] - a["y"])
  hip_x = hip_y = 0.0
  if "left_hip" in landmarks and "right_hip" in landmarks:
    hip_x = (landmarks["left_hip"]["x"] + landmarks["right_hip"]["x"]) / 2
    hip_y = (landmarks["left_hip"]["y"] + landmarks["right_hip"]["y"]) / 2
  return hip_x, hip_y, max(scale, 1.0)


def analyze_impact_ball(frame: dict, dominant_hand: str) -> dict | None:
  ball = frame.get("ball_detected")
  if not ball:
    return {"detected": False}

  lm = frame.get("landmarks", {})
  hip_x, hip_y, scale = _body_ref(lm, dominant_hand)
  wrist_key = f"{dominant_hand}_wrist"
  wrist = lm.get(wrist_key)

  bx, by = ball["x"], ball["y"]
  rel_x = (bx - hip_x) / scale
  rel_y = (by - hip_y) / scale

  wrist_dist = None
  if wrist:
    wrist_dist = math.hypot(bx - wrist["x"], by - wrist["y"]) / scale

  return {
    "detected": True,
    "x": bx,
    "y": by,
    "radius": ball.get("radius", 8),
    "rel_x": rel_x,
    "rel_y": rel_y,
    "wrist_distance": wrist_dist,
    "confidence": ball.get("confidence", 0),
  }


def compare_impact_balls(info_a: dict | None, info_b: dict | None) -> dict:
  if not info_a or not info_a.get("detected"):
    info_a = {"detected": False}
  if not info_b or not info_b.get("detected"):
    info_b = {"detected": False}

  if not info_a["detected"] and not info_b["detected"]:
    return {
      "summary": "임팩트 순간 공이 영상에서 확인되지 않아 위치 비교가 어렵습니다.",
      "my_swing": "내 스윙: 공 미탐지",
      "compare_swing": "비교 스윙: 공 미탐지",
      "difference": "노란/연두색 공이 선명하게 보이는 영상을 사용하면 임팩트 위치를 비교할 수 있습니다.",
      "how_to_match": [],
    }

  if not info_a["detected"]:
    return {
      "summary": "비교 스윙에서만 임팩트 시 공 위치가 확인됩니다.",
      "my_swing": "내 스윙: 공 미탐지",
      "compare_swing": _describe_ball(info_b),
      "difference": "내 스윙 영상에서 공이 잘 보이도록 촬영하면 타격점 비교가 가능합니다.",
      "how_to_match": [_how_to_match_ball(None, info_b)],
    }

  if not info_b["detected"]:
    return {
      "summary": "내 스윙에서만 임팩트 시 공 위치가 확인됩니다.",
      "my_swing": _describe_ball(info_a),
      "compare_swing": "비교 스윙: 공 미탐지",
      "difference": "비교 스윙 영상에서 공이 잘 보이도록 촬영하면 타격점 비교가 가능합니다.",
      "how_to_match": [],
    }

  diff_parts = []
  how_to = []

  dx = info_b["rel_x"] - info_a["rel_x"]
  dy = info_b["rel_y"] - info_a["rel_y"]

  if abs(dx) > 0.08:
    if dx > 0:
      diff_parts.append("비교 스윙은 공을 몸의 더 바깥쪽(옆)에서 맞춥니다")
      how_to.append("임팩트 시 공을 몸 바깥쪽(비교 스윙처럼 옆)으로 맞추세요.")
    else:
      diff_parts.append("내 스윙은 공을 몸의 더 바깥쪽에서 맞춥니다")
      how_to.append("임팩트 시 공을 몸 안쪽(비교 스윙처럼)으로 맞추세요.")

  if abs(dy) > 0.06:
    if dy > 0:
      diff_parts.append("비교 스윙은 공을 더 낮은 위치에서 맞춥니다")
      how_to.append("타격점을 비교 스윙처럼 조금 더 낮게 맞추세요.")
    else:
      diff_parts.append("내 스윙은 공을 더 낮은 위치에서 맞춥니다")
      how_to.append("타격점을 비교 스윙처럼 조금 더 높게 맞추세요.")

  wd_a = info_a.get("wrist_distance")
  wd_b = info_b.get("wrist_distance")
  if wd_a and wd_b and abs(wd_b - wd_a) > 0.1:
    if wd_b > wd_a:
      diff_parts.append("비교 스윙은 손목에서 더 멀리 떨어진 지점에서 맞춥니다")
      how_to.append("공을 손목에서 조금 더 멀리(팔을 더 뻗은 위치)에서 맞추세요.")
    else:
      diff_parts.append("내 스윙은 손목에서 더 멀리 떨어진 지점에서 맞춥니다")
      how_to.append("공을 손목에 조금 더 가깝게(비교 스윙처럼) 맞추세요.")

  if not diff_parts:
    diff_parts.append("임팩트 시 공 위치가 두 스윙 모두 비슷합니다")
    how_to.append("현재 타격점을 유지하세요.")

  return {
    "summary": ". ".join(diff_parts) + ".",
    "my_swing": _describe_ball(info_a),
    "compare_swing": _describe_ball(info_b),
    "difference": ". ".join(diff_parts) + ".",
    "how_to_match": how_to,
  }


def _describe_ball(info: dict) -> str:
  if not info.get("detected"):
    return "공 미탐지"
  parts = []
  if info["rel_x"] > 0.15:
    parts.append("몸 바깥쪽")
  elif info["rel_x"] < -0.15:
    parts.append("몸 안쪽")
  else:
    parts.append("몸 중앙 앞")

  if info["rel_y"] < 0.35:
    parts.append("높은 타격")
  elif info["rel_y"] > 0.55:
    parts.append("낮은 타격")
  else:
    parts.append("중간 높이 타격")

  wd = info.get("wrist_distance")
  if wd is not None:
    if wd > 0.45:
      parts.append("손목에서 멀리")
    elif wd < 0.25:
      parts.append("손목에 가깝게")
    else:
      parts.append("손목 앞 적정 거리")

  return " · ".join(parts)


def _how_to_match_ball(info_a: dict | None, info_b: dict) -> str:
  if not info_b.get("detected"):
    return "비교 스윙의 타격점을 영상에서 확인한 뒤 같은 위치를 목표로 맞추세요."
  return f"비교 스윙처럼 {_describe_ball(info_b)} 위치를 목표로 맞추세요."
