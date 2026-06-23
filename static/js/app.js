const PHASE_COLORS = ["#a78bfa", "#fb923c", "#34d399"];

(function () {
  const host = location.hostname;
  if (host.endsWith(".vercel.app") || host.endsWith(".github.io")) {
    window.USE_BROWSER_ANALYZER = true;
    window.API_BASE = "";
  }
})();

const API_BASE = window.API_BASE || "";

const $ = (sel) => document.querySelector(sel);

let analysisData = null;
let rendererA, rendererB;
let animTimers = { all: false, _allInterval: null };

function init() {
  rendererA = new SkeletonRenderer($("#canvas-a"));
  rendererB = new SkeletonRenderer($("#canvas-b"));

  $("#video-a").addEventListener("change", (e) => handleUpload(e, "a"));
  $("#video-b").addEventListener("change", (e) => handleUpload(e, "b"));
  $("#analyze-btn").addEventListener("click", analyze);
  $("#play-all").addEventListener("click", togglePlayAll);
  $("#slider-a").addEventListener("input", (e) => showFrame("a", +e.target.value));
  $("#slider-b").addEventListener("input", (e) => showFrame("b", +e.target.value));

  if (!window.USE_BROWSER_ANALYZER) {
    checkApiHealth();
  }
}

async function checkApiHealth() {
  if (!API_BASE && location.protocol === "file:") return;

  try {
    const res = await fetch(`${API_BASE}/api/health`, { method: "GET" });
    if (!res.ok) {
      showApiWarning(`API 서버 응답 오류 (${res.status}). Render 백엔드 배포가 필요합니다.`);
    }
  } catch {
    showApiWarning(
      "API 서버에 연결할 수 없습니다. Render에서 백엔드를 배포했는지 확인하세요."
    );
  }
}

function setLoadingMessage(message) {
  const el = $("#loading p");
  if (el) el.textContent = message;
}

function showApiWarning(message) {
  const section = $(".upload-section");
  if (!section || document.getElementById("api-warning")) return;

  const banner = document.createElement("div");
  banner.id = "api-warning";
  banner.className = "api-warning";
  banner.textContent = message;
  section.prepend(banner);
}

function handleUpload(e, side) {
  const file = e.target.files[0];
  if (!file) return;

  const preview = $(`#preview-${side}`);
  const box = $(`#upload-${side}`);
  const nameEl = $(`#name-${side}`);

  preview.src = URL.createObjectURL(file);
  box.classList.add("has-file");
  nameEl.textContent = file.name;
  checkReady();
}

function checkReady() {
  const a = $("#video-a").files[0];
  const b = $("#video-b").files[0];
  $("#analyze-btn").disabled = !(a && b);
}

async function analyze() {
  const fileA = $("#video-a").files[0];
  const fileB = $("#video-b").files[0];
  if (!fileA || !fileB) return;

  $("#analyze-btn").disabled = true;
  $("#loading").classList.remove("hidden");
  setLoadingMessage(
    window.USE_BROWSER_ANALYZER
      ? "브라우저에서 포즈 분석 중… (처음엔 AI 모델 로딩)"
      : "포즈 분석 및 스윙 단계 분할 중..."
  );

  try {
    if (window.USE_BROWSER_ANALYZER) {
      analysisData = await analyzeInBrowser(fileA, fileB, setLoadingMessage);
      renderResults();
      return;
    }

    const form = new FormData();
    form.append("swing_a", fileA);
    form.append("swing_b", fileB);

    const res = await fetch(`${API_BASE}/api/analyze`, { method: "POST", body: form });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `서버 오류 (${res.status})`);
    }
    analysisData = await res.json();
    renderResults();
  } catch (err) {
    const hint = window.USE_BROWSER_ANALYZER
      ? ""
      : API_BASE
        ? " Render API가 배포되어 있는지, cold start(최대 1분) 후 다시 시도해 보세요."
        : "";
    alert(`분석 실패: ${err.message}${hint}`);
  } finally {
    setLoadingMessage("포즈 분석 및 스윙 단계 분할 중...");
    $("#loading").classList.add("hidden");
    $("#analyze-btn").disabled = false;
  }
}

