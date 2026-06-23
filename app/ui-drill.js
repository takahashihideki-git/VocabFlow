// app/ui-drill.js — 綴りの暗礁 特訓ドリル（練習モード）
//
// プロファイル画面の CTA「この暗礁だけで特訓する」から開く。
// 通常セッションと同じ dictation カード（CardRenderer を再利用）を上下スワイプで
// めくる。ただし SRS ステータス（h・stage・正誤カウント・lastReviewed 等）は一切
// 更新しない＝純粋な練習。
//
// SRS 不変の仕組み: SRS 副作用は CardRenderer 自体ではなく、回答時に呼ばれる
// onReady コールバック（通常は app.js の _onCardAnswered → processResponse）で起きる。
// ここでは onReady を no-op にするため、同じカード描画・フィードバック・スワイプ挙動を
// 保ったまま WordState は読むだけで書き込まれない。判定の judgeDictation も純粋関数。

import { CardRenderer } from './ui-cards.js';
import { SRSEngine } from '../core/srs-engine.js';
import { Card } from '../core/models.js';

const SWIPE_THRESHOLD = 40;   // px（縦スワイプ・通常セッションと同じ感覚）
const WHEEL_THRESHOLD = 30;

export class ReefDrill {
  /**
   * @param {HTMLElement} overlayEl — #drill-overlay
   * @param {Object} config — state.config（judgeDictation 用・判定に副作用なし）
   */
  constructor(overlayEl, config) {
    this.overlay  = overlayEl;
    this.engine   = new SRSEngine(config);   // judgeDictation のみ使用（state は触らない）
    this._words   = [];
    this._idx     = 0;
    this._correct = 0;
    this._answered = 0;

    this._wrapper  = overlayEl.querySelector('#drill-card-wrapper');
    this._cardArea = overlayEl.querySelector('#drill-card-area');
    this._status   = overlayEl.querySelector('#drill-status');
    this._navBtns  = overlayEl.querySelector('#drill-nav-btns');
    this._nextBtn  = overlayEl.querySelector('#drill-next-btn');

    // onReady は SRS には触れず、PC 用「次へ」ボタンの ready 表示だけ更新する（UI のみ）。
    // スコア集計は次へ送る瞬間に getPendingResult で行う。
    this.cardRenderer = new CardRenderer(this._wrapper, this.engine, () => this._onCardReady());

    // 本体と同様にタッチ非対応（PC）を判定し、no-touch レイアウト + ナビボタンを出す
    this._isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    if (!this._isTouch) {
      document.body.classList.add('no-touch');   // 9:16 カードレイアウト（冪等）
      if (this._navBtns) { this._navBtns.hidden = false; this._navBtns.classList.add('visible'); }
      if (this._nextBtn) this._nextBtn.addEventListener('click', () => this._advance());
    }

    this._bindEvents();
    this._bindGestures();
  }

  // カードが回答確定（スワイプ可能）になったら PC ナビボタンを点灯（UI のみ・SRS 不変）
  _onCardReady() {
    if (this._nextBtn) this._nextBtn.classList.add('ready');
  }

  /**
   * @param {WordState[]} words — 出題する弱点語（綴りの暗礁）
   */
  open(words) {
    // 練習なので毎回シャッフル（決定性は不要）
    this._words = [...words].sort(() => Math.random() - 0.5);
    this._idx = 0;
    this._correct = 0;
    this._answered = 0;
    this.overlay.style.display = 'flex';
    if (this._words.length === 0) {
      this._showStatus(`<div class="drill-empty">いまは綴りの暗礁はありません</div>`);
    } else {
      this._showCard();
    }
  }

  close() {
    window.speechSynthesis?.cancel();
    this.overlay.style.display = 'none';
  }

  isOpen() {
    return this.overlay.style.display !== 'none';
  }

  // -------------------------------------------------------
  // カード表示
  // -------------------------------------------------------
  _showCard() {
    window.speechSynthesis?.cancel();
    this._cardArea.style.display = 'flex';
    this._status.style.display = 'none';
    if (this._nextBtn) this._nextBtn.classList.remove('ready');   // 未回答に戻す
    this._updateProgress();
    // 使い捨ての Card（SRS state には保存しない・WordState 参照のみ）
    const card = new Card(this._words[this._idx], 'dictation');
    this.cardRenderer.render(card);
  }

  _advance() {
    if (!this.cardRenderer.isSwipeReady()) return;   // 回答が確定するまで送れない
    // スコア集計（最終結果で・perfect 以外は不正解扱い）。SRS には反映しない。
    this._answered++;
    if (this.cardRenderer.getPendingResult() === 'perfect') this._correct++;

    if (this._idx >= this._words.length - 1) {
      this.cardRenderer.animateOut(() => this._renderSummary());
    } else {
      this._idx++;
      this.cardRenderer.animateOut(() => this._showCard());
    }
  }

  _updateProgress() {
    const el = this.overlay.querySelector('#drill-progress');
    if (el) el.textContent = `${this._idx + 1} / ${this._words.length}`;
  }

  _showStatus(html) {
    this._cardArea.style.display = 'none';
    this._status.style.display = 'flex';
    this._status.innerHTML = html;
    const el = this.overlay.querySelector('#drill-progress');
    if (el) el.textContent = '';
  }

  _renderSummary() {
    window.speechSynthesis?.cancel();
    this._showStatus(`
      <div class="drill-summary">
        <div class="drill-summary-title">特訓おつかれさまでした</div>
        <div class="drill-summary-score">${this._answered}語中 <b>${this._correct}</b>語 正解</div>
        <div class="drill-summary-note">これは練習です。記憶強度・定着の記録は変わっていません。</div>
        <div class="drill-summary-actions">
          <button class="btn-primary" id="drill-again">もう一度</button>
          <button class="btn-ghost" id="drill-done">閉じる</button>
        </div>
      </div>
    `);
    this._status.querySelector('#drill-again').addEventListener('click', () => this.open(this._words));
    this._status.querySelector('#drill-done').addEventListener('click', () => this.close());
  }

  // -------------------------------------------------------
  // イベント・ジェスチャー
  // -------------------------------------------------------
  _bindEvents() {
    const closeBtn = this.overlay.querySelector('#drill-close');
    if (closeBtn) closeBtn.addEventListener('click', () => this.close());

    document.addEventListener('keydown', (e) => {
      if (!this.isOpen()) return;
      if (e.key === 'Escape') { e.preventDefault(); this.close(); return; }
      // 入力欄がフォーカス中（回答前）はキー送りを無効化＝タイプの邪魔をしない。
      // 回答が確定すると input が disabled になるので ↑↓ で次へ送れる。
      if (this.cardRenderer.isSwipeReady() && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        this._advance();
      }
    });
  }

  _bindGestures() {
    const area = this._cardArea;
    let startY = null;

    area.addEventListener('touchstart', (e) => { startY = e.touches[0].clientY; }, { passive: true });
    area.addEventListener('touchend', (e) => {
      if (startY === null) return;
      const dy = e.changedTouches[0].clientY - startY;
      startY = null;
      if (Math.abs(dy) >= SWIPE_THRESHOLD) this._advance();   // 上下どちらのスワイプでも次へ
    }, { passive: true });

    area.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaY) > WHEEL_THRESHOLD) this._advance();
    }, { passive: true });
  }
}
