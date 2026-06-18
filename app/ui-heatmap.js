// app/ui-heatmap.js — Wave Heatmap リアルタイム描画（Canvas）

import { LABELS, formatH, CONFIDENCE_MIN_REVIEWS } from '../core/labels.js';

/**
 * カラーマッピング（spec §5.2）— 水深ランプ（bathymetric）
 *   定着＝深く沈んで凪いだ深海。h が育つほど水面→深部へ沈む。
 *   配色は Word Wave（app.css .ww-word--t0..t5）と二重持ち・要同期。
 *   未学習            → グレー   #333348（まだ水に入っていない陸）
 *   出会ったばかり（rc<3）→ 泡      #9FD8E8（信頼度ゲート・水面の泡＝最浅・最明）
 *   h < 1日（抜けかけ） → 浅瀬     #2FD9C5（赤ではなく陽の差す浅瀬）
 *   h < 3日           → 浅青     #29A9C2
 *   h < 7日           → 中層青   #2486BC
 *   h < 14日          → 中層     #2566AC
 *   h < 30日          → 深い青   #244F9E
 *   h ≥ 30日（定着）   → 深海     #1B2E66
 */
export function hColor(word) {
  if (word.excluded) return '#3A3A4A';
  if (word.stage === 'new') return '#333348';
  // 信頼度ゲート: rc<3 の語は h 由来の水深色ではなく一律の青（揺らぎを実力差に見せない）
  if (word.reviewCount < CONFIDENCE_MIN_REVIEWS) return '#9FD8E8';
  const h = word.h;
  if (h <= 0)  return '#333348';
  if (h < 1)   return '#2FD9C5';
  if (h < 3)   return '#29A9C2';
  if (h < 7)   return '#2486BC';
  if (h < 14)  return '#2566AC';
  if (h < 30)  return '#244F9E';
  return '#1B2E66';
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
      const hStr = word.h > 0 ? `${LABELS.params.h} = ${formatH(word.h)}` : LABELS.heatmap.unlearned;
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