function renderResults() {
  $("#phases-info").classList.remove("hidden");
  $("#comparison").classList.remove("hidden");
  $("#timeline").classList.remove("hidden");
  $("#impact-ball").classList.remove("hidden");

  renderPhaseLegend();
  renderTimeline();
  renderImpactBall();
  renderImpactTiming();
  setupComparison();
}

function renderImpactTiming() {
  const el = $("#impact-timing");
  const swingA = analysisData.swing_a;
  const swingB = analysisData.swing_b;
  const frameA = swingA.impact_frame ?? 0;
  const frameB = swingB.impact_frame ?? 0;
  const fpsA = swingA.fps || 30;
  const fpsB = swingB.fps || 30;
  const timeA = frameA / fpsA;
  const timeB = frameB / fpsB;
  const frameDiff = frameB - frameA;
  const timeDiff = timeB - timeA;

  let diffText;
  if (frameDiff === 0) {
    diffText = "동일한 프레임에서 임팩트가 감지됩니다.";
  } else if (frameDiff > 0) {
    diffText = `비교 스윙이 ${Math.abs(frameDiff)}프레임(${Math.abs(timeDiff).toFixed(2)}초) 늦게 임팩트합니다.`;
  } else {
    diffText = `내 스윙이 ${Math.abs(frameDiff)}프레임(${Math.abs(timeDiff).toFixed(2)}초) 늦게 임팩트합니다.`;
  }

  el.innerHTML = `
    <div class="impact-timing-grid">
      <span><strong>내 스윙</strong> 프레임 ${frameA + 1} · ${timeA.toFixed(2)}초</span>
      <span><strong>비교 스윙</strong> 프레임 ${frameB + 1} · ${timeB.toFixed(2)}초</span>
    </div>
    <p class="impact-timing-diff">${diffText}</p>
  `;
}

function renderImpactBall() {
  const el = $("#impact-ball-content");
  const cmp = analysisData.impact_ball_comparison;
  if (!cmp) {
    el.innerHTML = "<p class='summary'>임팩트 공 비교 데이터가 없습니다.</p>";
    return;
  }

  let html = `<p class="summary impact-summary">${cmp.summary}</p>`;
  html += `<div class="impact-detail-grid">`;
  html += `<div class="impact-detail"><strong>내 스윙</strong><p>${cmp.my_swing}</p></div>`;
  html += `<div class="impact-detail"><strong>비교 스윙</strong><p>${cmp.compare_swing}</p></div>`;
  html += `</div>`;
  html += `<p class="impact-diff"><strong>차이점</strong> ${cmp.difference}</p>`;

  if (cmp.how_to_match?.length) {
    html += "<p class='rec-title'>비교 스윙처럼 맞추려면</p><ul class='rec-list'>";
    cmp.how_to_match.forEach((r) => { html += `<li>${r}</li>`; });
    html += "</ul>";
  }

  el.innerHTML = html;
}

function renderPhaseLegend() {
  const el = $("#phase-legend");
  el.innerHTML = "";
  const defs = analysisData.phase_definitions;
  defs.forEach((p, i) => {
    const chip = document.createElement("div");
    chip.className = "phase-chip";
    chip.style.background = `${PHASE_COLORS[i]}22`;
    chip.style.borderColor = PHASE_COLORS[i];
    chip.style.color = PHASE_COLORS[i];
    chip.innerHTML = `<strong>${p.name_ko}</strong> (${p.name_en})`;
    el.appendChild(chip);
  });
}

function setupCanvasSize(canvas, videoWidth, videoHeight) {
  const maxW = 360;
  const scale = Math.min(1, maxW / videoWidth);
  canvas.width = videoWidth;
  canvas.height = videoHeight;
  canvas.style.width = `${Math.round(videoWidth * scale)}px`;
  canvas.style.height = `${Math.round(videoHeight * scale)}px`;
}

function setupComparison() {
  stopPlayAll();

  const swingA = analysisData.swing_a;
  const swingB = analysisData.swing_b;

  setupCanvasSize($("#canvas-a"), swingA.width, swingA.height);
  setupCanvasSize($("#canvas-b"), swingB.width, swingB.height);

  setupSide("a", swingA.all_frames, swingA.skeleton_connections);
  setupSide("b", swingB.all_frames, swingB.skeleton_connections);

  window._fps_a = swingA.fps || 30;
  window._fps_b = swingB.fps || 30;

  $("#slider-a").value = 0;
  $("#slider-b").value = 0;
  showFrame("a", 0);
  showFrame("b", 0);
}

