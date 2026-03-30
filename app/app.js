// app/app.js — VocabFlow インタラクティブプロトタイプ メインコントローラー

import { createConfig }                  from '../core/config.js';
import { WordState, Card, LearnerState } from '../core/models.js';
import { SRSEngine }                     from '../core/srs-engine.js';
import { WaveManager }                   from '../core/wave-manager.js';
import { FeedGenerator }                 from '../core/feed-generator.js';
import { WORD_DATA }                     from '../core/word-data.js';
import { HeatmapRenderer }               from './ui-heatmap.js';
import { CardRenderer }                  from './ui-cards.js';

const STORAGE_KEY = 'vocabflow_state_v1';

// -------------------------------------------------------
// App
// -------------------------------------------------------
class VocabFlowApp {
  constructor() {
    this.config      = createConfig();
    this.state       = null;
    this.engine      = null;
    this.waveManager = null;
    this.feedGen     = null;

    // セッション状態
    this.sessionCards   = [];
    this.cardIndex      = 0;
    this.retryCount     = new Map();
    this.sessionCorrect = 0;
    this.sessionWrong   = 0;

    // スワイプ状態
    this._transitioning = false;  // アニメーション中は二重遷移を防ぐ
    this._touchStartY   = 0;

    // Renderers
    this.heatmap      = null;
    this.cardRenderer = null;

    this._bindStartScreen();
  }

