const PHASE_COLORS = ["#6c8cff", "#a78bfa", "#fb923c", "#34d399"];

const $ = (sel) => document.querySelector(sel);

let analysisData = null;
let rendererA, rendererB;
let animTimers = { a: null, b: null, all: false };

function init() {
  rendererA = new SkeletonRenderer($("#canvas-a"));
  rendererB = new SkeletonRenderer($("#canvas-b"));

  $("#video-a").addEventListener("change", (e) => handleUpload(e, "a"));
  $("#video-b").addEventListener("change", (e) => handleUpload(e, "b"));
  $("#analyze-btn").addEventListener("click", analyze);
  $("#play-a").addEventListener("click", () => togglePlay("a"));
  $("#play-b").addEventListener("click", () => togglePlay("b"));
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
    const res = await fetch("/api/analyze", { method: "POST", body: form });
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
  $("#phase-analysis").classList.remove("hidden");

  renderPhaseLegend();
  renderTimeline();
  renderPhaseComparisons();
  setupComparison();
}

function renderPhaseComparisons() {
  const el = $("#phase-comparisons");
  el.innerHTML = "";
  const comparisons = analysisData.phase_comparisons || [];

  comparisons.forEach((cmp, i) => {
    const card = document.createElement("div");
    card.className = "phase-comparison-card";
    card.style.borderLeftColor = PHASE_COLORS[i] || "#6c8cff";
    card.style.borderLeftWidth = "4px";

    let html = `<h3>${cmp.name_ko} <span style="opacity:0.6;font-weight:400">(${cmp.name_en})</span></h3>`;
    html += `<p class="summary">${cmp.summary.replace(/\*\*/g, "")}</p>`;

    if (cmp.differences?.length) {
      html += "<ul class='diff-list'>";
      cmp.differences.forEach((d) => { html += `<li>${d}</li>`; });
      html += "</ul>";
    }

    if (cmp.recommendations?.length) {
      html += "<p class='rec-title'>비교 스윙처럼 바꾸려면</p><ul class='rec-list'>";
      cmp.recommendations.forEach((r) => { html += `<li>${r}</li>`; });
      html += "</ul>";
    }

    card.innerHTML = html;
    el.appendChild(card);
  });
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
  stopAllAnim();

  const swingA = analysisData.swing_a;
  const swingB = analysisData.swing_b;

  setupCanvasSize($("#canvas-a"), swingA.width, swingA.height);
  setupCanvasSize($("#canvas-b"), swingB.width, swingB.height);

  setupSide("a", swingA.all_frames, swingA.skeleton_connections, swingA.fps);
  setupSide("b", swingB.all_frames, swingB.skeleton_connections, swingB.fps);
}

function setupSide(side, frames, connections, fps) {
  const slider = $(`#slider-${side}`);
  const max = Math.max(frames.length - 1, 0);
  slider.max = max;
  slider.value = 0;
  $(`#frame-info-${side}`).textContent = `1 / ${frames.length}`;
  $(`#play-${side}`).textContent = "▶ 재생";

  const canvas = $(`#canvas-${side}`);
  const renderer = side === "a" ? rendererA : rendererB;

  const render = (idx) => {
    if (frames[idx]) {
      renderer.render(frames[idx], connections, canvas.width, canvas.height);
    }
  };

  render(0);

  window[`_frames_${side}`] = frames;
  window[`_connections_${side}`] = connections;
  window[`_render_${side}`] = render;
  window[`_fps_${side}`] = fps || 30;
}

function showFrame(side, idx) {
  const render = window[`_render_${side}`];
  const frames = window[`_frames_${side}`];
  if (render && frames) {
    render(idx);
    $(`#frame-info-${side}`).textContent = `${idx + 1} / ${frames.length}`;
  }
}

function togglePlay(side) {
  if (animTimers[side]) {
    stopAnim(side);
    return;
  }
  stopPlayAll();
  startPlay(side);
}

function startPlay(side) {
  const frames = window[`_frames_${side}`];
  const slider = $(`#slider-${side}`);
  const fps = window[`_fps_${side}`] || 30;
  if (!frames || frames.length === 0) return;

  let idx = +slider.value;
  $(`#play-${side}`).textContent = "⏸ 정지";

  animTimers[side] = setInterval(() => {
    idx += 1;
    if (idx >= frames.length) {
      stopAnim(side);
      return;
    }
    slider.value = idx;
    showFrame(side, idx);
  }, 1000 / fps);
}

function togglePlayAll() {
  if (animTimers.all) {
    stopPlayAll();
    return;
  }
  stopAnim("a");
  stopAnim("b");

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

function stopAnim(side) {
  if (animTimers[side]) {
    clearInterval(animTimers[side]);
    animTimers[side] = null;
    $(`#play-${side}`).textContent = "▶ 재생";
  }
}

function stopPlayAll() {
  if (animTimers._allInterval) {
    clearInterval(animTimers._allInterval);
    animTimers._allInterval = null;
  }
  animTimers.all = false;
  $("#play-all").textContent = "▶ 전체 재생 (양쪽 동시)";
}

function stopAllAnim() {
  stopAnim("a");
  stopAnim("b");
  stopPlayAll();
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