function setupSide(side, frames, connections) {
  const slider = $(`#slider-${side}`);
  const max = Math.max(frames.length - 1, 0);
  slider.max = max;
  slider.value = 0;
  $(`#frame-info-${side}`).textContent = `1 / ${frames.length}`;

  const canvas = $(`#canvas-${side}`);
  const renderer = side === "a" ? rendererA : rendererB;

  const render = (idx) => {
    if (frames[idx]) {
      renderer.render(frames[idx], connections, canvas.width, canvas.height);
    }
  };

  render(0);

  window[`_frames_${side}`] = frames;
  window[`_render_${side}`] = render;
}

function showFrame(side, idx) {
  const render = window[`_render_${side}`];
  const frames = window[`_frames_${side}`];
  if (render && frames) {
    render(idx);
    const isImpact = frames[idx]?.is_impact;
    const label = isImpact ? " · 임팩트" : "";
    $(`#frame-info-${side}`).textContent = `${idx + 1} / ${frames.length}${label}`;
  }
}

function togglePlayAll() {
  if (animTimers.all) {
    stopPlayAll();
    return;
  }
  startPlayAll();
}

function startPlayAll() {
  const framesA = window._frames_a;
  const framesB = window._frames_b;
  if (!framesA?.length && !framesB?.length) return;

  const maxLen = Math.max(framesA?.length || 0, framesB?.length || 0);
  const fps = Math.max(window._fps_a || 30, window._fps_b || 30);
  let idx = 0;

  $("#play-all").textContent = "⏸ 전체 정지";
  animTimers.all = true;

  const tick = () => {
    if (idx >= maxLen) {
      stopPlayAll();
      return;
    }
    if (framesA && idx < framesA.length) {
      $("#slider-a").value = idx;
      showFrame("a", idx);
    }
    if (framesB && idx < framesB.length) {
      $("#slider-b").value = idx;
      showFrame("b", idx);
    }
    idx += 1;
  };

  tick();
  animTimers._allInterval = setInterval(tick, 1000 / fps);
}

function stopPlayAll() {
  if (animTimers._allInterval) {
    clearInterval(animTimers._allInterval);
    animTimers._allInterval = null;
  }
  animTimers.all = false;
  const btn = $("#play-all");
  if (btn) btn.textContent = "▶ 전체 재생 (양쪽 동시)";
}

function renderTimeline() {
  buildTimelineBar("tl-a", analysisData.swing_a.phases);
  buildTimelineBar("tl-b", analysisData.swing_b.phases);
}

function buildTimelineBar(elId, phases) {
  const bar = $(`#${elId}`);
  bar.innerHTML = "";
  const total = phases.reduce((s, p) => s + p.frame_count, 0);

  phases.forEach((p, i) => {
    const seg = document.createElement("div");
    seg.className = "tl-segment";
    seg.style.flex = p.frame_count;
    seg.style.background = PHASE_COLORS[i];
    seg.title = `${p.name_ko}: 프레임 ${p.start_frame}~${p.end_frame}`;
    if (p.frame_count > total * 0.08) {
      seg.textContent = p.name_ko;
    }
    bar.appendChild(seg);
  });
}

document.addEventListener("DOMContentLoaded", init);

/* ===== 브라우저 포즈 분석 (Vercel용) ===== */
const BA_PHASES = [
  { id: "takeback", name_ko: "테이크백", name_en: "Takeback" },
  { id: "impact", name_ko: "임팩트", name_en: "Impact" },
  { id: "follow_through", name_ko: "팔로우스루", name_en: "Follow-through" },
];
const BA_CONNECTIONS = [
  ["head", "left_shoulder"], ["head", "right_shoulder"],
  ["left_shoulder", "right_shoulder"], ["left_shoulder", "left_elbow"],
  ["left_elbow", "left_wrist"], ["right_shoulder", "right_elbow"],
  ["right_elbow", "right_wrist"], ["left_shoulder", "left_hip"],
  ["right_shoulder", "right_hip"], ["left_hip", "right_hip"],
  ["left_hip", "left_knee"], ["left_knee", "left_ankle"],
  ["right_hip", "right_knee"], ["right_knee", "right_ankle"],
];
const BA_INDICES = {
  0: "nose", 2: "left_eye", 5: "right_eye", 7: "left_ear", 8: "right_ear",
  11: "left_shoulder", 12: "right_shoulder", 13: "left_elbow", 14: "right_elbow",
  15: "left_wrist", 16: "right_wrist", 23: "left_hip", 24: "right_hip",
  25: "left_knee", 26: "right_knee", 27: "left_ankle", 28: "right_ankle",
};
let baLandmarkerPromise = null;

