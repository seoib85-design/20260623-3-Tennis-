"""스윙 단계별 관절·동작 차이 비교 및 구체적 교정 제안."""

from __future__ import annotations

import math


def compare_swings(swing_a: dict, swing_b: dict) -> list[dict]:
  comparisons = []
  phases_a = {p["id"]: p for p in swing_a["phases"]}
  phases_b = {p["id"]: p for p in swing_b["phases"]}

  for phase_def in swing_a.get("phase_definitions") or []:
    pid = phase_def["id"]
    pa = phases_a.get(pid)
    pb = phases_b.get(pid)
    if not pa or not pb:
      continue

    ma = _phase_metrics(pa["frames"], swing_a["dominant_hand"])
    mb = _phase_metrics(pb["frames"], swing_b["dominant_hand"])
    narrative = _build_narrative(phase_def, ma, mb)

    comparisons.append(
      {
        "phase_id": pid,
        "name_ko": phase_def["name_ko"],
        "name_en": phase_def["name_en"],
        "brief_summary": narrative["brief_summary"],
        "how_to_match": narrative["how_to_match"],
      }
    )

  return comparisons


def _avg(vals: list[float]) -> float:
  return sum(vals) / len(vals) if vals else 0.0


def _angle(ax, ay, bx, by, cx, cy) -> float:
  v1x, v1y = ax - bx, ay - by
  v2x, v2y = cx - bx, cy - by
  dot = v1x * v2x + v1y * v2y
  m1 = math.hypot(v1x, v1y)
  m2 = math.hypot(v2x, v2y)
  if m1 < 1e-6 or m2 < 1e-6:
    return 0.0
  return math.degrees(math.acos(max(-1.0, min(1.0, dot / (m1 * m2)))))


def _body_scale(lm: dict) -> float:
  scales = []
  if "left_shoulder" in lm and "left_ankle" in lm:
    s, a = lm["left_shoulder"], lm["left_ankle"]
    scales.append(math.hypot(s["x"] - a["x"], s["y"] - a["y"]))
  if "right_shoulder" in lm and "right_ankle" in lm:
    s, a = lm["right_shoulder"], lm["right_ankle"]
    scales.append(math.hypot(s["x"] - a["x"], s["y"] - a["y"]))
  return _avg(scales) if scales else 1.0


def _hip_width(lm: dict) -> float:
  if "left_hip" in lm and "right_hip" in lm:
    return abs(lm["left_hip"]["x"] - lm["right_hip"]["x"])
  return 1.0


def _phase_metrics(frames: list[dict], hand: str) -> dict:
  if not frames:
    return {}

  wrist_k = f"{hand}_wrist"
  elbow_k = f"{hand}_elbow"
  shoulder_k = f"{hand}_shoulder"

  stance_ratios, knee_flex, elbow_flex = [], [], []
  shoulder_turns, arm_reaches, wrist_travels = [], [], []

  prev_wrist = None

  for frame in frames:
    lm = frame.get("landmarks", {})
    scale = _body_scale(lm)
    hip_w = _hip_width(lm)

    if "left_ankle" in lm and "right_ankle" in lm and hip_w > 1:
      ankle_w = abs(lm["left_ankle"]["x"] - lm["right_ankle"]["x"])
      stance_ratios.append(ankle_w / hip_w)

    if all(k in lm for k in ("left_hip", "left_knee", "left_ankle")):
      knee_flex.append(
        _angle(
          lm["left_hip"]["x"], lm["left_hip"]["y"],
          lm["left_knee"]["x"], lm["left_knee"]["y"],
          lm["left_ankle"]["x"], lm["left_ankle"]["y"],
        )
      )

    if all(k in lm for k in (shoulder_k, elbow_k, wrist_k)):
      elbow_flex.append(
        _angle(
          lm[shoulder_k]["x"], lm[shoulder_k]["y"],
          lm[elbow_k]["x"], lm[elbow_k]["y"],
          lm[wrist_k]["x"], lm[wrist_k]["y"],
        )
      )
      if "left_hip" in lm and "right_hip" in lm:
        hip_mid_x = (lm["left_hip"]["x"] + lm["right_hip"]["x"]) / 2
        hip_mid_y = (lm["left_hip"]["y"] + lm["right_hip"]["y"]) / 2
        shoulder = lm[shoulder_k]
        shoulder_turns.append(abs(shoulder["x"] - hip_mid_x) / scale)
        wrist = lm[wrist_k]
        arm_reaches.append(
          math.hypot(wrist["x"] - hip_mid_x, wrist["y"] - hip_mid_y) / scale
        )

    if wrist_k in lm:
      wrist = lm[wrist_k]
      if prev_wrist and scale > 1:
        wrist_travels.append(
          math.hypot(wrist["x"] - prev_wrist["x"], wrist["y"] - prev_wrist["y"]) / scale
        )
      prev_wrist = wrist

  return {
    "frame_count": len(frames),
    "stance_ratio": _avg(stance_ratios),
    "knee_flex": _avg(knee_flex),
    "elbow_flex": _avg(elbow_flex),
    "shoulder_turn": _avg(shoulder_turns),
    "arm_reach": _avg(arm_reaches),
    "max_wrist_travel": max(wrist_travels) if wrist_travels else 0,
  }


