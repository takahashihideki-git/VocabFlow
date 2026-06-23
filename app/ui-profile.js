// app/ui-profile.js — Marine Chart 学習プロファイル全画面ビュー
//
// Word Wave overlay の FAB から開く。既存 localStorage state からすべて算出（新トラッキング不要）。
// 設計の核: 現在 state（綴りの暗礁＝dictation/recall 止まり）と過去（累計✗＝乗り越えた難所＝今 mastered）を
// 意図的に分離し誤読を防ぐ。SRS ロジックには一切触れない（既存 state の可視化のみ）。

import { CATEGORIES } from '../core/word-data.js';
import { PROFILE_LABELS } from '../core/labels.js';
import { ReefDrill } from './ui-drill.js';

const POS_JA = { verb: '動詞', noun: '名詞', adjective: '形容詞', adverb: '副詞', other: 'その他' };

const CAT_NAME = new Map(CATEGORIES.map(c => [c.id, c.name]));

// バブルに割り当てるビビッドパレット（fill-opacity 0.2 でも色相が残るよう原色寄り）
const PALETTE = ['#00A3FF', '#FF2D95', '#FFD000', '#00E676', '#9D4DFF', '#FF6D00', '#00E5FF', '#FF1744', '#76FF03', '#FFB300'];

export class ProfileRenderer {
  /**
   * @param {HTMLElement} overlayEl — #profile-overlay
   * @param {LearnerState} learnerState
   */
  constructor(overlayEl, learnerState) {
    this.overlay = overlayEl;
    this.state   = learnerState;
    // 綴りの暗礁 特訓ドリル（CTA から開く・練習モード・SRS 不変）
    const drillEl = document.getElementById('drill-overlay');
    this.drill = drillEl ? new ReefDrill(drillEl, learnerState.config) : null;
    this._bindEvents();
  }

  open() {
    this._build();
    this.overlay.style.display = 'flex';
  }

  close() {
    this.overlay.style.display = 'none';
  }

  isOpen() {
    return this.overlay.style.display !== 'none';
  }