async function baGetLandmarker() {
  if (!baLandmarkerPromise) {
    baLandmarkerPromise = (async () => {
      const { PoseLandmarker, FilesetResolver } = await import(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm"
      );
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );
      const model =
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
      for (const delegate of ["GPU", "CPU"]) {
        try {
          return await PoseLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: model, delegate },
            runningMode: "VIDEO",
            numPoses: 1,
          });
        } catch { /* next */ }
      }
      throw new Error("포즈 AI 모델을 초기화할 수 없습니다.");
    })();
  }
  return baLandmarkerPromise;
}

function baWaitVideo(video) {
  return new Promise((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("영상을 불러올 수 없습니다."));
  });
}

function baSeek(video, time) {
  return new Promise((resolve) => {
    const done = () => { video.removeEventListener("seeked", done); resolve(); };
    video.addEventListener("seeked", done);
    video.currentTime = Math.min(time, Math.max(0, video.duration - 0.001));
    if (!video.seeking) done();
  });
}

function baExtract(result, w, h) {
  const out = {};
  const pose = result.landmarks?.[0];
  if (!pose) return out;
  for (const [idx, name] of Object.entries(BA_INDICES)) {
    const lm = pose[Number(idx)];
    if (!lm) continue;
    out[name] = { x: lm.x * w, y: lm.y * h, z: lm.z, visibility: lm.visibility ?? 1 };
  }
  return out;
}

function baHead(raw) {
  const parts = ["nose", "left_eye", "right_eye", "left_ear", "right_ear"]
    .map((k) => raw[k]).filter((p) => p && (p.visibility ?? 1) > 0.2);
  if (!parts.length) return raw.nose ? { ...raw.nose } : null;
  return {
    x: parts.reduce((s, p) => s + p.x, 0) / parts.length,
    y: parts.reduce((s, p) => s + p.y, 0) / parts.length,
    z: parts.reduce((s, p) => s + (p.z ?? 0), 0) / parts.length,
    visibility: Math.max(...parts.map((p) => p.visibility ?? 1)),
  };
}

function baDisplay(raw) {
  const lm = {};
  const head = baHead(raw);
  if (head) lm.head = head;
  for (const name of Object.values(BA_INDICES)) {
    if (["nose", "left_eye", "right_eye", "left_ear", "right_ear"].includes(name)) continue;
    if (raw[name]) lm[name] = raw[name];
  }
  return lm;
}

function baFlip(lm, w, h) {
  const out = {};
  for (const [name, pt] of Object.entries(lm || {})) {
    out[name] = { ...pt, x: w - pt.x, y: h - pt.y };
  }
  return out;
}

function baDominant(frames) {
  let l = 0, r = 0;
  for (let i = 1; i < frames.length; i++) {
    const p = frames[i - 1].landmarks, c = frames[i].landmarks;
    if (p.left_wrist && c.left_wrist) l += Math.hypot(c.left_wrist.x - p.left_wrist.x, c.left_wrist.y - p.left_wrist.y);
    if (p.right_wrist && c.right_wrist) r += Math.hypot(c.right_wrist.x - p.right_wrist.x, c.right_wrist.y - p.right_wrist.y);
  }
  return r >= l ? "right" : "left";
}

function baSmooth(v) {
  if (v.length < 5) return v;
  const out = new Array(v.length).fill(0);
  for (let i = 0; i < v.length; i++) {
    let s = 0, n = 0;
    for (let j = i - 2; j <= i + 2; j++) if (j >= 0 && j < v.length) { s += v[j]; n++; }
    out[i] = s / n;
  }
  return out;
}

