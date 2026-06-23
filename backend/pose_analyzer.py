"""MediaPipe 기반 포즈 추출."""

from __future__ import annotations

import cv2
import mediapipe as mp

from backend.video_rotation import (
  detect_rotation_from_pose,
  flip_landmarks_180,
  get_video_rotation,
  rotate_landmarks,
)

_POSE_INDICES = {
  0: "nose",
  2: "left_eye",
  5: "right_eye",
  7: "left_ear",
  8: "right_ear",
  11: "left_shoulder",
  12: "right_shoulder",
  13: "left_elbow",
  14: "right_elbow",
  15: "left_wrist",
  16: "right_wrist",
  23: "left_hip",
  24: "right_hip",
  25: "left_knee",
  26: "right_knee",
  27: "left_ankle",
  28: "right_ankle",
}

JOINT_NAMES = {
  11: "left_shoulder",
  12: "right_shoulder",
  13: "left_elbow",
  14: "right_elbow",
  15: "left_wrist",
  16: "right_wrist",
  23: "left_hip",
  24: "right_hip",
  25: "left_knee",
  26: "right_knee",
  27: "left_ankle",
  28: "right_ankle",
}

SKELETON_CONNECTIONS = [
  ("head", "left_shoulder"),
  ("head", "right_shoulder"),
  ("left_shoulder", "right_shoulder"),
  ("left_shoulder", "left_elbow"),
  ("left_elbow", "left_wrist"),
  ("right_shoulder", "right_elbow"),
  ("right_elbow", "right_wrist"),
  ("left_shoulder", "left_hip"),
  ("right_shoulder", "right_hip"),
  ("left_hip", "right_hip"),
  ("left_hip", "left_knee"),
  ("left_knee", "left_ankle"),
  ("right_hip", "right_knee"),
  ("right_knee", "right_ankle"),
]


class PoseAnalyzer:
  def __init__(self):
    self._mp_pose = mp.solutions.pose
    self._pose = self._mp_pose.Pose(
      static_image_mode=False,
      model_complexity=1,
      smooth_landmarks=True,
      min_detection_confidence=0.5,
      min_tracking_confidence=0.5,
    )

  def analyze_video(self, video_path: str) -> dict:
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
      raise ValueError(f"영상을 열 수 없습니다: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    frames: list[dict] = []
    raw_frames: list[dict] = []
    frame_idx = 0

    while True:
      ret, bgr = cap.read()
      if not ret:
        break

      rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
      result = self._pose.process(rgb)

      raw_landmarks = self._extract_raw_landmarks(result, width, height)
      raw_frames.append({"landmarks": raw_landmarks})

      landmarks = self._build_display_landmarks(raw_landmarks)
      frames.append(
        {
          "frame_index": frame_idx,
          "timestamp": frame_idx / fps,
          "landmarks": landmarks,
        }
      )
      frame_idx += 1

    cap.release()

    rotation = get_video_rotation(video_path)
    if rotation == 0:
      rotation = detect_rotation_from_pose(raw_frames, width, height)

    if rotation != 0:
      corrected = []
      disp_w, disp_h = width, height
      for frame in frames:
        lm, disp_w, disp_h = rotate_landmarks(
          frame["landmarks"], width, height, rotation
        )
        corrected.append({**frame, "landmarks": lm})
      frames = corrected
      width, height = disp_w, disp_h

    frames = [
      {
        **frame,
        "landmarks": flip_landmarks_180(frame["landmarks"], width, height),
      }
      for frame in frames
    ]

    dominant_hand = self._detect_dominant_hand(frames)

    return {
      "fps": fps,
      "total_frames": total_frames,
      "width": width,
      "height": height,
      "rotation_applied": rotation,
      "frames": frames,
      "dominant_hand": dominant_hand,
      "skeleton_connections": SKELETON_CONNECTIONS,
    }

  def _extract_raw_landmarks(self, result, width: int, height: int) -> dict:
    landmarks: dict[str, dict] = {}
    if not result.pose_landmarks:
      return landmarks

    for idx, name in _POSE_INDICES.items():
      lm = result.pose_landmarks.landmark[idx]
      landmarks[name] = {
        "x": lm.x * width,
        "y": lm.y * height,
        "z": lm.z,
        "visibility": lm.visibility,
      }
    return landmarks

  def _compute_head(self, raw: dict) -> dict | None:
    parts = [
      raw[k]
      for k in ("nose", "left_eye", "right_eye", "left_ear", "right_ear")
      if k in raw and (raw[k].get("visibility", 1) > 0.2)
    ]
    if not parts:
      if "nose" in raw:
        return {**raw["nose"]}
      return None

    return {
      "x": sum(p["x"] for p in parts) / len(parts),
      "y": sum(p["y"] for p in parts) / len(parts),
      "z": sum(p.get("z", 0) for p in parts) / len(parts),
      "visibility": max(p.get("visibility", 1) for p in parts),
    }

  def _build_display_landmarks(self, raw: dict) -> dict:
    landmarks: dict[str, dict] = {}
    head = self._compute_head(raw)
    if head:
      landmarks["head"] = head
    for _, name in JOINT_NAMES.items():
      if name in raw:
        landmarks[name] = raw[name]
    return landmarks

  def _detect_dominant_hand(self, frames: list[dict]) -> str:
    left_disp = 0.0
    right_disp = 0.0

    for i in range(1, len(frames)):
      prev = frames[i - 1]["landmarks"]
      curr = frames[i]["landmarks"]
      if "left_wrist" in prev and "left_wrist" in curr:
        dx = curr["left_wrist"]["x"] - prev["left_wrist"]["x"]
        dy = curr["left_wrist"]["y"] - prev["left_wrist"]["y"]
        left_disp += (dx * dx + dy * dy) ** 0.5
      if "right_wrist" in prev and "right_wrist" in curr:
        dx = curr["right_wrist"]["x"] - prev["right_wrist"]["x"]
        dy = curr["right_wrist"]["y"] - prev["right_wrist"]["y"]
        right_disp += (dx * dx + dy * dy) ** 0.5

    return "right" if right_disp >= left_disp else "left"

  def close(self):
    self._pose.close()