  // -------------------------------------------------------
  // スタート画面
  // -------------------------------------------------------
  _bindStartScreen() {
    document.getElementById('btn-start').addEventListener('click', () => {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          this.state = LearnerState.fromJSON(JSON.parse(saved));
          this._boot();
          return;
        } catch (e) {
          console.warn('State load failed, starting fresh:', e);
        }
      }
      this._freshStart();
    });

    document.getElementById('btn-start-reset').addEventListener('click', () => {
      this._freshStart();
    });
  }

  _freshStart() {
    localStorage.removeItem(STORAGE_KEY);
    this._initState();
    this._boot();
  }

  _initState() {
    const words = WORD_DATA.map(wd =>
      new WordState(wd.id, wd, Math.ceil(wd.id / this.config.waveSize))
    );
    this.state = new LearnerState(words, this.config);
  }

  // -------------------------------------------------------
  // Boot: SRSモジュール初期化 → UI表示
  // -------------------------------------------------------
  _boot() {
    this.engine      = new SRSEngine(this.config);
    this.waveManager = new WaveManager(this.config, this.state);
    this.feedGen     = new FeedGenerator(this.config, this.engine, this.waveManager);

    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';

    // Heatmap
    const canvas  = document.getElementById('heatmap-canvas');
    const tooltip = document.getElementById('heatmap-tooltip');
    this.heatmap = new HeatmapRenderer(canvas, tooltip, this.state.words);
    window.addEventListener('resize', () => this.heatmap.render());

    // タッチ非対応環境（PC）では「次のカードへ ↓」ボタンを表示
    const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    const nextCardBtn = document.getElementById('btn-next-card');
    if (!isTouch) nextCardBtn.hidden = false;

    // CardRenderer: onReady はスワイプ可能化だけを行う
    const wrapper = document.getElementById('card-wrapper');
    this.cardRenderer = new CardRenderer(wrapper, this.engine, (_result) => {
      document.getElementById('card-area').classList.add('swipe-ready');
      if (!isTouch) nextCardBtn.classList.add('ready');
    });

    if (!isTouch) {
      nextCardBtn.addEventListener('click', () => this._onSwipeUp());
    }

    this._setupSwipeGestures();
    this._bindOverlayButtons();
    this._startSession();
  }

  // -------------------------------------------------------
  // スワイプ/ホイールジェスチャーのセットアップ
  // -------------------------------------------------------
  _setupSwipeGestures() {
    const area = document.getElementById('card-area');

    // ----- タッチ -----
    area.addEventListener('touchstart', (e) => {
      this._touchStartY = e.touches[0].clientY;
    }, { passive: true });

    area.addEventListener('touchend', (e) => {
      const dy = this._touchStartY - e.changedTouches[0].clientY;
      if (dy > 40) {            // 40px 以上の上スワイプ
        this._onSwipeUp();
      }
    }, { passive: true });

    // ----- マウスホイール（PC） -----
    area.addEventListener('wheel', (e) => {
      if (e.deltaY > 30) {      // 下スクロール = 次のカードへ（TikTok 方式）
        this._onSwipeUp();
      }
    }, { passive: true });

    // ----- キーボード（開発者向け） -----
    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp' || e.key === ' ') {
        e.preventDefault();
        this._onSwipeUp();
      }
    });
  }

  // -------------------------------------------------------
  // スワイプアップ → カード遷移
  // -------------------------------------------------------
  _onSwipeUp() {
    if (this._transitioning) return;
    if (!this.cardRenderer.isSwipeReady()) return;

    this._transitioning = true;
    document.getElementById('card-area').classList.remove('swipe-ready');
    document.getElementById('btn-next-card').classList.remove('ready');

    const result = this.cardRenderer.getPendingResult();

    this.cardRenderer.animateOut(() => {
      this._transitioning = false;
      this._processAnswer(result);
    });
  }

  // -------------------------------------------------------
  // セッション開始
  // -------------------------------------------------------
  _startSession() {
    const cards = this.feedGen.generateSession(this.state, this.state.currentTime);

    if (cards.length === 0) {
      this._showNoWork();
      return;
    }

    this.sessionCards   = cards;
    this.cardIndex      = 0;
    this.retryCount     = new Map();
    this.sessionCorrect = 0;
    this.sessionWrong   = 0;
    this.state.sessionsCompleted++;

    this._transitioning = false;
    this._updateStats();
    this._showCard();
  }

  // -------------------------------------------------------
  // カード表示
  // -------------------------------------------------------
  _showCard() {
    const card = this.sessionCards[this.cardIndex];
    if (!card) {
      this._completeSession();
      return;
    }

    document.getElementById('card-area').classList.remove('swipe-ready');
    document.getElementById('btn-next-card').classList.remove('ready');
    this._updateProgress();
    this.cardRenderer.render(card);
  }

  // -------------------------------------------------------
  // カード回答処理（スワイプ後に呼ばれる）
  // -------------------------------------------------------
  _processAnswer(result) {
    const card = this.sessionCards[this.cardIndex];
    const word = card.word;

    if (card.isRetry) {
      if (result !== 'wrong') {
        word.stage = card.stageBeforeWrong;  // 降格キャンセル（h 更新なし）
        this.sessionCorrect++;
      } else {
        this.engine.processResponse(word, card.cardType, result, this.state.currentTime);
        this.sessionWrong++;
        const count = (this.retryCount.get(word.wordId) || 0) + 1;
        this.retryCount.set(word.wordId, count);
        if (count < this.config.maxRetryPerCard) {
          this._insertRetry(card, word.stage);
        }
      }
    } else {
      if (result !== 'wrong') {
        this.engine.processResponse(word, card.cardType, result, this.state.currentTime);
        this.sessionCorrect++;
      } else {
        const stageBefore = word.stage;
        this.engine.processResponse(word, card.cardType, result, this.state.currentTime);
        this.sessionWrong++;
        const count = this.retryCount.get(word.wordId) || 0;
        if (count < this.config.maxRetryPerCard) {
          this._insertRetry(card, stageBefore);
          this.retryCount.set(word.wordId, count + 1);
        }
      }
    }

    this.state.totalCardsConsumed++;
    this.heatmap.render();
    this._updateStats();
    this._updateProgress();

    this.cardIndex++;
    this._showCard();
  }

  // -------------------------------------------------------
  // リトライカード挿入
  // -------------------------------------------------------
  _insertRetry(originalCard, stageBeforeWrong) {
    const rc = new Card(originalCard.word, originalCard.cardType);
    rc.isRetry = true;
    rc.stageBeforeWrong = stageBeforeWrong;
    const insertPos = Math.min(
      this.cardIndex + 1 + this.config.retryGap,
      this.sessionCards.length
    );
    this.sessionCards.splice(insertPos, 0, rc);
  }

  // -------------------------------------------------------
  // セッション完了
  // -------------------------------------------------------
  _completeSession() {
    this._saveState();
    this._showComplete();
  }

  // -------------------------------------------------------
  // 時間早送り
  // -------------------------------------------------------
  _advanceTime(days) {
    this.state.currentTime += days;
    this._hideOverlays();
    this._startSession();
  }

  // -------------------------------------------------------
  // 保存
  // -------------------------------------------------------
  _saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state.toJSON()));
    } catch (e) {
      console.warn('State save failed:', e);
    }
  }

  // -------------------------------------------------------
  // リセット
  // -------------------------------------------------------
  _reset() {
    localStorage.removeItem(STORAGE_KEY);
    this._initState();
    this.engine      = new SRSEngine(this.config);
    this.waveManager = new WaveManager(this.config, this.state);
    this.feedGen     = new FeedGenerator(this.config, this.engine, this.waveManager);
    this.heatmap = new HeatmapRenderer(
      document.getElementById('heatmap-canvas'),
      document.getElementById('heatmap-tooltip'),
      this.state.words
    );
    this._hideOverlays();
    this._startSession();
  }

  // -------------------------------------------------------
  // Overlay ボタンのバインド
  // -------------------------------------------------------
  _bindOverlayButtons() {
    const sess = 1 / this.config.sessionsPerDay;

    document.getElementById('btn-next-session').addEventListener('click', () => this._advanceTime(sess));
    document.getElementById('btn-next-day').addEventListener('click',     () => this._advanceTime(1));
    document.getElementById('btn-next-week').addEventListener('click',    () => this._advanceTime(7));
    document.getElementById('btn-continue').addEventListener('click', () => {
      this._hideOverlays();
      this._startSession();
    });
    document.getElementById('btn-reset-from-complete').addEventListener('click', () => this._reset());

    document.getElementById('nw-next-session').addEventListener('click', () => this._advanceTime(sess));
    document.getElementById('nw-next-day').addEventListener('click',     () => this._advanceTime(1));
    document.getElementById('nw-next-week').addEventListener('click',    () => this._advanceTime(7));
    document.getElementById('btn-reset-from-nowork').addEventListener('click', () => this._reset());
  }

  // -------------------------------------------------------
  // Overlay 表示
  // -------------------------------------------------------
  _showComplete() {
    const total = this.sessionCorrect + this.sessionWrong;
    const acc   = total > 0 ? Math.round((this.sessionCorrect / total) * 100) + '%' : '–';

    document.getElementById('oc-cards').textContent    = total;
    document.getElementById('oc-acc').textContent      = acc;
    document.getElementById('oc-learned').textContent  = this.state.learnedCount;
    document.getElementById('oc-mastered').textContent = this.state.masteredCount;
    document.getElementById('oc-day').textContent      = this.state.currentTime.toFixed(1);
    document.getElementById('overlay-complete').style.display = 'flex';
  }

  _showNoWork() {
    document.getElementById('nw-learned').textContent  = this.state.learnedCount;
    document.getElementById('nw-mastered').textContent = this.state.masteredCount;
    document.getElementById('nw-day').textContent      = this.state.currentTime.toFixed(1);
    document.getElementById('overlay-nowork').style.display = 'flex';
  }

  _hideOverlays() {
    document.getElementById('overlay-complete').style.display = 'none';
    document.getElementById('overlay-nowork').style.display   = 'none';
  }

  // -------------------------------------------------------
  // UI 更新
  // -------------------------------------------------------
  _updateProgress() {
    const total   = this.sessionCards.length;
    const current = Math.min(this.cardIndex + 1, total);
    const pct     = total > 0 ? (this.cardIndex / total) * 100 : 0;

    document.getElementById('footer-card-idx').textContent   = current;
    document.getElementById('footer-card-total').textContent = total;
    document.getElementById('progress-bar-fill').style.width = `${pct}%`;
    document.getElementById('footer-correct').textContent = this.sessionCorrect;
    document.getElementById('footer-wrong').textContent   = this.sessionWrong;
  }

  _updateStats() {
    document.getElementById('stat-learned').textContent  = this.state.learnedCount;
    document.getElementById('stat-mastered').textContent = this.state.masteredCount;
    document.getElementById('stat-waves').textContent    = this.state.activeWaves.join(',');
    document.getElementById('stat-day').textContent      = this.state.currentTime.toFixed(1);
    this.heatmap.render();
  }
}

// -------------------------------------------------------
// 起動
// -------------------------------------------------------
new VocabFlowApp();