def _is_different(va: float, vb: float, threshold: float = 0.10) -> bool:
  base = max(abs(va), abs(vb), 1e-6)
  return abs(vb - va) / base >= threshold


def _angle_different(va: float, vb: float, deg: float = 8.0) -> bool:
  return abs(vb - va) >= deg


def _diff_level_ratio(va: float, vb: float) -> str:
  base = max(abs(va), abs(vb), 1e-6)
  ratio = abs(vb - va) / base
  if ratio < 0.10:
    return ""
  if ratio < 0.22:
    return "조금 "
  if ratio < 0.38:
    return ""
  return "많이 "


def _movement_compare(va: float, vb: float, text: str) -> str | None:
  if not _is_different(va, vb):
    return None
  level = _diff_level_ratio(va, vb)
  who = "비교 스윙이" if vb > va else "내 스윙이"
  return f"{who} {level}{text}"


def _angle_compare(va: float, vb: float, bent_text: str, straight_text: str) -> str | None:
  if not _angle_different(va, vb):
    return None
  level = "많이 " if abs(vb - va) > 25 else ("조금 " if abs(vb - va) > 15 else "")
  who = "비교 스윙이" if vb < va else "내 스윙이"
  text = bent_text if vb < va else straight_text
  return f"{who} {level}{text}"


def _action_items(pid: str, ma: dict, mb: dict) -> list[str]:
  """내 스윙을 비교 스윙에 맞추기 위한 구체적 교정 항목."""
  items: list[str] = []

  if pid == "preparation":
    if _is_different(ma.get("stance_ratio", 0), mb.get("stance_ratio", 0)):
      if mb.get("stance_ratio", 0) > ma.get("stance_ratio", 0):
        items.append("양발 간격을 비교 스윙처럼 어깨보다 넓게 벌리세요.")
      else:
        items.append("양발 간격을 비교 스윙처럼 조금 더 좁혀 안정적으로 서세요.")

    if _angle_different(ma.get("knee_flex", 0), mb.get("knee_flex", 0)):
      if mb.get("knee_flex", 0) < ma.get("knee_flex", 0):
        items.append("무릎을 비교 스윙처럼 더 굽혀 하체에 체중을 실으세요.")
      else:
        items.append("무릎을 비교 스윙처럼 조금 더 펴서 상체를 세우세요.")

    if not items:
      items.append("준비 자세는 비교 스윙과 비슷합니다. 현재 스탠스를 유지하세요.")

  elif pid == "takeback":
    if _is_different(ma.get("shoulder_turn", 0), mb.get("shoulder_turn", 0)):
      if mb.get("shoulder_turn", 0) > ma.get("shoulder_turn", 0):
        items.append("어깨와 엉덩이를 분리해 상체를 비교 스윙처럼 더 돌리세요.")
      else:
        items.append("상체 회전을 비교 스윙처럼 조금 줄이고 컴팩트하게 가져가세요.")

    if _angle_different(ma.get("elbow_flex", 0), mb.get("elbow_flex", 0)):
      if mb.get("elbow_flex", 0) < ma.get("elbow_flex", 0):
        items.append("팔꿈치를 비교 스윙처럼 굽힌 채 라켓을 몸 가까이 당기세요.")
      else:
        items.append("팔꿈치를 비교 스윙처럼 조금 더 펴서 라켓을 멀리 보내세요.")

    if _is_different(ma.get("arm_reach", 0), mb.get("arm_reach", 0)):
      if mb.get("arm_reach", 0) > ma.get("arm_reach", 0):
        items.append("테이크백 시 타격 팔을 비교 스윙처럼 몸 뒤쪽으로 더 빼내세요.")
      else:
        items.append("테이크백 폭을 비교 스윙처럼 조금 줄여 동작을 짧게 가져가세요.")

    if not items:
      items.append("테이크백 동작은 비교 스윙과 비슷합니다. 현재 궤적을 유지하세요.")

  elif pid == "impact":
    if _is_different(ma.get("max_wrist_travel", 0), mb.get("max_wrist_travel", 0)):
      if mb.get("max_wrist_travel", 0) > ma.get("max_wrist_travel", 0):
        items.append("임팩트 직전 손목을 비교 스윙처럼 더 빠르게 가속하세요.")
      else:
        items.append("손목 가속을 비교 스윙처럼 조금 줄여 타이밍에 맞추세요.")

    if _angle_different(ma.get("elbow_flex", 0), mb.get("elbow_flex", 0)):
      if mb.get("elbow_flex", 0) > ma.get("elbow_flex", 0):
        items.append("맞히는 순간 팔꿈치를 비교 스윙처럼 펴서 타격점 앞에서 맞추세요.")
      else:
        items.append("임팩트 시 팔꿈치를 비교 스윙처럼 조금 더 굽혀 컨트롤하세요.")

    if _is_different(ma.get("arm_reach", 0), mb.get("arm_reach", 0)):
      if mb.get("arm_reach", 0) > ma.get("arm_reach", 0):
        items.append("임팩트 때 팔을 비교 스윙처럼 몸 앞쪽으로 더 뻗어 맞추세요.")
      else:
        items.append("임팩트 위치를 비교 스윙처럼 몸에 조금 더 가깝게 가져오세요.")

    if not items:
      items.append("임팩트 동작은 비교 스윙과 비슷합니다. 현재 타격 타이밍을 유지하세요.")

  elif pid == "follow_through":
    if _is_different(ma.get("arm_reach", 0), mb.get("arm_reach", 0)):
      if mb.get("arm_reach", 0) > ma.get("arm_reach", 0):
        items.append("타격 후 팔을 비교 스윙처럼 길게 뻗어 마무리하세요.")
      else:
        items.append("팔로우스루를 비교 스윙처럼 조금 더 짧고 컴팩트하게 마무리하세요.")

    if _is_different(ma.get("shoulder_turn", 0), mb.get("shoulder_turn", 0)):
      if mb.get("shoulder_turn", 0) > ma.get("shoulder_turn", 0):
        items.append("마무리까지 상체 회전을 비교 스윙처럼 더 이어가세요.")
      else:
        items.append("상체 회전을 비교 스윙처럼 조금 일찍 멈추고 균형을 잡으세요.")

    fc_a, fc_b = ma.get("frame_count", 0), mb.get("frame_count", 0)
    if fc_a > 0 and fc_b > 0 and abs(fc_b - fc_a) / max(fc_a, fc_b) >= 0.15:
      if fc_b > fc_a:
        items.append("팔로우스루를 비교 스윙처럼 더 길게 이어가며 감속하세요.")
      else:
        items.append("팔로우스루를 비교 스윙처럼 조금 더 빠르게 마무리하세요.")

    if not items:
      items.append("팔로우스루는 비교 스윙과 비슷합니다. 현재 마무리 동작을 유지하세요.")

  return items


