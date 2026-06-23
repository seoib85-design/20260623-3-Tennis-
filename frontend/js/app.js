const PHASE_COLORS = ["#6c8cff", "#a78bfa", "#fb923c", "#34d399"];

const $ = (sel) => document.querySelector(sel);

let analysisData = null;
let rendererA, rendererB;

function init() {
  rendererA = new SkeletonRenderer($("#canvas-a"));
  rendererB = new SkeletonRenderer($("#canvas-b"));

  $("#video-a").addEventListener("change", (e) => handleUpload(e, "a"));
  $("#video-b").addEventListener("change", (e) => handleUpload(e, "b"));
  $("#analyze-btn").addEventListener("click", analyze);
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
  $("#impact-ball").classList.remove("hidden");

  renderPhaseLegend();
  renderTimeline();
  renderPhaseComparisons();
  renderImpactBall();
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
    html += `<p class="summary">${(cmp.brief_summary || cmp.summary || "").replace(/\*\*/g, "")}</p>`;

    if (cmp.how_to_match?.length) {
      html += "<p class='rec-title'>비교 스윙처럼 하려면</p><ul class='rec-list'>";
      cmp.how_to_match.forEach((r) => { html += `<li>${r}</li>`; });
      html += "</ul>";
    } else if (cmp.recommendations?.length) {
      html += "<p class='rec-title'>비교 스윙처럼 하려면</p><ul class='rec-list'>";
      cmp.recommendations.forEach((r) => { html += `<li>${r}</li>`; });
      html += "</ul>";
    }

    card.innerHTML = html;
    el.appendChild(card);
  });
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
  const swingA = analysisData.swing_a;
  const swingB = analysisData.swing_b;

  setupCanvasSize($("#canvas-a"), swingA.width, swingA.height);
  setupCanvasSize($("#canvas-b"), swingB.width, swingB.height);

  setupSide("a", swingA.all_frames, swingA.skeleton_connections, swingA.dominant_hand);
  setupSide("b", swingB.all_frames, swingB.skeleton_connections, swingB.dominant_hand);

  const impactA = swingA.impact_frame ?? 0;
  const impactB = swingB.impact_frame ?? 0;
  $("#slider-a").value = impactA;
  $("#slider-b").value = impactB;
  showFrame("a", impactA);
  showFrame("b", impactB);
}

function setupSide(side, frames, connections, dominantHand) {
  const slider = $(`#slider-${side}`);
  const max = Math.max(frames.length - 1, 0);
  slider.max = max;
  slider.value = 0;
  $(`#frame-info-${side}`).textContent = `1 / ${frames.length}`;

  const canvas = $(`#canvas-${side}`);
  const renderer = side === "a" ? rendererA : rendererB;

  const render = (idx) => {
    if (frames[idx]) {
      renderer.render(frames[idx], connections, canvas.width, canvas.height, {
        dominantHand,
        showBallAtImpact: true,
      });
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
    const label = isImpact ? " (임팩트)" : "";
    $(`#frame-info-${side}`).textContent = `${idx + 1} / ${frames.length}${label}`;
  }
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