function baVel(frames, key) {
  const v = new Array(frames.length).fill(0);
  for (let i = 1; i < frames.length; i++) {
    const p = frames[i - 1].landmarks[key], c = frames[i].landmarks[key];
    if (p && c) v[i] = Math.hypot(c.x - p.x, c.y - p.y);
  }
  return baSmooth(v);
}

function baSegment(frames, hand) {
  const key = `${hand}_wrist`;
  const vel = baVel(frames, key);
  let impact = 0, max = -1;
  vel.forEach((v, i) => { if (v > max) { max = v; impact = i; } });
  const total = frames.length;
  const takebackEnd = Math.max(0, impact - 1);
  const followStart = Math.min(impact + 1, total - 1);
  const ranges = [[0, takebackEnd], [impact, impact], [followStart, total - 1]];
  const phases = BA_PHASES.map((phase, idx) => {
    const [start, end] = ranges[idx];
    const pf = frames.slice(start, end + 1);
    return { ...phase, start_frame: start, end_frame: end, frame_count: pf.length, frames: pf };
  });
  return { phases, impactFrame: impact };
}

function baNorm(frames, w, h, impact) {
  return frames.map((frame) => {
    const norm = {};
    for (const [name, pt] of Object.entries(frame.landmarks || {})) {
      norm[name] = { ...pt, nx: w ? pt.x / w : 0, ny: h ? pt.y / h : 0 };
    }
    return { ...frame, landmarks: norm, is_impact: impact !== null && frame.frame_index === impact };
  });
}

async function baAnalyzeFile(file, label, onProgress) {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  await baWaitVideo(video);

  const w = video.videoWidth, h = video.videoHeight;
  const duration = video.duration || 1;
  const count = Math.max(1, Math.min(100, Math.ceil(duration * 20)));
  const step = duration / count;
  const fps = count / duration;
  const landmarker = await baGetLandmarker();
  const rawFrames = [];
  let ts = 0;

  for (let i = 0; i < count; i++) {
    onProgress?.(`${label} 분석 중… ${Math.round(((i + 1) / count) * 100)}%`);
    await baSeek(video, i * step);
    ts += 50;
    rawFrames.push(baExtract(landmarker.detectForVideo(video, ts), w, h));
  }
  URL.revokeObjectURL(url);

  const frames = rawFrames.map((raw, i) => ({
    frame_index: i,
    timestamp: i / fps,
    landmarks: baFlip(baDisplay(raw), w, h),
  }));
  const hand = baDominant(frames);
  const seg = baSegment(frames, hand);
  const all = baNorm(frames, w, h, seg.impactFrame);

  return {
    fps, width: w, height: h, total_frames: count, dominant_hand: hand,
    impact_frame: seg.impactFrame, skeleton_connections: BA_CONNECTIONS,
    phases: seg.phases.map((p) => ({
      id: p.id, name_ko: p.name_ko, name_en: p.name_en,
      start_frame: p.start_frame, end_frame: p.end_frame, frame_count: p.frame_count,
      frames: baNorm(p.frames, w, h, seg.impactFrame),
    })),
    all_frames: all,
    impact_ball: null,
  };
}

async function analyzeInBrowser(fileA, fileB, onProgress) {
  onProgress?.("AI 모델 로딩 중… (첫 실행 10~30초)");
  await baGetLandmarker();
  const a = await baAnalyzeFile(fileA, "내 스윙", onProgress);
  const b = await baAnalyzeFile(fileB, "비교 스윙", onProgress);
  return {
    session_id: `browser-${Date.now()}`,
    phase_definitions: BA_PHASES,
    impact_ball_comparison: {
      summary: "브라우저 모드: 포즈·스윙 단계 비교는 정상, 공 탐지는 생략됩니다.",
      my_swing: "공 미탐지 (브라우저 모드)",
      compare_swing: "공 미탐지 (브라우저 모드)",
      difference: "공 비교는 로컬 서버(python run.py)에서 가능합니다.",
      how_to_match: [],
    },
    swing_a: { label: "내 스윙", ...a },
    swing_b: { label: "비교 스윙", ...b },
    aligned_phases: [],
  };
}