  _bindEvents() {
    const closeBtn = this.overlay.querySelector('#profile-close');
    if (closeBtn) closeBtn.addEventListener('click', () => this.close());

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) {
        e.preventDefault();
        this.close();
      }
    });
  }

  // -------------------------------------------------------
  // 軸（品詞/カテゴリ）ごとに 語数・誤答率・誤答数・弱点語 を集計
  // rate は回答回数ベース（誤答数 / 総回答数）。語数とは別単位。
  // -------------------------------------------------------
  _axisPoints(learned, keyFn, nameFn, minN) {
    const m = {};
    for (const w of learned) {
      const k = keyFn(w);
      (m[k] = m[k] || { c: 0, i: 0, n: 0, words: [] });
      m[k].c += w.correctCount;
      m[k].i += w.incorrectCount;
      m[k].n++;
      if (w.incorrectCount > 0) m[k].words.push({ w: w.wordString, err: w.incorrectCount });
    }
    return Object.entries(m)
      .filter(([, v]) => v.n >= minN)
      .map(([k, v]) => ({
        name: nameFn(k), n: v.n, rate: v.i / (v.c + v.i || 1), errors: v.i, total: v.c + v.i,
        words: v.words.sort((a, b) => b.err - a.err).slice(0, 10),   // 誤答が多い単語 上位10語
      }))
      .sort((a, b) => b.errors - a.errors);   // 誤答数（つまずきの総量）降順
  }

  // -------------------------------------------------------
  // バブルチャート SVG（x=語数, y=誤答率, 径∝√誤答数）
  // -------------------------------------------------------
  _bubbleChart(pts) {
    if (pts.length === 0) return '<div class="pf-empty">まだデータがありません</div>';
    const niceMax = v => { const step = v > 200 ? 100 : v > 80 ? 50 : 20; return Math.ceil(v / step) * step; };
    const Wd = 360, Ht = 200, mL = 30, mR = 16, mT = 20, mB = 26;
    const pw = Wd - mL - mR, ph = Ht - mT - mB;
    const xN = niceMax(Math.max(...pts.map(p => p.n)));
    // y軸: 最上目盛りを step の倍数に切り上げて上端に固定（=yR）。目盛り数に関わらず最上=上端・0%=下端が揃う。
    const step = 0.02;
    const maxRate = Math.max(...pts.map(p => p.rate));
    let yR = Math.ceil(maxRate / step) * step;
    if (yR - maxRate < step * 0.25) yR += step;   // 最上バブルが上端で切れない最小余白
    const nTicks = Math.round(yR / step);
    const maxErr = Math.max(...pts.map(p => p.errors));
    const sx = v => mL + (v / xN) * pw;
    const sy = v => mT + ph - (v / yR) * ph;
    const sr = e => 5 + (Math.sqrt(e) / Math.sqrt(maxErr || 1)) * 19;

    let g = '';
    for (let i = 0; i <= nTicks; i++) {
      const p = i * step;
      const y = sy(p);
      g += `<line class="bc-grid" x1="${mL}" y1="${y.toFixed(1)}" x2="${Wd - mR}" y2="${y.toFixed(1)}"/>`;
      g += `<text class="bc-tick" x="${mL - 4}" y="${(y + 3).toFixed(1)}" text-anchor="end">${Math.round(p * 100)}%</text>`;
    }
    for (const xv of [0, xN / 2, xN]) {
      const x = sx(xv);
      g += `<text class="bc-tick" x="${x.toFixed(1)}" y="${Ht - mB + 13}" text-anchor="middle">${xv}</text>`;
    }
    g += `<text class="bc-axis-lbl" x="352" y="200" text-anchor="end">語数</text>`;
    const yLblY = 7;
    g += `<text class="bc-axis-lbl" x="32" y="${yLblY}" text-anchor="end">誤答率</text>`;
    pts.forEach((p, i) => {
      const x = sx(p.n), y = sy(p.rate), r = sr(p.errors);
      const col = PALETTE[i % PALETTE.length];
      g += `<circle class="bc-bubble" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${col}" fill-opacity="0.2"/>`;
      g += `<text class="bc-blabel" x="${x.toFixed(1)}" y="${(y + 2.8).toFixed(1)}" text-anchor="middle">${p.name}</text>`;
    });
    const PAD = 10;
    const vbTop = yLblY - PAD;
    const vbH   = (200 + PAD) - vbTop;
    return `<svg class="bubble-chart" viewBox="0 ${vbTop} ${Wd} ${vbH}" preserveAspectRatio="xMidYMid meet">${g}</svg>`;
  }

  // 軸の凡例（名前 + 指標 + 弱点語チップ）
  _axisLegend(pts) {
    return pts.map((p) => `
      <div class="ax-row">
        <div class="ax-head">
          <span class="ax-name">${p.name}</span>
          <span class="ax-metric">${p.n}語 | 誤答率${(p.rate * 100).toFixed(1)}%（${p.errors}/${p.total}）</span>
        </div>
        ${p.words.length
          ? `<div class="ax-words">${p.words.map(x => `<span class="ax-chip">${x.w}<span class="e">✗${x.err}</span></span>`).join('')}</div>`
          : `<div class="ax-none">誤答なし</div>`}
      </div>`).join('');
  }

  // -------------------------------------------------------
  // 全画面ビューの構築
  // -------------------------------------------------------
  _build() {
    const words    = this.state.words;
    const learned  = words.filter(w => w.stage !== 'new' && !w.excluded);
    const mastered = learned.filter(w => w.stage === 'mastered');

    const posPts = this._axisPoints(learned, w => w.word.pos || 'other', k => POS_JA[k] || k, 1);
    // カテゴリ: バブルは上位8（語数5以上で誤答率の信頼性確保）／単語リストは全カテゴリ（誤答ありの全て）
    const catKey = w => w.word.categoryId, catNm = k => CAT_NAME.get(+k) || ('cat' + k);
    const catPtsChart = this._axisPoints(learned, catKey, catNm, 5).slice(0, 8);
    const catPtsList  = this._axisPoints(learned, catKey, catNm, 1).filter(p => p.errors > 0);

    // 乗り越えた難所（累計✗が多いが今は mastered）
    const overcame = mastered.filter(w => w.incorrectCount >= 3)
      .sort((a, b) => b.incorrectCount - a.incorrectCount).slice(0, 12);

    // 綴りの暗礁（dictation/recall 止まり＝現在 state）
    const reefs = learned.filter(w => w.stage === 'dictation' || w.stage === 'recall')
      .sort((a, b) => b.reviewCount - a.reviewCount);

    const L = PROFILE_LABELS;
    this.overlay.querySelector('#profile-body-inner').innerHTML = `
      <div class="pf-sec">
        <div class="pf-sec-head"><h2>${L.posSection}</h2><span class="sub">x=語数 · y=誤答率 · 径=誤答数（右上ほど要注意）</span></div>
        ${this._bubbleChart(posPts)}
        <div class="ax-caption">${L.topErrorWords}</div>
        ${this._axisLegend(posPts)}
      </div>

      <div class="pf-sec">
        <div class="pf-sec-head"><h2>${L.catSection}</h2><span class="sub">バブルは誤答数 上位8カテゴリ（語数5以上）</span></div>
        ${this._bubbleChart(catPtsChart)}
        <div class="ax-caption">${L.topErrorWordsAll}</div>
        ${this._axisLegend(catPtsList)}
      </div>

      <div class="pf-sec">
        <div class="pf-sec-head"><h2>${L.overcameSection}</h2><span class="sub">かつて何度も座礁したが、今は定着した語</span></div>
        <div class="overcame">
          ${overcame.length
            ? overcame.map(w => `<span class="chip">${w.wordString}<span class="e">✗${w.incorrectCount}</span></span>`).join('')
            : `<div class="pf-empty">まだありません</div>`}
        </div>
      </div>

      <div class="pf-sec">
        <div class="pf-sec-head"><h2>${L.reefSection}</h2><span class="sub">意味は取れるが、まだ綴りで座礁する語（${reefs.length}）</span></div>
        ${reefs.map(w => `
          <div class="reef-row">
            <span class="w">${w.wordString}</span>
            <span class="m">${w.word.meanings?.[0]?.meaning ?? ''}</span>
            <span class="badge${w.incorrectCount === 0 ? ' clean' : ''}">復習${w.reviewCount}・✗${w.incorrectCount}</span>
          </div>`).join('')}
        ${reefs.length
          ? `<div class="pf-cta"><button id="pf-cta-btn">${L.reefCta(reefs.length)}</button></div>`
          : `<div class="pf-empty">いまは綴りの暗礁はありません</div>`}
      </div>
    `;

    // CTA: 綴りの暗礁だけの特訓ドリルを開く（練習モード・SRS ステータスは更新しない）
    const cta = this.overlay.querySelector('#pf-cta-btn');
    if (cta && this.drill) cta.addEventListener('click', () => this.drill.open(reefs));
  }
}
