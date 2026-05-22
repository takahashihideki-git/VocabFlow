// app/ui-wordwave.js — Word Wave 全画面ビュー

import { getMeaning } from './ui-cards.js';
import { LABELS, formatH, formatPRecall } from '../core/labels.js';

// -------------------------------------------------------
// カラーマッピング（spec §2.3）
// -------------------------------------------------------
function getColorForWord(word) {
  if (word.excluded) return { bg: '#3A3A4A', text: '#666677', strike: true };
  if (word.stage === 'new') return { bg: '#2A2A3D', text: '#555566', strike: false };
  const h = word.h;
  if (h < 1)  return { bg: '#FF4444', text: '#fff',  strike: false };
  if (h < 3)  return { bg: '#FF8C00', text: '#fff',  strike: false };
  if (h < 7)  return { bg: '#FFD700', text: '#222',  strike: false };
  if (h < 14) return { bg: '#9ACD32', text: '#222',  strike: false };
  if (h < 30) return { bg: '#32CD32', text: '#222',  strike: false };
  return       { bg: '#006400', text: '#fff',  strike: false };
}

// -------------------------------------------------------
// WordWaveRenderer
// -------------------------------------------------------
export class WordWaveRenderer {
  /**
   * @param {HTMLElement} overlayEl — #wordwave-overlay
   * @param {LearnerState} learnerState
   */
  constructor(overlayEl, learnerState, onStateChange = null) {
    this.overlay        = overlayEl;
    this.state          = learnerState;
    this._onStateChange = onStateChange;
    this._spanMap   = new Map(); // wordId → span element
    this._built     = false;
    this._bulkMode  = false;
    this._selected  = new Set(); // wordId（一括除外選択中）

    this._bindEvents();
  }

  // -------------------------------------------------------
  // 公開 API
  // -------------------------------------------------------

  open() {
    if (!this._built) {
      this._build();
    } else {
      this._refreshAll();
    }
    this._updateStats();
    this.overlay.style.display = 'flex';
  }

  close() {
    if (this._bulkMode) this._exitBulkMode();
    this.overlay.style.display = 'none';
    this._hidePopover();
  }

  isOpen() {
    return this.overlay.style.display !== 'none';
  }

  // カード回答後に単語の色を更新（overlay が非表示でもマップを更新しておく）
  updateWord(wordId) {
    const span = this._spanMap.get(wordId);
    if (!span) return;
    const word = this.state.words.find(w => w.wordId === wordId);
    if (!word) return;
    this._applyColor(span, word);
    if (this.isOpen()) this._updateStats();
  }

