# 테니스 스윙 비교 프로그램

두 개의 테니스 스윙 영상을 업로드하면, 프레임 단위로 분석하여 동일한 스윙 단계별로 관절 스켈레톤 애니메이션을 비교할 수 있습니다.

## 기능

1. **듀얼 영상 업로드** — 내 현재 스윙 + 비교할 스윙
2. **4단계 스윙 분할**
   - 준비 (Preparation)
   - 테이크백 (Takeback)
   - 임팩트 (Impact)
   - 팔로우스루 (Follow-through)
3. **관절 스켈레톤 애니메이션** — MediaPipe Pose로 머리, 어깨, 팔, 다리 관절 추출
4. **라켓 & 공 표시** — 손목-팔꿈치 방향으로 라켓 추정, 타격 목표(공) 및 이상적 타격 존 표시

## 설치 및 실행

```bash
pip install -r requirements.txt
python run.py
```

브라우저에서 http://localhost:8000 접속

## 사용법

1. "내 현재 스윙"과 "비교할 스윙" 영상을 각각 업로드 (MP4, AVI, MOV, WEBM)
2. **분석 시작** 클릭
3. 상단 탭에서 스윙 단계(준비, 백스윙 등)를 선택하여 양쪽 스켈레톤 비교
4. 슬라이더 또는 재생 버튼으로 프레임 단위 애니메이션 확인

## 기술 스택

- **Backend**: FastAPI, MediaPipe Pose, OpenCV
- **Frontend**: HTML/CSS/JS, Canvas 2D

## 참고 문헌

- Knudson & Bahamonde (2001) — 포핸드 4~5단계 분류
- PMC Biomechanical Analysis of Tennis Forehand Strokes — 백스윙, 전진 가속, 포스윙 단계
