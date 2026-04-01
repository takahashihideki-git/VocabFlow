// app/app.js — VocabFlow インタラクティブプロトタイプ メインコントローラー

import { createConfig }                  from '../core/config.js';
import { WordState, Card, LearnerState } from '../core/models.js';
import { SRSEngine }                     from '../core/srs-engine.js';
import { WaveManager }                   from '../core/wave-manager.js';
import { FeedGenerator }                 from '../core/feed-generator.js';
import { WORD_DATA }                     from '../core/word-data.js';
import { HeatmapRenderer }               from './ui-heatmap.js';
import { CardRenderer }                  from './ui-cards.js';
import { WordWaveRenderer }              from './ui-wordwave.js';
import { LABELS }                        from '../core/labels.js';
import { BackgroundManager }             from './ui-background.js';

const IS_DEV = new URLSearchParams(location.search).has('dev');
const STORAGE_KEY = IS_DEV ? 'vocabflow_state_dev_v1' : 'vocabflow_state_v1';

// dev モード: 少数語 + 縮小 config で状態遷移・Wave 解放を素早く確認
const DEV_CONFIG = {
  waveSize: 3,             // 3語×Wave → 10語で Wave 1〜3 が存在
  sessionSize: 5,
  maxNewPerSession: 3,
  masteredThresholdH: 2.0, // 早期 mastered
  dictationThresholdH: 1.5,
  waveUnlockH: 1.5,
  waveUnlockRatio: 0.7,
};
const DEV_WORD_COUNT = 9; // Wave 1〜3 × waveSize(3) = 9語

// -------------------------------------------------------
// App
// -------------------------------------------------------
class VocabFlowApp {
  constructor() {
    this.config      = createConfig(IS_DEV ? DEV_CONFIG : {});
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
    this.wordWave     = null;

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
    const source = IS_DEV ? WORD_DATA.slice(0, DEV_WORD_COUNT) : WORD_DATA;
    const words = source.map(wd =>
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

    if (IS_DEV) {
      document.body.classList.add('dev-mode');
      const badge = document.createElement('div');
      badge.id = 'dev-badge';
      badge.textContent = `DEV ${DEV_WORD_COUNT}語 / Wave×${DEV_CONFIG.waveSize}`;
      document.body.appendChild(badge);
    }

    // Heatmap
    const canvas  = document.getElementById('heatmap-canvas');
    const tooltip = document.getElementById('heatmap-tooltip');
    this.heatmap = new HeatmapRenderer(canvas, tooltip, this.state.words);
    window.addEventListener('resize', () => this.heatmap.render());

    // Word Wave
    const wwOverlay = document.getElementById('wordwave-overlay');
    this.wordWave = new WordWaveRenderer(wwOverlay, this.state, () => this._saveState());
    document.getElementById('heatmap-section').addEventListener('click', () => {
      document.getElementById('heatmap-tooltip').style.display = 'none';
      this.wordWave.open();
    });

    // タッチ非対応環境（PC）ではナビボタンを表示し、body に no-touch クラスを付与
    const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    if (!isTouch) {
      document.body.classList.add('no-touch');
      document.getElementById('pc-nav-btns').classList.add('visible');
      document.getElementById('btn-next-card').addEventListener('click', () => this._onSwipeUp());
      document.getElementById('btn-prev-card').addEventListener('click', () => this._onSwipeDown());
    }

    // CardRenderer: onReady はスワイプ可能化、onSkip はスキップ処理
    const wrapper = document.getElementById('card-wrapper');
    this.bgManager = new BackgroundManager();
    this.cardRenderer = new CardRenderer(
      wrapper,
      this.engine,
      (_result) => {
        document.getElementById('card-area').classList.add('swipe-ready');
        if (!isTouch) document.getElementById('btn-next-card').classList.add('ready');
      },
      this.bgManager
    );

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
      this._touchStartY    = e.touches[0].clientY;
      this._touchInScroll  = !!e.target.closest('.passive-scroll');
    }, { passive: true });

    area.addEventListener('touchend', (e) => {
      if (this._touchInScroll) { this._touchInScroll = false; return; }
      const dy = this._touchStartY - e.changedTouches[0].clientY;
      if (dy > 40) {
        document.body.classList.add('swiped-once');
        this._onSwipeUp();
      } else if (dy < -40) {
        document.body.classList.add('swiped-once');
        this._onSwipeDown();
      }
    }, { passive: true });

    // ----- マウスホイール（PC） -----
    area.addEventListener('wheel', (e) => {
      if (e.target.closest('.passive-scroll')) return; // passive-scroll 内は native scroll に委ねる
      if (e.deltaY > 30) {      // 下スクロール = 次のカードへ（TikTok 方式）
        this._onSwipeUp();
      } else if (e.deltaY < -30) {
        this._onSwipeDown();
      }
    }, { passive: true });