def _build_narrative(phase: dict, ma: dict, mb: dict) -> dict:
  pid = phase["id"]
  name = phase["name_ko"]
  differences: list[str] = []

  if pid == "preparation":
    for d in [
      _movement_compare(ma.get("stance_ratio", 0), mb.get("stance_ratio", 0), "다리를 벌려 스탠스를 잡습니다"),
      _angle_compare(ma.get("knee_flex", 0), mb.get("knee_flex", 0),
                     "무릎을 굽혀 하체에 체중을 싣습니다", "다리를 펴고 섭니다"),
    ]:
      if d:
        differences.append(d)

  elif pid == "takeback":
    for d in [
      _movement_compare(ma.get("shoulder_turn", 0), mb.get("shoulder_turn", 0), "상체를 돌려 어깨·엉덩이 분리 회전을 만듭니다"),
      _angle_compare(ma.get("elbow_flex", 0), mb.get("elbow_flex", 0),
                     "팔꿈치를 굽힌 채 팔을 당깁니다", "팔을 펴서 멀리 보냅니다"),
      _movement_compare(ma.get("arm_reach", 0), mb.get("arm_reach", 0), "팔을 몸에서 멀리 빼냅니다"),
    ]:
      if d:
        differences.append(d)

  elif pid == "impact":
    for d in [
      _movement_compare(ma.get("max_wrist_travel", 0), mb.get("max_wrist_travel", 0), "손목을 빠르게 움직여 가속합니다"),
      _angle_compare(ma.get("elbow_flex", 0), mb.get("elbow_flex", 0),
                     "팔꿈치를 굽힌 채 맞춥니다", "팔을 펴서 맞춥니다"),
      _movement_compare(ma.get("arm_reach", 0), mb.get("arm_reach", 0), "팔을 몸 앞쪽으로 뻗습니다"),
    ]:
      if d:
        differences.append(d)

  elif pid == "follow_through":
    for d in [
      _movement_compare(ma.get("arm_reach", 0), mb.get("arm_reach", 0), "팔을 길게 뻗어 마무리합니다"),
      _movement_compare(ma.get("shoulder_turn", 0), mb.get("shoulder_turn", 0), "상체 회전을 이어갑니다"),
    ]:
      if d:
        differences.append(d)
    fc_a, fc_b = ma.get("frame_count", 0), mb.get("frame_count", 0)
    if fc_a > 0 and fc_b > 0 and abs(fc_b - fc_a) / max(fc_a, fc_b) >= 0.15:
      level = _diff_level_ratio(fc_a, fc_b)
      who = "비교 스윙이" if fc_b > fc_a else "내 스윙이"
      differences.append(f"{who} {level}팔로우스루를 길게 이어갑니다.")

  if not differences:
    differences.append(f"{name} 단계에서는 두 스윙의 관절 움직임이 비슷합니다.")

  how_to_match = _action_items(pid, ma, mb)

  brief_parts = differences[:2]
  brief_summary = f"{name}: " + " · ".join(brief_parts)

  return {
    "brief_summary": brief_summary,
    "how_to_match": how_to_match,
  }
