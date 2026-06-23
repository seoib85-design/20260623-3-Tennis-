/**
 * 관절 스켈레톤 렌더러
 */
class SkeletonRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.options = {
      jointColor: "#5b9fd4",
      jointRadius: 5,
      boneColor: "#4a6fa5",
      boneWidth: 3,
      headColor: "#8ecae6",
      headRadius: 10,
      bgColor: "#0a0e14",
      ...options,
    };
  }

  clear() {
    const { ctx, canvas } = this;
    ctx.fillStyle = this.options.bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  render(frame, connections, videoWidth, videoHeight) {
    if (!frame) return;
    this.clear();

    const lm = frame.landmarks || {};
    const w = videoWidth || this.canvas.width;
    const h = videoHeight || this.canvas.height;

    const toX = (pt) => (pt?.nx != null ? pt.nx * w : pt?.x ?? 0);
    const toY = (pt) => (pt?.ny != null ? pt.ny * h : pt?.y ?? 0);

    if (connections) {
      this.ctx.strokeStyle = this.options.boneColor;
      this.ctx.lineWidth = this.options.boneWidth;
      this.ctx.lineCap = "round";

      for (const [a, b] of connections) {
        const pa = lm[a];
        const pb = lm[b];
        if (!pa || !pb) continue;
        if ((pa.visibility ?? 1) < 0.3 || (pb.visibility ?? 1) < 0.3) continue;

        this.ctx.beginPath();
        this.ctx.moveTo(toX(pa), toY(pa));
        this.ctx.lineTo(toX(pb), toY(pb));
        this.ctx.stroke();
      }
    }

    for (const [name, pt] of Object.entries(lm)) {
      if ((pt.visibility ?? 1) < 0.3) continue;

      const px = toX(pt);
      const py = toY(pt);
      const isHead = name === "head";
      const radius = isHead ? this.options.headRadius : this.options.jointRadius;

      this.ctx.beginPath();
      this.ctx.arc(px, py, radius, 0, Math.PI * 2);
      this.ctx.fillStyle = isHead ? this.options.headColor : this.options.jointColor;
      this.ctx.fill();
      this.ctx.strokeStyle = "rgba(255,255,255,0.3)";
      this.ctx.lineWidth = 1;
      this.ctx.stroke();
    }
  }
}

window.SkeletonRenderer = SkeletonRenderer;
