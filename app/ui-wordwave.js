// app/ui-wordwave.js — Word Wave 全画面ビュー

import { getMeaning } from './ui-cards.js';

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
        label.textContent = `🌊 Wave ${waveNum}`;
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
    const maxWave  = this.state.activeWaves.length > 0
      ? Math.max(...this.state.activeWaves) : 1;
    const hVals = words.filter(w => w.h > 0).map(w => w.h);
    const avgH  = hVals.length > 0
      ? Math.round(hVals.reduce((a, b) => a + b, 0) / hVals.length) : 0;

    const statsEl = this.overlay.querySelector('#wordwave-stats');
    if (statsEl) {
      statsEl.innerHTML =
        `<span>学習: <b>${learned}/${total}</b></span>` +
        `<span>定着: <b>${mastered}</b></span>` +
        `<span>Wave <b>${maxWave}</b></span>` +
        `<span>avgH: <b>${avgH}日</b></span>`;
    }

    // アクティブウェーブのラベルを強調
    const activeSet = new Set(this.state.activeWaves);
    this.overlay.querySelectorAll('.ww-wave-label').forEach(el => {
      el.classList.toggle('active', activeSet.has(parseInt(el.dataset.wave)));
    });
  }

  // -------------------------------------------------------
  // 単語ポップオーバー
  // -------------------------------------------------------
  _showPopover(word) {
    const rawWord  = typeof word.word === 'object' ? word.word : { word: word.wordString, pos: 'other' };
    const pos      = rawWord.pos || 'other';
    const phonetic = rawWord.phonetic || '';
    const meaning  = getMeaning(word.wordString, pos);

    const stageNames = {
      new: '未学習', intro: 'Intro', recognition: 'Recognition',
      recall: 'Recall', dictation: 'Dictation', handwrite: 'Handwrite', mastered: 'Mastered',
    };
    const stageName = stageNames[word.stage] ?? word.stage;

    const popover = this.overlay.querySelector('#word-popover');
    popover.innerHTML = `
      <div class="ww-pop-word">${word.wordString}</div>
      ${phonetic ? `<div class="ww-pop-phonetic">${phonetic}</div>` : ''}
      <div class="ww-pop-meaning">${meaning}</div>
      <div class="ww-pop-divider"></div>
      <div class="ww-pop-row"><span>Stage</span><span>${stageName}</span></div>
      <div class="ww-pop-row"><span>h</span><span>${word.h > 0 ? word.h.toFixed(1) + '日' : '—'}</span></div>
      <div class="ww-pop-row"><span>peakH</span><span>${word.peakH > 0 ? word.peakH.toFixed(1) + '日' : '—'}</span></div>
      <div class="ww-pop-row"><span>Reviews</span><span>${word.reviewCount}回 (正解${word.correctCount})</span></div>
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
