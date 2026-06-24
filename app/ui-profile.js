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
    // getBBox は表示済み（display:flex）でないと 0 を返すため、表示確定後にラベル衝突回避を走らせる
    requestAnimationFrame(() => {
      this.overlay.querySelectorAll('svg.bubble-chart').forEach(svg => this._dejitterLabels(svg));
    });
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
      // data-cx/cy にバブル中心を保持（描画後 _dejitterLabels が実測でずらした際のリーダー線の基点）
      g += `<text class="bc-blabel" x="${x.toFixed(1)}" y="${(y + 2.8).toFixed(1)}" text-anchor="middle" data-cx="${x.toFixed(1)}" data-cy="${y.toFixed(1)}">${p.name}</text>`;
    });
    const PAD = 10;
    const vbTop = yLblY - PAD;
    const vbH   = (200 + PAD) - vbTop;
    return `<svg class="bubble-chart" viewBox="0 ${vbTop} ${Wd} ${vbH}" preserveAspectRatio="xMidYMid meet">${g}</svg>`;
  }

  // -------------------------------------------------------
  // ラベル衝突回避（方式A: 描画後に getBBox で実測 → 縦に押し下げ → 離れたらリーダー線）
  // バブルは少数（品詞 ~5・カテゴリ ~8）なので素朴な反復緩和で十分。
  // -------------------------------------------------------
  _dejitterLabels(svg) {
    const labels = [...svg.querySelectorAll('.bc-blabel')];
    if (labels.length < 2) return;

    const GAP = 1.2;        // ラベル間の最小縦アキ（user units）
    const LEAD_MIN = 4;     // この距離以上ずらしたらリーダー線を引く

    // 元位置で矩形を実測（x は固定・縦のみ動かすので dy で追跡）
    const items = labels.map(el => {
      const bb = el.getBBox();
      return {
        el,
        x: +el.getAttribute('x'),
        y0: +el.getAttribute('y'),
        cx: +el.dataset.cx,
        cy: +el.dataset.cy,
        left: bb.x, right: bb.x + bb.width,
        top0: bb.y, h: bb.height,
        dy: 0,
      };
    });

    // 反復緩和: x が重なるペアの縦重なりを解消（中心が下のラベルを下へ押す）
    for (let iter = 0; iter < 24; iter++) {
      let moved = false;
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const a = items[i], b = items[j];
          if (a.left >= b.right || b.left >= a.right) continue;   // x 非重複
          const aTop = a.top0 + a.dy, aBot = aTop + a.h;
          const bTop = b.top0 + b.dy, bBot = bTop + b.h;
          const overlap = Math.min(aBot, bBot) - Math.max(aTop, bTop);
          if (overlap <= -GAP) continue;                          // 既に GAP 以上離れている
          const push = overlap + GAP;
          if (aTop + a.h / 2 <= bTop + b.h / 2) b.dy += push;      // 中心が下の方を押し下げ
          else a.dy += push;
          moved = true;
        }
      }
      if (!moved) break;
    }

    // 適用 + リーダー線（バブル中心 → ずらしたラベルの上端中央）
    const ns = 'http://www.w3.org/2000/svg';
    const firstLabel = labels[0];
    let maxBottom = -Infinity;
    for (const it of items) {
      maxBottom = Math.max(maxBottom, it.top0 + it.dy + it.h);
      if (Math.abs(it.dy) < 0.5) continue;
      it.el.setAttribute('y', (it.y0 + it.dy).toFixed(1));
      if (it.dy >= LEAD_MIN) {
        const line = document.createElementNS(ns, 'line');
        line.setAttribute('class', 'bc-leader');
        line.setAttribute('x1', it.cx.toFixed(1));
        line.setAttribute('y1', it.cy.toFixed(1));
        line.setAttribute('x2', it.x.toFixed(1));
        line.setAttribute('y2', (it.top0 + it.dy).toFixed(1));    // ラベル上端
        svg.insertBefore(line, firstLabel);                       // ラベルの下に敷く
      }
    }

    // 下にはみ出たラベルが枠（viewBox 下端）で断ち切られないよう、必要なら viewBox を縦に伸ばす
    // （height:auto なのでチャート枠が少し縦長になるだけ・凡例とは重ならない）
    const vb = svg.viewBox.baseVal;
    const MARGIN = 2;
    if (maxBottom + MARGIN > vb.y + vb.height) {
      svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.width} ${(maxBottom + MARGIN - vb.y).toFixed(1)}`);
    }
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
        <div class="pf-sec-head"><h2>${L.catSection}</h2><span class="sub">渦は誤答数において上位8カテゴリ（語数5以上）</span></div>
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
