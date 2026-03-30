// sim/charts.js — グラフ描画（Canvas API 直描画）

const PALETTE = [
  '#2196F3','#F44336','#4CAF50','#FF9800','#9C27B0',
  '#00BCD4','#E91E63','#8BC34A','#FF5722','#607D8B',
  '#795548','#FFEB3B','#3F51B5','#009688','#FFC107',
];

// h 値に応じた色（対数スケール）
const HEATMAP_COLORS = [
  { max: 0,         color: '#E0E0E0' },  // 未学習
  { max: 1,         color: '#FF4444' },  // h < 1日
  { max: 4,         color: '#FF8C00' },  // 1〜4日
  { max: 14,        color: '#FFD700' },  // 4〜14日
  { max: 30,        color: '#9ACD32' },  // 14〜30日
  { max: 90,        color: '#32CD32' },  // 30〜90日
  { max: 180,       color: '#228B22' },  // 90〜180日
  { max: Infinity,  color: '#006400' },  // ≥180日
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
    this._heatmapResults = null;
  }

  clear() {
    ['chart-mastered','chart-correct-rate','chart-halflife','chart-ratio',
     'chart-reviews','chart-heatmap']
      .forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          const ctx = el.getContext('2d');
          ctx.clearRect(0, 0, el.width, el.height);
        }
      });
    const st = document.getElementById('summary-table');
    if (st) st.innerHTML = '';
  }

  render(results, scenario) {
    this._heatmapResults = results;
    this._renderMasteredChart(results);
    this._renderCorrectRateChart(results);
    this._renderHalflifeChart(results);
    this._renderRatioChart(results);
    this._renderReviewsChart(results);
    this._renderHeatmap(results, results[0].snapshots.length - 1);
    this._renderSummaryTable(results, scenario);

    // ヒートマップスライダー設定
    const slider = document.getElementById('heatmap-day');
    const maxDay = Math.max(...results.map(r => r.snapshots.length));
    slider.max = maxDay;
    slider.value = maxDay;
    document.getElementById('heatmap-day-label').textContent = `Day ${maxDay}`;
    slider.oninput = () => {
      const dayIdx = parseInt(slider.value) - 1;
      this._renderHeatmap(results, dayIdx);
      document.getElementById('heatmap-day-label').textContent = `Day ${slider.value}`;
    };
  }

  // -------------------------------------------------------
  // グラフ1: 定着語数の推移
  // -------------------------------------------------------
  _renderMasteredChart(results) {
    const canvas = document.getElementById('chart-mastered');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { w, h } = this._resize(canvas);
    ctx.clearRect(0, 0, w, h);

    const maxDay = Math.max(...results.map(r => r.snapshots.length));
    const maxVal = Math.max(...results.flatMap(r => r.snapshots.map(s => s.masteredCount)), 100);

    this._drawAxes(ctx, w, h, maxDay, maxVal, '日数', '定着語数');

    results.forEach((result, i) => {
      this._drawLine(ctx, result.snapshots, 'day', 'masteredCount',
        w, h, maxDay, maxVal, PALETTE[i % PALETTE.length]);
    });

    this._drawLegend(ctx, results.map((r, i) => ({ label: r.label, color: PALETTE[i] })), w, h);
  }

  // -------------------------------------------------------
  // グラフ2: 正解率の推移
  // -------------------------------------------------------
  _renderCorrectRateChart(results) {
    const canvas = document.getElementById('chart-correct-rate');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { w, h } = this._resize(canvas);
    ctx.clearRect(0, 0, w, h);

    const maxDay = Math.max(...results.map(r => r.snapshots.length));
    const maxVal = 1.0;

    this._drawAxes(ctx, w, h, maxDay, maxVal * 100, '日数', '正解率 (%)');

    // 目標ライン 85%
    this._drawDashedLine(ctx, w, h, maxDay, maxVal * 100, 85, '#aaa', '85%');

    results.forEach((result, i) => {
      const snapsWithPct = result.snapshots.map(s => ({
        ...s, correctRatePct: s.correctRate * 100,
      }));
      this._drawLine(ctx, snapsWithPct, 'day', 'correctRatePct',
        w, h, maxDay, maxVal * 100, PALETTE[i % PALETTE.length]);
    });

    this._drawLegend(ctx, results.map((r, i) => ({ label: r.label, color: PALETTE[i] })), w, h);
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
    const maxVal = Math.max(...results.flatMap(r => r.snapshots.map(s => s.avgH)), 10);

    this._drawAxes(ctx, w, h, maxDay, maxVal, '日数', '平均半減期(日)');

    results.forEach((result, i) => {
      this._drawLine(ctx, result.snapshots, 'day', 'avgH',
        w, h, maxDay, maxVal, PALETTE[i % PALETTE.length]);
    });

    this._drawLegend(ctx, results.map((r, i) => ({ label: r.label, color: PALETTE[i] })), w, h);
  }

  // -------------------------------------------------------
  // グラフ4: 復習/新語比率の推移（積み上げ面グラフ、最初の結果のみ）
  // -------------------------------------------------------
  _renderRatioChart(results) {
    const canvas = document.getElementById('chart-ratio');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { w, h } = this._resize(canvas);
    ctx.clearRect(0, 0, w, h);

    const result = results[0];
    if (!result) return;

    const maxDay = result.snapshots.length;
    const maxCards = Math.max(...result.snapshots.map(s => s.totalCards), 1);

    this._drawAxes(ctx, w, h, maxDay, maxCards, '日数', 'カード数/日');

    const pad = { left: 50, right: 20, top: 20, bottom: 40 };
    const pw = w - pad.left - pad.right;
    const ph = h - pad.top - pad.bottom;

    ctx.save();
    // Review area
    ctx.beginPath();
    result.snapshots.forEach((s, i) => {
      const x = pad.left + (s.day / maxDay) * pw;
      const y = pad.top + ph - (s.reviewCards / maxCards) * ph;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.lineTo(pad.left + pw, pad.top + ph);
    ctx.lineTo(pad.left, pad.top + ph);
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

    ctx.fillStyle = 'rgba(76,175,80,0.9)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('復習', pad.left + 8, pad.top + ph * 0.4);
    ctx.fillStyle = 'rgba(33,150,243,0.9)';
    ctx.fillText('新語', pad.left + 8, pad.top + ph * 0.15);
  }

  // -------------------------------------------------------
  // グラフ5: 定着語の復習回数分布（ヒストグラム、最初の結果のみ）
  // -------------------------------------------------------
  _renderReviewsChart(results) {
    const canvas = document.getElementById('chart-reviews');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { w, h } = this._resize(canvas);
    ctx.clearRect(0, 0, w, h);

    const result = results[0];
    if (!result) return;

    const mastered = result.finalState.words.filter(w => w.h >= result.config.masteredThresholdH);
    if (mastered.length === 0) {
      ctx.fillStyle = '#666';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('定着語なし', w / 2, h / 2);
      return;
    }

    const counts = mastered.map(w => w.reviewCount);
    const maxCount = Math.max(...counts);
    const binCount = Math.min(maxCount + 1, 40);
    const bins = new Array(binCount).fill(0);
    counts.forEach(c => bins[Math.min(c, binCount - 1)]++);
    const maxBin = Math.max(...bins);

    this._drawAxes(ctx, w, h, binCount - 1, maxBin, '復習回数', '単語数');

    const pad = { left: 50, right: 20, top: 20, bottom: 40 };
    const pw = w - pad.left - pad.right;
    const ph = h - pad.top - pad.bottom;
    const barW = (pw / binCount) * 0.8;

    ctx.fillStyle = PALETTE[0] + 'cc';
    bins.forEach((cnt, i) => {
      const x = pad.left + (i / binCount) * pw;
      const bh = (cnt / maxBin) * ph;
      ctx.fillRect(x, pad.top + ph - bh, barW, bh);
    });
  }

  // -------------------------------------------------------
  // Wave Heatmap（スライダーで日付を選択）
  // -------------------------------------------------------
  _renderHeatmap(results, dayIdx) {
    const canvas = document.getElementById('chart-heatmap');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth || 800;
    canvas.height = 130;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const result = results[0];
    if (!result) return;

    // dayIdx に最も近い（以前の）heatmapData を検索
    const snaps = result.snapshots;
    let hData = null;
    for (let i = Math.min(dayIdx, snaps.length - 1); i >= 0; i--) {
      if (snaps[i].heatmapData) {
        hData = snaps[i].heatmapData;
        break;
      }
    }
    if (!hData) return;

    const totalWords = hData.length;
    const cellW = w / totalWords;
    const cellH = h - 28;

    for (let i = 0; i < totalWords; i++) {
      ctx.fillStyle = hColor(hData[i]);
      ctx.fillRect(i * cellW, 10, Math.max(1, cellW - 0.3), cellH);
    }

    // Wave 境界線
    const waveSize = result.config.waveSize;
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1;
    for (let wn = 1; wn * waveSize < totalWords; wn++) {
      const x = Math.round((wn * waveSize / totalWords) * w);
      ctx.beginPath();
      ctx.moveTo(x, 8);
      ctx.lineTo(x, 10 + cellH + 2);
      ctx.stroke();
    }

    this._drawHeatmapLegend(ctx, w, h);
  }

  _drawHeatmapLegend(ctx, w, h) {
    const labels = ['未学習', '<1日', '1-4日', '4-14日', '14-30日', '30-90日', '90-180日', '180日+'];
    const colors = HEATMAP_COLORS.map(c => c.color);
    const cellW = 52;
    const totalW = labels.length * (cellW + 2);
    const startX = Math.max(4, w - totalW - 4);
    const y = h - 6;

    labels.forEach((label, i) => {
      const x = startX + i * (cellW + 2);
      ctx.fillStyle = colors[i];
      ctx.fillRect(x, y - 10, cellW, 10);
      ctx.fillStyle = '#333';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(label, x, y + 8);
    });
  }

  // -------------------------------------------------------
  // サマリーテーブル（DOM要素として生成）
  // -------------------------------------------------------
  _renderSummaryTable(results, scenario) {
    const container = document.getElementById('summary-table');
    if (!container) return;
    container.innerHTML = '';

    const table = document.createElement('table');
    table.className = 'summary-table';

    // ヘッダー
    const thead = table.createTHead();
    const hr = thead.insertRow();
    ['条件', '定着語数', '学習済み', '平均半減期', '正解率', '最終Wave'].forEach(t => {
      const th = document.createElement('th');
      th.textContent = t;
      hr.appendChild(th);
    });

    // 行
    const tbody = table.createTBody();
    results.forEach((r, idx) => {
      const last = r.snapshots[r.snapshots.length - 1];
      const waves = last.activeWaves.join(', ') || '-';
      const row = tbody.insertRow();
      row.className = idx % 2 === 0 ? '' : 'alt';

      const cells = [
        r.label,
        last.masteredCount.toLocaleString() + '語',
        last.learnedCount.toLocaleString() + '語',
        last.avgH.toFixed(0) + '日',
        (last.correctRate * 100).toFixed(1) + '%',
        waves,
      ];
      cells.forEach((val, ci) => {
        const td = row.insertCell();
        td.textContent = val;
        if (ci === 1) td.className = 'cell-highlight';
      });
    });

    container.appendChild(table);
  }

  // -------------------------------------------------------
  // ユーティリティ
  // -------------------------------------------------------
  _resize(canvas, heightOverride) {
    canvas.width = canvas.offsetWidth || 600;
    canvas.height = heightOverride ?? (canvas.offsetHeight || 200);
    return { w: canvas.width, h: canvas.height };
  }

  _drawAxes(ctx, w, h, maxX, maxY, labelX, labelY) {
    const pad = { left: 50, right: 20, top: 20, bottom: 40 };
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, h - pad.bottom);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pad.left, h - pad.bottom);
    ctx.lineTo(w - pad.right, h - pad.bottom);
    ctx.stroke();

    ctx.fillStyle = '#666';
    ctx.font = '11px sans-serif';

    for (let i = 0; i <= 4; i++) {
      const val = (maxY / 4) * i;
      const y = h - pad.bottom - (val / maxY) * (h - pad.top - pad.bottom);
      ctx.strokeStyle = '#eee';
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
      ctx.fillStyle = '#666';
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(val).toLocaleString(), pad.left - 4, y + 4);
    }

    for (let i = 0; i <= 4; i++) {
      const val = (maxX / 4) * i;
      const x = pad.left + (val / maxX) * (w - pad.left - pad.right);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#666';
      ctx.fillText(Math.round(val), x, h - pad.bottom + 14);
    }

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

  _drawLine(ctx, snapshots, xKey, yKey, w, h, maxX, maxY, color) {
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

  _drawDashedLine(ctx, w, h, maxX, maxY, value, color, label) {
    const pad = { left: 50, right: 20, top: 20, bottom: 40 };
    const pw = w - pad.left - pad.right;
    const ph = h - pad.top - pad.bottom;
    const y = pad.top + ph - (value / maxY) * ph;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + pw, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, pad.left + pw - 24, y - 3);
    ctx.restore();
  }

  _drawLegend(ctx, items, w, h) {
    if (items.length <= 1) return;
    const pad = { right: 20, top: 25 };
    const lineH = 18;
    const startX = w - pad.right - 150;

    items.forEach((item, i) => {
      const y = pad.top + i * lineH;
      ctx.fillStyle = item.color;
      ctx.fillRect(startX, y - 8, 20, 10);
      ctx.fillStyle = '#333';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(item.label, startX + 24, y);
    });
  }
}