    // ----- キーボード（開発者向け） -----
    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp' || e.key === ' ') {
        e.preventDefault();
        this._onSwipeUp();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        this._onSwipeDown();
      }
    });
  }

  // -------------------------------------------------------
  // スワイプアップ → 次のカードへ
  // -------------------------------------------------------
  _onSwipeUp() {
    if (this._transitioning) return;

    const card = this.sessionCards[this.cardIndex];
    if (!card) return;

    // 履歴モード（戻りスワイプで来た、または回答済みカード）
    if (card.done) {
      this._transitioning = true;
      document.getElementById('card-area').classList.remove('swipe-ready');
      this.cardRenderer.animateOut(() => {
        this._transitioning = false;
        this.cardIndex++;
        this._showCard();
      });
      return;
    }

    // 通常モード: 未回答でスキップ可能なカードならスキップ
    if (!this.cardRenderer.isSwipeReady()) {
      const skippable = ['recognition', 'recall', 'dictation', 'handwrite'];
      if (skippable.includes(card.cardType)) {
        this._skipCard();
      }
      return;
    }

    // 通常モード: 回答済み → 処理して次へ
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
  // スワイプダウン → 前のカードへ（戻りスワイプ）
  // -------------------------------------------------------
  _onSwipeDown() {
    if (this._transitioning) return;
    if (this.cardIndex <= 0) return;

    this._transitioning = true;
    document.getElementById('card-area').classList.remove('swipe-ready');
    document.getElementById('btn-next-card').classList.remove('ready');

    this.cardRenderer.animateOutDown(() => {
      this._transitioning = false;
      this.cardIndex--;
      this._showCard();
    });
  }

  // -------------------------------------------------------
  // スキップ処理
  // -------------------------------------------------------
  _skipCard() {
    if (this._transitioning) return;
    const card = this.sessionCards[this.cardIndex];
    if (!card) return;

    card.done = true;
    card.word.skipped = true; // 次セッションで最優先再出題
    this._saveState();

    this._transitioning = true;
    document.getElementById('card-area').classList.remove('swipe-ready');
    document.getElementById('btn-next-card').classList.remove('ready');

    this.state.totalCardsConsumed++;
    this._updateStats();

    this.cardRenderer.animateOut(() => {
      this._transitioning = false;
      this.cardIndex++;
      this._showCard();
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

    // セッション内のカテゴリ画像をプリロード
    const categoryIds = [...new Set(cards.map(c => {
      const rw = typeof c.word.word === 'object' ? c.word.word : {};
      return rw.categoryId ?? 0;
    }))];
    this.bgManager?.preload(categoryIds);

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

    if (card.done) {
      if (card.result === null) {
        // スキップ済み未回答 → 同じカードを再出題（スキップ状態を解除）
        card.done = false;
        card.word.skipped = false;
        this.cardRenderer.render(card);
      } else {
        // 回答済み → 読み取り専用の履歴ビュー
        this.cardRenderer.renderHistoryView(card);
        document.getElementById('card-area').classList.add('swipe-ready');
      }
      return;
    }

    this.cardRenderer.render(card);
  }

  // -------------------------------------------------------
  // カード回答処理（スワイプ後に呼ばれる）
  // -------------------------------------------------------
  _processAnswer(result) {
    const card = this.sessionCards[this.cardIndex];
    const word = card.word;
    card.done   = true;
    card.result = result;

    if (card.isRetry) {
      if (result !== 'wrong') {
        if (card.cardType === 'handwrite') {
          // Handwrite リトライ正解: h ブーストあり（停滞突破）
          this.engine.processResponse(word, card.cardType, result, this.state.currentTime);
        } else {
          word.stage = card.stageBeforeWrong;  // 降格キャンセル（h 更新なし）
        }
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
    this._saveState();
    this.heatmap.render();
    this.wordWave.updateWord(word.wordId);
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
    this._saveState();
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
    // Word Wave を再構築（新しい state に差し替え）
    const wwOverlay = document.getElementById('wordwave-overlay');
    wwOverlay.querySelector('#wordwave-body').innerHTML = '';
    this.wordWave = new WordWaveRenderer(wwOverlay, this.state, () => this._saveState());
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

    // 時間進行ボタンのラベルを labels.js から設定
    for (const id of ['btn-next-session', 'nw-next-session']) {
      document.getElementById(id).textContent = LABELS.session.timeForward1;
    }
    for (const id of ['btn-next-day', 'nw-next-day']) {
      document.getElementById(id).textContent = LABELS.session.timeForward2;
    }
    for (const id of ['btn-next-week', 'nw-next-week']) {
      document.getElementById(id).textContent = LABELS.session.timeForward3;
    }
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

    // 前後ボタンの活性化
    const prevBtn = document.getElementById('btn-prev-card');
    if (prevBtn) prevBtn.classList.toggle('active', this.cardIndex > 0);

    const nextBtn = document.getElementById('btn-next-card');
    if (nextBtn) {
      nextBtn.classList.toggle('active', !!this.sessionCards[this.cardIndex]);
    }
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
