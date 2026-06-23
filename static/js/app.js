const PHASE_COLORS = ["#a78bfa", "#fb923c", "#34d399"];
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

  const form = new FormData();
  form.append("swing_a", fileA);
  form.append("swing_b", fileB);

  try {
    const res = await fetch(`${API_BASE}/api/analyze`, { method: "POST", body: form });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `서버 오류 (${res.status})`);
    }
    analysisData = await res.json();
    renderResults();
  } catch (err) {
    alert(`분석 실패: ${err.message}`);
  } finally {
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
