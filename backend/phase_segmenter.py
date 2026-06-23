"""
테니스 포핸드 스윙 4단계 분할.

  1. 준비 (Preparation)  - 스탠스 및 초기 자세
  2. 테이크백 (Takeback) - 라켓 후방 당기기
  3. 임팩트 (Impact)     - 공 접촉 순간
  4. 팔로우스루 (Follow-through) - 임팩트 이후 마무리
"""

from __future__ import annotations

import numpy as np

PHASES = [
  {"id": "preparation", "name_ko": "준비", "name_en": "Preparation"},
  {"id": "takeback", "name_ko": "테이크백", "name_en": "Takeback"},
  {"id": "impact", "name_ko": "임팩트", "name_en": "Impact"},
  {"id": "follow_through", "name_ko": "팔로우스루", "name_en": "Follow-through"},
]


class PhaseSegmenter:
  def segment(self, pose_data: dict) -> dict:
    frames = pose_data["frames"]
    dominant = pose_data["dominant_hand"]
    wrist_key = f"{dominant}_wrist"
    total = len(frames)

    velocities = self._compute_wrist_velocities(frames, wrist_key)
    impact_frame = int(np.argmax(velocities))
    ranges = self._phase_ranges(velocities, impact_frame, total)

    phase_segments = []
    for phase, (start, end) in zip(PHASES, ranges):
      phase_frames = frames[start : end + 1]
      phase_segments.append(
        {
          **phase,
          "start_frame": start,
          "end_frame": end,
          "frame_count": len(phase_frames),
          "frames": phase_frames,
        }
      )

    return {
      "phases": phase_segments,
      "impact_frame": impact_frame,
      "phase_definitions": PHASES,
    }

  def align_phases(self, seg_a: dict, seg_b: dict) -> dict:
    aligned = []
    for pa, pb in zip(seg_a["phases"], seg_b["phases"]):
      aligned.append(
        {
          "phase_id": pa["id"],
          "name_ko": pa["name_ko"],
          "name_en": pa["name_en"],
          "swing_a": {
            "start_frame": pa["start_frame"],
            "end_frame": pa["end_frame"],
            "frame_count": pa["frame_count"],
            "frames": pa["frames"],
          },
          "swing_b": {
            "start_frame": pb["start_frame"],
            "end_frame": pb["end_frame"],
            "frame_count": pb["frame_count"],
            "frames": pb["frames"],
          },
        }
      )
    return {"aligned_phases": aligned}

  def _compute_wrist_velocities(
    self, frames: list[dict], wrist_key: str
  ) -> np.ndarray:
    n = len(frames)
    velocities = np.zeros(n)

    for i in range(1, n):
      prev = frames[i - 1]["landmarks"].get(wrist_key)
      curr = frames[i]["landmarks"].get(wrist_key)
      if prev and curr:
        dx = curr["x"] - prev["x"]
        dy = curr["y"] - prev["y"]
        velocities[i] = (dx * dx + dy * dy) ** 0.5

    kernel = np.ones(5) / 5
    if n >= 5:
      velocities = np.convolve(velocities, kernel, mode="same")
    return velocities

  def _find_takeback_start(self, velocities: np.ndarray, impact: int) -> int:
    """임팩트 이전 손목 움직임이 시작되는 프레임."""
    if impact <= 0:
      return 0

    pre = velocities[:impact]
    if len(pre) < 3:
      return 0

    threshold = max(np.percentile(pre, 25), np.max(pre) * 0.08)
    for i in range(1, len(pre)):
      if pre[i] > threshold and np.mean(pre[i : min(i + 3, len(pre))]) > threshold:
        return i
    return max(0, impact // 4)

  def _phase_ranges(
    self, velocities: np.ndarray, impact: int, total: int
  ) -> list[tuple[int, int]]:
    if total <= 0:
      return [(0, 0), (0, 0), (0, 0), (0, 0)]

    impact = max(0, min(impact, total - 1))

    if total == 1:
      return [(0, 0), (0, 0), (0, 0), (0, 0)]

    takeback_start = self._find_takeback_start(velocities, impact)
    prep_end = max(0, takeback_start - 1)
    takeback_end = max(takeback_start, impact - 1)
    follow_start = min(impact + 1, total - 1)

    return [
      (0, prep_end),                  # 준비
      (takeback_start, takeback_end), # 테이크백
      (impact, impact),               # 임팩트
      (follow_start, total - 1),      # 팔로우스루
    ]
