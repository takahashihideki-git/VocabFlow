// app/ui-heatmap.js — Wave Heatmap リアルタイム描画（Canvas）

/**
 * カラーマッピング（spec §5.2）
 *   未学習     → グレー  #E0E0E0
 *   h < 1日   → 赤     #FF4444
 *   h < 3日   → オレンジ #FF8C00
 *   h < 7日   → 黄     #FFD700
 *   h < 14日  → 黄緑   #9ACD32
 *   h < 30日  → 緑     #32CD32
 *   h ≥ 30日  → 深緑   #006400
 */
export function hColor(word) {
  if (word.stage === 'new') return '#333348';
  const h = word.h;
  if (h <= 0)  return '#333348';
  if (h < 1)   return '#FF4444';
  if (h < 3)   return '#FF8C00';
  if (h < 7)   return '#FFD700';
  if (h < 14)  return '#9ACD32';
  if (h < 30)  return '#32CD32';
  return '#006400';
}

export class HeatmapRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {HTMLElement} tooltip
   * @param {WordState[]} words
   */
  constructor(canvas, tooltip, words) {
    this.canvas = canvas;
    this.tooltip = tooltip;
    this.words = words;
    this._setupEvents();
  }

  // 描画
  render() {
    const canvas = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;

    // HiDPI 対応
    if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
      canvas.width  = W * dpr;
      canvas.height = H * dpr;
    }

    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const n = this.words.length;
    if (n === 0) { ctx.restore(); return; }

    const cellW = W / n;
    const r = Math.max(1, Math.min(cellW * 0.4, 2));

    for (let i = 0; i < n; i++) {
      const x = i * cellW;
      ctx.fillStyle = hColor(this.words[i]);
      // Rounded mini-rects
      this._roundRect(ctx, x + 0.5, 0, Math.max(cellW - 1, 1), H, r);
      ctx.fill();
    }

    ctx.restore();
  }

  _roundRect(ctx, x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  _setupEvents() {
    const canvas = this.canvas;
    const tooltip = this.tooltip;

    const getWordAt = (clientX) => {
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const idx = Math.floor((x / rect.width) * this.words.length);
      return this.words[Math.max(0, Math.min(idx, this.words.length - 1))];
    };

    const showTooltip = (clientX, clientY, word) => {
      const hStr = word.h > 0 ? `h = ${word.h.toFixed(1)}日` : '未学習';
      document.getElementById('tt-word').textContent = word.wordString;
      document.getElementById('tt-info').textContent = `${word.stage} | ${hStr}`;
      tooltip.style.display = 'block';
      // Position: above cursor
      const tx = Math.min(clientX + 10, window.innerWidth - 210);
      const ty = clientY + 16;
      tooltip.style.left = `${tx}px`;
      tooltip.style.top  = `${ty}px`;
    };

    const hide = () => { tooltip.style.display = 'none'; };

    canvas.addEventListener('mousemove', (e) => {
      showTooltip(e.clientX, e.clientY, getWordAt(e.clientX));
    });
    canvas.addEventListener('mouseleave', hide);

    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const t = e.touches[0];
      showTooltip(t.clientX, t.clientY, getWordAt(t.clientX));
    }, { passive: false });
    canvas.addEventListener('touchend', hide);
  }
}
