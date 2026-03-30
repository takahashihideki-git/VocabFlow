// sim/charts.js — グラフ描画（Canvas API 直描画）

const PALETTE = [
  '#2196F3','#F44336','#4CAF50','#FF9800','#9C27B0',
  '#00BCD4','#E91E63','#8BC34A','#FF5722','#607D8B',
  '#795548','#FFEB3B','#3F51B5','#009688','#FFC107',
];

const HEATMAP_COLORS = [
  { max: 0,    color: '#E0E0E0' },  // 未学習
  { max: 1,    color: '#FF4444' },  // h < 1日
  { max: 3,    color: '#FF8C00' },  // 1〜3日
  { max: 7,    color: '#FFD700' },  // 3〜7日
  { max: 14,   color: '#9ACD32' },  // 7〜14日
  { max: 30,   color: '#32CD32' },  // 14〜30日
  { max: Infinity, color: '#006400' }, // ≥30日
];

export function hColor(h) {
  if (!h || h <= 0) return HEATMAP_COLORS[0].color;
  for (const { max, color } of HEATMAP_COLORS.slice(1)) {
    if (h < max) return color;
  }
  return '#006400';
}

export class SimCharts {
  constructor() {
    this._heatmapSnapshot = null;
  }

  clear() {
    ['chart-mastered','chart-ratio','chart-halflife','chart-reviews','chart-heatmap']
      .forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          const ctx = el.getContext('2d');
          ctx.clearRect(0, 0, el.width, el.height);
        }
      });
  }

  render(results, scenario) {
    this._heatmapSnapshot = results;
    this._renderMasteredChart(results);
    this._renderRatioChart(results);
    this._renderHalflifeChart(results);
    this._renderReviewsChart(results);
    this._renderHeatmap(results, 0);

    // ヒートマップスライダー
    const slider = document.getElementById('heatmap-day');
    const maxDay = Math.max(...results.map(r => r.snapshots.length));
    slider.max = maxDay;
    slider.value = maxDay;
    slider.oninput = () => {
      const day = parseInt(slider.value) - 1;
      this._renderHeatmap(results, day);
      document.getElementById('heatmap-day-label').textContent = `Day ${slider.value}`;
    };
    document.getElementById('heatmap-day-label').textContent = `Day ${maxDay}`;
  }

  // -------------------------------------------------------
  // グラフ1: 定着語数の推移（折れ線）
  // -------------------------------------------------------
  _renderMasteredChart(results) {
    const canvas = document.getElementById('chart-mastered');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { w, h } = this._resize(canvas);
    ctx.clearRect(0, 0, w, h);

    const maxDay = Math.max(...results.map(r => r.snapshots.length));
    const maxMastered = Math.max(...results.flatMap(r => r.snapshots.map(s => s.masteredCount)), 100);

    this._drawAxes(ctx, w, h, maxDay, maxMastered, '日数', '定着語数');

    results.forEach((result, i) => {
      this._drawLine(ctx, result.snapshots, 'day', 'masteredCount',
        w, h, maxDay, maxMastered, PALETTE[i % PALETTE.length], result.label);
    });

    this._drawLegend(ctx, results.map((r, i) => ({ label: r.label, color: PALETTE[i] })), w, h);
  }

  // -------------------------------------------------------
  // グラフ2: 復習/新語比率の推移（積み上げ面グラフ）
  // -------------------------------------------------------
  _renderRatioChart(results) {
    const canvas = document.getElementById('chart-ratio');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { w, h } = this._resize(canvas);
    ctx.clearRect(0, 0, w, h);

    // 最初の結果のみ表示
    const result = results[0];
    if (!result) return;

    const maxDay = result.snapshots.length;
    const maxCards = Math.max(...result.snapshots.map(s => s.totalCards), 1);

    this._drawAxes(ctx, w, h, maxDay, maxCards, '日数', 'カード数/日');

    const pad = { left: 50, right: 20, top: 20, bottom: 40 };
    const pw = w - pad.left - pad.right;
    const ph = h - pad.top - pad.bottom;

    // 積み上げ面: new (青) + review (緑)
    ctx.save();
    // Review area
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top + ph);
    result.snapshots.forEach((s, i) => {
      const x = pad.left + (s.day / maxDay) * pw;
      const y = pad.top + ph - (s.reviewCards / maxCards) * ph;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.lineTo(pad.left + pw, pad.top + ph);
    ctx.closePath();
    ctx.fillStyle = 'rgba(76,175,80,0.4)';
    ctx.fill();

    // New area (on top)
    ctx.beginPath();
    result.snapshots.forEach((s, i) => {
      const x = pad.left + (s.day / maxDay) * pw;
      const y = pad.top + ph - (s.reviewCards / maxCards) * ph;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    const snaps = [...result.snapshots].reverse();
    snaps.forEach(s => {
      const x = pad.left + (s.day / maxDay) * pw;
      const y = pad.top + ph - ((s.reviewCards + s.newCards) / maxCards) * ph;
      ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(33,150,243,0.4)';
    ctx.fill();
    ctx.restore();

    // Labels
    ctx.fillStyle = 'rgba(76,175,80,0.9)';
    ctx.font = '12px sans-serif';
    ctx.fillText('復習', pad.left + 5, pad.top + ph * 0.3);
    ctx.fillStyle = 'rgba(33,150,243,0.9)';
    ctx.fillText('新語', pad.left + 5, pad.top + ph * 0.1);
  }

  // -------------------------------------------------------
  // グラフ3: 平均半減期の推移
  // -------------------------------------------------------
  _renderHalflifeChart(results) {
    const canvas = document.getElementById('chart-halflife');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { w, h } = this._resize(canvas);
    ctx.clearRect(0, 0, w, h);

    const maxDay = Math.max(...results.map(r => r.snapshots.length));
    const maxH = Math.max(...results.flatMap(r => r.snapshots.map(s => s.avgH)), 10);

    this._drawAxes(ctx, w, h, maxDay, maxH, '日数', '平均半減期(日)');

    results.forEach((result, i) => {
      this._drawLine(ctx, result.snapshots, 'day', 'avgH',
        w, h, maxDay, maxH, PALETTE[i % PALETTE.length], result.label);
    });

    this._drawLegend(ctx, results.map((r, i) => ({ label: r.label, color: PALETTE[i] })), w, h);
  }

  // -------------------------------------------------------
  // グラフ4: 定着までの復習回数（ヒストグラム）- 最初の結果のみ
  // -------------------------------------------------------
  _renderReviewsChart(results) {
    const canvas = document.getElementById('chart-reviews');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { w, h } = this._resize(canvas);
    ctx.clearRect(0, 0, w, h);

    const result = results[0];
    if (!result) return;

    // 定着済み単語の復習回数分布
    const mastered = result.finalState.words.filter(w => w.h >= result.config.masteredThresholdH);
    if (mastered.length === 0) {
      ctx.fillStyle = '#666';
      ctx.font = '14px sans-serif';
      ctx.fillText('定着語なし', 20, h / 2);
      return;
    }

    const counts = mastered.map(w => w.reviewCount);
    const maxCount = Math.max(...counts);
    const bins = new Array(Math.min(maxCount + 1, 30)).fill(0);
    counts.forEach(c => {
      const bin = Math.min(c, bins.length - 1);
      bins[bin]++;
    });
    const maxBin = Math.max(...bins);

    this._drawAxes(ctx, w, h, bins.length - 1, maxBin, '復習回数', '単語数');

    const pad = { left: 50, right: 20, top: 20, bottom: 40 };
    const pw = w - pad.left - pad.right;
    const ph = h - pad.top - pad.bottom;
    const barW = pw / bins.length * 0.8;

    ctx.fillStyle = PALETTE[0] + 'cc';
    bins.forEach((cnt, i) => {
      const x = pad.left + (i / bins.length) * pw;
      const bh = (cnt / maxBin) * ph;
      ctx.fillRect(x, pad.top + ph - bh, barW, bh);
    });
  }

  // -------------------------------------------------------
  // Wave Heatmap
  // -------------------------------------------------------
  _renderHeatmap(results, dayIdx) {
    const canvas = document.getElementById('chart-heatmap');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth || 800;
    canvas.height = 120;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // 最初の結果を使用
    const result = results[0];
    if (!result) return;

    const snap = result.snapshots[Math.min(dayIdx, result.snapshots.length - 1)];
    if (!snap) return;

    // 最終状態からh値を取得（snapshots に個別のh分布は含まれないため finalState を使う）
    // dayIdx が最終日以外の場合はスナップショットの masteredCount で近似表示
    const words = result.finalState.words;
    const cellW = Math.max(1, w / words.length);
    const cellH = h - 20;

    words.forEach((word, i) => {
      const x = i * cellW;
      ctx.fillStyle = hColor(word.h);
      ctx.fillRect(x, 10, Math.max(1, cellW - 0.5), cellH);
    });

    // Wave境界線
    const waveSize = result.config.waveSize;
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    for (let w2 = 1; w2 * waveSize < words.length; w2++) {
      const x = (w2 * waveSize / words.length) * w;
      ctx.beginPath();
      ctx.moveTo(x, 10);
      ctx.lineTo(x, h - 10);
      ctx.stroke();
    }

    // カラーレジェンド
    this._drawHeatmapLegend(ctx, w, h);
  }

  _drawHeatmapLegend(ctx, w, h) {
    const labels = ['未学習', '<1日', '1-3日', '3-7日', '7-14日', '14-30日', '30日+'];
    const colors = HEATMAP_COLORS.map(c => c.color);
    const cellW = 50;
    const startX = w - labels.length * (cellW + 4) - 10;
    const y = h - 8;

    labels.forEach((label, i) => {
      const x = startX + i * (cellW + 4);
      ctx.fillStyle = colors[i];
      ctx.fillRect(x, y - 8, cellW, 8);
      ctx.fillStyle = '#333';
      ctx.font = '9px sans-serif';
      ctx.fillText(label, x, y + 10);
    });
  }

  // -------------------------------------------------------
  // ユーティリティ
  // -------------------------------------------------------
  _resize(canvas) {
    canvas.width = canvas.offsetWidth || 600;
    canvas.height = canvas.offsetHeight || 200;
    return { w: canvas.width, h: canvas.height };
  }

  _drawAxes(ctx, w, h, maxX, maxY, labelX, labelY) {
    const pad = { left: 50, right: 20, top: 20, bottom: 40 };
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;

    // Y軸
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, h - pad.bottom);
    ctx.stroke();

    // X軸
    ctx.beginPath();
    ctx.moveTo(pad.left, h - pad.bottom);
    ctx.lineTo(w - pad.right, h - pad.bottom);
    ctx.stroke();

    // グリッド & ラベル
    ctx.fillStyle = '#666';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';

    for (let i = 0; i <= 4; i++) {
      const val = (maxY / 4) * i;
      const y = h - pad.bottom - ((val / maxY) * (h - pad.top - pad.bottom));
      ctx.fillStyle = '#ccc';
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
      ctx.fillStyle = '#666';
      ctx.fillText(Math.round(val).toLocaleString(), pad.left - 4, y + 4);
    }

    for (let i = 0; i <= 4; i++) {
      const val = (maxX / 4) * i;
      const x = pad.left + (val / maxX) * (w - pad.left - pad.right);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#666';
      ctx.fillText(Math.round(val), x, h - pad.bottom + 14);
    }

    // 軸ラベル
    ctx.textAlign = 'center';
    ctx.fillStyle = '#444';
    ctx.font = '12px sans-serif';
    ctx.fillText(labelX, w / 2, h - 2);

    ctx.save();
    ctx.translate(12, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(labelY, 0, 0);
    ctx.restore();
  }

  _drawLine(ctx, snapshots, xKey, yKey, w, h, maxX, maxY, color, label) {
    const pad = { left: 50, right: 20, top: 20, bottom: 40 };
    const pw = w - pad.left - pad.right;
    const ph = h - pad.top - pad.bottom;

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    snapshots.forEach((s, i) => {
      const x = pad.left + (s[xKey] / maxX) * pw;
      const y = pad.top + ph - (s[yKey] / maxY) * ph;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  _drawLegend(ctx, items, w, h) {
    if (items.length <= 1) return;
    const pad = { right: 20, top: 25 };
    const lineH = 18;
    const startY = pad.top;
    const startX = w - pad.right - 120;

    items.forEach((item, i) => {
      const y = startY + i * lineH;
      ctx.fillStyle = item.color;
      ctx.fillRect(startX, y - 8, 20, 10);
      ctx.fillStyle = '#333';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(item.label, startX + 24, y);
    });
  }
}