  // -------------------------------------------------------
  // 初回 DOM 構築
  // -------------------------------------------------------
  _build() {
    const body  = this.overlay.querySelector('#wordwave-body');
    const words = this.state.words;

    let currentWave    = -1;
    let waveContainer  = null;

    for (const word of words) {
      const waveNum = word.waveNumber;

      if (waveNum !== currentWave) {
        currentWave = waveNum;

        // Wave ラベル（先頭に "W1" 等）
        const label = document.createElement('span');
        label.className  = 'ww-wave-label';
        label.innerHTML = `<span class="wave-icon"></span> Wave ${waveNum}`;
        label.dataset.wave = waveNum;
        body.appendChild(label);

        // Wave グループ（inline-block のラッパー）
        waveContainer = document.createElement('span');
        waveContainer.className   = 'ww-wave-group';
        waveContainer.dataset.wave = waveNum;
        body.appendChild(waveContainer);
      }

      const span = document.createElement('span');
      span.className = 'ww-word';
      span.textContent = word.wordString;
      span.dataset.wordId = word.wordId;
      this._applyColor(span, word);

      span.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this._bulkMode) {
          this._toggleBulkSelect(word.wordId, span);
        } else {
          this._showPopover(word);
        }
      });

      waveContainer.appendChild(span);
      this._spanMap.set(word.wordId, span);
    }

    this._built = true;
  }

  _refreshAll() {
    for (const word of this.state.words) {
      const span = this._spanMap.get(word.wordId);
      if (span) this._applyColor(span, word);
    }
  }

  _applyColor(span, word) {
    const c = getColorForWord(word);
    span.style.backgroundColor = c.bg;
    span.style.color            = c.text;
    span.style.textDecoration   = c.strike ? 'line-through' : 'none';
  }

  // -------------------------------------------------------
  // Stats ヘッダ更新
  // -------------------------------------------------------
  _updateStats() {
    const words    = this.state.words;
    const total    = words.length;
    const learned  = words.filter(w => w.stage !== 'new' && !w.excluded).length;
    const mastered = words.filter(w => w.h >= (this.state.config.masteredThresholdH || 14)).length;
    const maxWave  = words.reduce(
      (max, w) => w.stage !== 'new' ? Math.max(max, w.waveNumber) : max, 1
    );
    const hVals = words.filter(w => w.h > 0).map(w => w.h);
    const avgH  = hVals.length > 0
      ? Math.round(hVals.reduce((a, b) => a + b, 0) / hVals.length) : 0;

    const statsEl = this.overlay.querySelector('#wordwave-stats');
    if (statsEl) {
      statsEl.innerHTML =
        `<span>学習: <b>${learned}/${total}</b></span>` +
        `<span>定着: <b>${mastered}</b></span>` +
        `<span>${LABELS.params.avgH}: <b>${formatH(avgH)}</b></span>`;
    }

    const waveEl = this.overlay.querySelector('#wordwave-wave');
    if (waveEl) {
      waveEl.textContent = `Wave ${maxWave}`;
    }

    const timeEl = this.overlay.querySelector('#wordwave-time');
    if (timeEl) {
      timeEl.textContent = `Day ${Math.floor(this.state.currentTime)}`;
    }

    // アクティブウェーブのラベルを強調
    const activeSet = new Set(this.state.activeWaves);
    this.overlay.querySelectorAll('.ww-wave-label').forEach(el => {
      el.classList.toggle('active', activeSet.has(parseInt(el.dataset.wave)));
    });

    // ペース予測セクション更新（潮の状態 + 全Wave制覇予測）
    const paceEl = this.overlay.querySelector('#ww-pace-section');
    if (paceEl) {
      const threshold   = this.state.config?.masteredThresholdH ?? 14;
      const target      = words.filter(w => !w.excluded).length;
      const masteredNow = words.filter(w => !w.excluded && w.h >= threshold).length;
      const currentDay  = this.state.currentTime;
      const remaining   = target - masteredNow;

      if (remaining === 0) {
        paceEl.innerHTML = `<span class="ww-pace-complete">🏆 全Wave制覇達成！</span>`;
      } else {
        // --- 潮の状態（足元のリズム） ---
        const tide = this._computeTide();
        let tideHtml = '';
        if (tide && tide.state === 'flood') {
          tideHtml =
            `<div class="ww-tide-line ww-tide--flood">` +
            `<span class="wave-icon"></span> いまは満ち潮 — 新しい単語が次々と入ってくる時期です</div>`;
        } else if (tide && tide.state === 'ebb') {
          // 復習の山を学習者のセッションペースで消化したら満ち潮が戻る、と外挿
          let forecast = '';
          const cfg = this.state.config;
          const sessionPace = currentDay >= 1
            ? this.state.sessionsCompleted / currentDay : 0;
          if (sessionPace > 0 && this.state.sessionsCompleted >= 3) {
            const excess   = tide.reviewDemand - (cfg.sessionSize - tide.floodSlots);
            const daysLeft = excess / (sessionPace * cfg.sessionSize);
            if (daysLeft < 0.75) {
              forecast = ` <b>まもなく満ち潮に変わります。</b>`;
            } else {
              const d = Math.round(daysLeft);
              forecast = ` <b>次の満ち潮は約${d}日後（Day ${Math.round(currentDay + d)} 頃）です。</b>`;
            }
          }
          tideHtml =
            `<div class="ww-tide-line ww-tide--ebb">` +
            `🐚 いまは引き潮 — 覚えた単語の定着を固める時期です。${forecast}</div>`;
        } else if (tide) {
          tideHtml =
            `<div class="ww-tide-line ww-tide--slack">` +
            `🌙 いまは凪 — 復習も新語もおだやかな時期です</div>`;
        }

        // --- 全Wave制覇予測（遠くの目的地） ---
        let goalHtml;
        if (masteredNow < 10 || currentDay < 1) {
          goalHtml =
            `<div class="ww-goal-line">` +
            `<span class="ww-pace-waiting">定着語が増えると全Wave制覇の予測が表示されます</span></div>`;
        } else {
          const pace     = masteredNow / currentDay;
          const daysLeft = Math.round(remaining / pace);
          const estDay   = Math.round(currentDay + daysLeft);
          goalHtml =
            `<div class="ww-goal-line">` +
            `<span class="ww-pace-label">このペースで続けると</span>` +
            `<span class="ww-pace-value">全Wave制覇は<b>約${daysLeft}日後</b>です。（Day ${estDay} 頃）</span>` +
            `</div>`;
        }

        paceEl.innerHTML = tideHtml + goalHtml;
      }
    }
  }

  // -------------------------------------------------------
  // 潮の状態判定（次セッションの新語枠の埋まり方から）
  //
  // feed-generator の貪欲割当（skipped→urgent→due→new）を先読みし、
  // 次セッションで新語が何枠入るか（newSlots）を見積もる:
  //   満ち潮 (flood): newSlots >= 3 — 新語が入ってくる時期
  //   引き潮 (ebb)  : 復習需要が枠を埋め、新語が押し出されている時期
  //   凪    (slack) : 復習も新語も少ない穏やかな時期（終盤など）
  // -------------------------------------------------------
  _computeTide() {
    const cfg = this.state.config;
    if (!cfg) return null;

    const t  = this.state.currentTime;
    const rf = Math.log2(1 / cfg.targetRetention);
    const activeSet = new Set(this.state.activeWaves);

    let skipped = 0, urgent = 0, due = 0, newAvail = 0;
    for (const w of this.state.words) {
      if (w.excluded) continue;
      if (w.skipped)  { skipped++; continue; }
      if (w.stage === 'new') {
        if (activeSet.has(w.waveNumber)) newAvail++;
        continue;
      }
      const p = w.pRecall(t);
      if (w.stage === 'mastered') {
        if (p < 0.5) urgent++;
        else if (p < cfg.targetRetention) due++;
        continue;
      }
      if (p < 0.5) { urgent++; continue; }
      // uncertain は貪欲割当で new より後段 → 新語を押し出さない
      if (w.currentSigma(t, cfg.sigmaDecay) > cfg.uncertainThreshold) continue;
      const optimalNextReview = w.lastReviewed + (w.h > 0 ? w.h * rf : 0);
      if (t >= optimalNextReview) due++;
    }

    const floodSlots   = 3;
    const reviewDemand = skipped + urgent + due;
    const newSlots = Math.min(
      newAvail,
      Math.max(0, cfg.sessionSize - reviewDemand),
      cfg.maxNewPerSession
    );

    let state;
    if (newSlots >= floodSlots) state = 'flood';
    else if (reviewDemand >= cfg.sessionSize - (floodSlots - 1)) state = 'ebb';
    else state = 'slack';

    return { state, reviewDemand, newSlots, floodSlots };
  }

  // -------------------------------------------------------
  // 単語ポップオーバー
  // -------------------------------------------------------
  _showPopover(word) {
    const rawWord  = typeof word.word === 'object' ? word.word : { word: word.wordString, pos: 'other' };
    const pos      = rawWord.pos || 'other';
    const phonetic = rawWord.phonetic || '';
    const meaning  = getMeaning(word.wordString, pos);

    const stageName = LABELS.cardTypes[word.stage]
      ?? (word.stage === 'new' ? '未学習' : word.stage === 'mastered' ? 'Mastered' : word.stage);

    const popover = this.overlay.querySelector('#word-popover');
    popover.innerHTML = `
      <div class="ww-pop-word">${word.wordString}</div>
      ${phonetic ? `<div class="ww-pop-phonetic">${phonetic}</div>` : ''}
      <div class="ww-pop-meaning">${meaning}</div>
      <div class="ww-pop-divider"></div>
      <div class="ww-pop-row"><span>Stage</span><span>${stageName}</span></div>
      <div class="ww-pop-row"><span>${LABELS.params.h}</span><span>${formatH(word.h)}</span></div>
      <div class="ww-pop-row"><span>${LABELS.params.peakH}</span><span>${formatH(word.peakH)}</span></div>
      <div class="ww-pop-row"><span>${LABELS.params.pRecall}</span><span>${word.stage === 'new' ? '—' : formatPRecall(word.pRecall(this.state.currentTime))}</span></div>
      <div class="ww-pop-row"><span>最終復習</span><span>${word.lastReviewed > 0 ? `Day ${Math.floor(word.lastReviewed)}` : '—'}</span></div>
      <div class="ww-pop-row"><span>${LABELS.params.reviewCount}</span><span>${word.reviewCount}回 (正解${word.correctCount})</span></div>
      <div class="ww-pop-divider"></div>
      <button class="ww-pop-exclude-btn${word.excluded ? ' restore' : ''}" id="ww-pop-exclude-btn">
        ${word.excluded ? '除外を解除' : '除外する'}
      </button>
      <button class="ww-pop-close-btn" id="ww-pop-close-btn">閉じる</button>
    `;
    popover.style.display = 'flex';

    popover.querySelector('#ww-pop-exclude-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleExclude(word);
    });

    popover.querySelector('#ww-pop-close-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      this._hidePopover();
    });
  }

  _hidePopover() {
    const popover = this.overlay.querySelector('#word-popover');
    if (popover) popover.style.display = 'none';
  }

  _toggleExclude(word) {
    if (!word.excluded) {
      if (!confirm(`"${word.wordString}" を学習対象から除外しますか？（後から戻せます）`)) return;
      word.excluded = true;
    } else {
      word.excluded = false;
    }
    this._onStateChange?.();
    this.updateWord(word.wordId);
    // ポップオーバーのボタンテキストを更新
    this._showPopover(word);
  }

  // -------------------------------------------------------
  // 一括除外モード
  // -------------------------------------------------------
  _enterBulkMode() {
    this._bulkMode = true;
    this._selected.clear();
    this._hidePopover();
    this.overlay.classList.add('bulk-mode');
    this.overlay.querySelector('#wordwave-bulk-bar').style.display = 'flex';
    this._updateBulkCount();
  }

  _exitBulkMode() {
    this._bulkMode = false;
    this._selected.clear();
    this.overlay.classList.remove('bulk-mode');
    this.overlay.querySelector('#wordwave-bulk-bar').style.display = 'none';
    // 選択ハイライトを解除
    this._spanMap.forEach((span) => span.classList.remove('selected'));
  }

  _toggleBulkSelect(wordId, span) {
    const word = this.state.words.find(w => w.wordId === wordId);
    // すでに除外済みの語は選択不可
    if (word?.excluded) return;

    if (this._selected.has(wordId)) {
      this._selected.delete(wordId);
      span.classList.remove('selected');
    } else {
      this._selected.add(wordId);
      span.classList.add('selected');
    }
    this._updateBulkCount();
  }

  _updateBulkCount() {
    const el = this.overlay.querySelector('#ww-bulk-count');
    if (el) el.textContent = `${this._selected.size}語を選択中`;
  }

  _confirmBulk() {
    if (this._selected.size === 0) { this._exitBulkMode(); return; }
    if (!confirm(`選択中の ${this._selected.size} 語を学習対象から除外しますか？`)) return;
    for (const wordId of this._selected) {
      const word = this.state.words.find(w => w.wordId === wordId);
      if (word) {
        word.excluded = true;
        const span = this._spanMap.get(wordId);
        if (span) {
          span.classList.remove('selected');
          this._applyColor(span, word);
        }
      }
    }
    this._onStateChange?.();
    this._exitBulkMode();
    this._updateStats();
  }

  // -------------------------------------------------------
  // イベントバインド
  // -------------------------------------------------------
  _bindEvents() {
    // 閉じるボタン
    const closeBtn = this.overlay.querySelector('#wordwave-close');
    if (closeBtn) closeBtn.addEventListener('click', () => this.close());

    // 一括除外ボタン（モード中はもう一度押すとキャンセル）
    const bulkBtn = this.overlay.querySelector('#ww-bulk-btn');
    if (bulkBtn) bulkBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this._bulkMode) this._exitBulkMode();
      else this._enterBulkMode();
    });

    // 一括除外バー: OK / Cancel
    const bulkOk = this.overlay.querySelector('#ww-bulk-ok');
    if (bulkOk) bulkOk.addEventListener('click', (e) => {
      e.stopPropagation();
      this._confirmBulk();
    });

    const bulkCancel = this.overlay.querySelector('#ww-bulk-cancel');
    if (bulkCancel) bulkCancel.addEventListener('click', (e) => {
      e.stopPropagation();
      this._exitBulkMode();
    });

    // ズームスライダー
    const slider = this.overlay.querySelector('#zoom-slider');
    if (slider) {
      slider.addEventListener('input', (e) => {
        const body = this.overlay.querySelector('#wordwave-body');
        body.style.fontSize = `${e.target.value}px`;
      });
    }

    // overlay クリック（単語以外）でポップオーバーを閉じる
    this.overlay.addEventListener('click', () => this._hidePopover());

    // ESC キーで閉じる
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) {
        e.preventDefault();
        this.close();
      }
    });
  }
}
