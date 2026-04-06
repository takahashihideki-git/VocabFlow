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

    // トースト状態
    this._toastQueue   = [];
    this._toastShowing = false;
    this._toastTimer   = null;

    // スワイプ状態
    this._transitioning = false;  // アニメーション中は二重遷移を防ぐ
    this._touchStartY   = 0;

    // Renderers
    this.heatmap      = null;
    this.cardRenderer = null;
    this.wordWave     = null;

    this._bindStartScreen();
    this._updateStartGreeting();
  }

  // -------------------------------------------------------
  // スタート画面グリーティング
  // -------------------------------------------------------
  _updateStartGreeting() {
    const el = document.getElementById('tagline');
    if (!el) return;
    el.innerHTML = this._buildStartGreeting();
    el.classList.remove('loading');
  }

  _buildStartGreeting() {
    const hour = new Date().getHours();
    let timeGreet;
    if      (hour >= 4  && hour < 7)  timeGreet = '早起きですね。';
    else if (hour >= 7  && hour < 11) timeGreet = 'おはようございます。';
    else if (hour >= 11 && hour < 14) timeGreet = 'お昼の学習ですね。';
    else if (hour >= 14 && hour < 18) timeGreet = 'お疲れ様です。';
    else if (hour >= 18 && hour < 23) timeGreet = '今日も来ましたね。';
    else                              timeGreet = '夜遅くまでお疲れ様です。';

    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return `${timeGreet}<br>1900語の旅を、今日から始めましょう。`;
    }

    let state;
    try {
      state = LearnerState.fromJSON(JSON.parse(saved));
    } catch {
      return `${timeGreet}<br>TikTok式スワイプで語彙を定着させよう。`;
    }

    const { currentTime, activeWaves, config } = state;
    const dayN = Math.floor(currentTime);
    const lines = [timeGreet];

    // 前回セッション（≈ 2セッション分の幅）で mastered になった単語
    const sessionDur = 1 / (config.sessionsPerDay ?? 3);
    const recentMastered = state.words.filter(w =>
      w.stage === 'mastered' && w.lastReviewed >= currentTime - sessionDur * 2
    );

    // handwrite 落ちリスク語（stuckCount が閾値まであと1回）
    const threshold = config.handwriteStuckThreshold ?? 3;
    const atRisk = state.words.filter(w =>
      !w.excluded && w.stage !== 'new' && w.stage !== 'mastered' &&
      w.stuckCount >= threshold - 1 && !w.needsHandwrite
    );

    // 優先1: リスク語
    if (atRisk.length > 0) {
      const names = atRisk.slice(0, 2).map(w => w.wordString).join('・');
      lines.push(`${names} はもう一度間違えると手書き練習になります。`);
    }

    // 優先2: 直近定着語
    if (recentMastered.length > 0 && lines.length < 3) {
      const names = recentMastered.slice(0, 2).map(w => w.wordString).join('・');
      const extra = recentMastered.length > 2 ? ` など${recentMastered.length}語` : '';
      lines.push(`前回、${names}${extra} が定着しました。`);
    }

    // 優先3: 経過日数・Wave・定着語数
    if (lines.length < 3) {
      const maxWave  = activeWaves.length > 0 ? Math.max(...activeWaves) : 1;
      const mastered = state.masteredCount;
      if (dayN >= 1 && mastered > 0) {
        lines.push(`Day ${dayN} — ${mastered}語定着・第${maxWave}波到達中。`);
      } else if (dayN >= 1) {
        lines.push(`Day ${dayN} 継続中。第${maxWave}波まで届いています。`);
      } else {
        lines.push('1900語の旅が始まりました。');
      }
    }

    return lines.join('<br>');
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
    // 現実の経過時間を currentTime に反映（前回保存時刻との差分）
    if (this.state.savedAt) {
      const elapsedDays = (Date.now() - this.state.savedAt) / 86400000;
      this.state.currentTime += elapsedDays;
    }

    // wave 全mastered 通知済みセット（起動時に既完了 wave を登録して重複防止）
    this._notifiedWaveComplete = new Set();
    const waveNumbers = [...new Set(this.state.words.map(w => w.waveNumber))];
    for (const wn of waveNumbers) {
      const waveWords = this.state.words.filter(w => w.waveNumber === wn && !w.excluded);
      if (waveWords.length > 0 && waveWords.every(w => w.stage === 'mastered')) {
        this._notifiedWaveComplete.add(wn);
      }
    }

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

    // CardRenderer: onReady はスワイプ可能化。選択系カードは回答直後に SRS 処理も実行
    const wrapper = document.getElementById('card-wrapper');
    this.bgManager = new BackgroundManager();
    this.cardRenderer = new CardRenderer(
      wrapper,
      this.engine,
      (result) => {
        document.getElementById('card-area').classList.add('swipe-ready');
        if (!isTouch) document.getElementById('btn-next-card').classList.add('ready');
        const card = this.sessionCards[this.cardIndex];
        const answerTypes = ['recognition', 'recall', 'dictation', 'handwrite'];
        if (card && answerTypes.includes(card.cardType)) {
          this._onCardAnswered(result);
          card._srsProcessed = true;
        }
      },
      this.bgManager
    );

    this._setupSwipeGestures();
    this._bindOverlayButtons();
    this._saveState(); // savedAt を現在時刻で更新（再起動時の二重カウント防止）
    this._startSession();
  }

  // -------------------------------------------------------
  // スワイプ/ホイールジェスチャーのセットアップ
  // -------------------------------------------------------
  _setupSwipeGestures() {
    const area = document.getElementById('card-area');

    // ----- タッチ -----
    area.addEventListener('touchstart', (e) => {
      this._touchStartY      = e.touches[0].clientY;
      this._scrollElAtTouch  = e.target.closest('.passive-scroll') || null;
      this._scrollTopAtTouch = this._scrollElAtTouch?.scrollTop ?? 0;
    }, { passive: true });

    area.addEventListener('touchend', (e) => {
      const dy = this._touchStartY - e.changedTouches[0].clientY;
      const el = this._scrollElAtTouch;
      this._scrollElAtTouch = null;

      if (el) {
        const scrolled = el.scrollTop !== this._scrollTopAtTouch;
        const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
        const atTop    = el.scrollTop <= 2;
        const now      = Date.now();
        const COOLDOWN = 500; // ms

        if (scrolled) {
          // タッチ中にスクロールが発生: 境界到達なら時刻・方向を記録してブロック
          if (dy > 40  && atBottom) { this._scrollBoundaryTime = now; this._scrollBoundaryDir = 'up'; }
          if (dy < -40 && atTop)    { this._scrollBoundaryTime = now; this._scrollBoundaryDir = 'down'; }
          return;
        }

        // スクロールなし: クールダウン中は同方向スワイプをブロック
        const elapsed = now - (this._scrollBoundaryTime ?? 0);
        const sameDir = (dy > 40  && this._scrollBoundaryDir === 'up') ||
                        (dy < -40 && this._scrollBoundaryDir === 'down');
        if (sameDir && elapsed < COOLDOWN) return;

        // 通常の境界チェック（余地がある方向はネイティブスクロールに委ねる）
        if (dy > 40  && !atBottom) return;
        if (dy < -40 && !atTop)   return;
      }

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
    const unlocksBefore = this.state.waveUnlockEvents.length;
    const cards = this.feedGen.generateSession(this.state, this.state.currentTime);

    // 新しいwave解放を通知
    if (this.state.sessionsCompleted === 0) {
      // 初回セッション: wave 1 は waveUnlockEvents に記録されないため個別通知
      this.state.activeWaves.forEach(wn => {
        this.showToast(`🌊 第${wn}波の単語が届きました`);
      });
    } else {
      this.state.waveUnlockEvents.slice(unlocksBefore).forEach(ev => {
        this.showToast(`🌊 第${ev.waveNumber}波の単語が届きました`);
      });
    }

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
    window.speechSynthesis?.cancel();

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
    // 選択・入力系カードは onReady 時点で処理済み。Intro/Passive のみここで処理
    if (!card._srsProcessed) {
      this._onCardAnswered(result);
    }
    this.cardIndex++;
    this._showCard();
  }

  // -------------------------------------------------------
  // SRS 処理・トースト・ヒートマップ更新（回答確定時に呼ばれる）
  // -------------------------------------------------------
  _onCardAnswered(result) {
    const card = this.sessionCards[this.cardIndex];
    const word = card.word;
    card.done   = true;
    card.result = result;

    const stageBefore = word.stage;
    const countable = card.cardType !== 'intro' && card.cardType !== 'passive';

    if (card.isRetry) {
      if (result !== 'wrong') {
        if (card.cardType === 'handwrite') {
          // Handwrite リトライ正解: h ブーストあり（停滞突破）
          this.engine.processResponse(word, card.cardType, result, this.state.currentTime);
        } else {
          word.stage = card.stageBeforeWrong;  // 降格キャンセル（h 更新なし）
        }
        if (countable) this.sessionCorrect++;
      } else {
        this.engine.processResponse(word, card.cardType, result, this.state.currentTime);
        if (countable) this.sessionWrong++;
        const count = (this.retryCount.get(word.wordId) || 0) + 1;
        this.retryCount.set(word.wordId, count);
        if (count < this.config.maxRetryPerCard) {
          this._insertRetry(card, word.stage);
        }
      }
    } else {
      if (result !== 'wrong') {
        this.engine.processResponse(word, card.cardType, result, this.state.currentTime);
        if (countable) this.sessionCorrect++;
      } else {
        this.engine.processResponse(word, card.cardType, result, this.state.currentTime);
        if (countable) this.sessionWrong++;
        const count = this.retryCount.get(word.wordId) || 0;
        if (count < this.config.maxRetryPerCard) {
          this._insertRetry(card, stageBefore);
          this.retryCount.set(word.wordId, count + 1);
        }
      }
    }

    // mastered 到達を通知（dictation/handwrite → mastered 遷移時のみ発火）
    if (stageBefore !== 'mastered' && word.stage === 'mastered') {
      const rawWord = typeof word.word === 'object' ? word.word : {};
      const wordStr = rawWord.word || `word_${word.wordId}`;
      this.showToast(`⭐ ${wordStr} がマスターされました`);
      this._checkWaveComplete(word.waveNumber);
    }

    this.state.totalCardsConsumed++;
    this._saveState();
    this.heatmap.render();
    this.wordWave.updateWord(word.wordId);
    this._updateStats();
    this._updateProgress();
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
    document.getElementById('btn-wavecomplete-close').addEventListener('click', () => this._hideOverlays());

    // 時間進行ボタンのラベルを labels.js から設定
    document.getElementById('btn-next-session').textContent = LABELS.session.timeForward1;
    document.getElementById('btn-next-day').textContent     = LABELS.session.timeForward2;
    document.getElementById('btn-next-week').textContent    = LABELS.session.timeForward3;
  }

  // -------------------------------------------------------
  // Overlay 表示
  // -------------------------------------------------------
  _showComplete() {
    const done     = this.sessionCards.filter(c => c.result !== null).length;
    const total    = this.sessionCards.length;
    const answered = this.sessionCorrect + this.sessionWrong;
    const acc      = answered > 0 ? Math.round((this.sessionCorrect / answered) * 100) + '%' : '–';

    document.getElementById('oc-done').textContent  = done;
    document.getElementById('oc-total').textContent = total;
    document.getElementById('oc-acc').textContent   = acc;
    document.getElementById('oc-learned').textContent  = this.state.learnedCount;
    document.getElementById('oc-mastered').textContent = this.state.masteredCount;
    document.getElementById('overlay-complete').style.display = 'flex';
  }

  _checkWaveComplete(waveNumber) {
    if (this._notifiedWaveComplete.has(waveNumber)) return;
    const waveWords = this.state.words.filter(w => w.waveNumber === waveNumber && !w.excluded);
    if (waveWords.length === 0) return;
    if (!waveWords.every(w => w.stage === 'mastered')) return;
    this._notifiedWaveComplete.add(waveNumber);
    this._showWaveComplete(waveNumber, waveWords.length);
  }

  _showWaveComplete(waveNumber, wordCount) {
    const maxWave = Math.max(...this.state.words.map(w => w.waveNumber));
    let title, message;

    if (waveNumber === 1) {
      title   = `Wave 1 達成`;
      message = `Wave 1 の${wordCount}語が定着しました。でもこれは「覚えた」ではありません。記憶強度が十分に伸びた状態です。時間が経てば少しずつ薄れていきます。そのとき Word Wave がもう一度あなたに届けます。`;
    } else if (waveNumber === maxWave) {
      title   = `全波 制覇`;
      message = `1900語すべてが定着しました。長い波の旅でした。でも記憶は生き物です。使い続ければ強くなり、離れれば薄れます。Word Wave はこれからも静かに見守り続けます。`;
    } else {
      title   = `Wave ${waveNumber} クリア！`;
      message = `累計 ${this.state.masteredCount} 語が定着。次の波が来ます。`;
    }

    document.getElementById('wc-title').textContent   = title;
    document.getElementById('wc-message').textContent = message;
    document.getElementById('overlay-wavecomplete').style.display = 'flex';
  }

  _calcWaitDisplay() {
    const retentionFactor = Math.log2(1 / this.config.targetRetention);
    let nextDueTime = Infinity;
    for (const w of this.state.words) {
      if (w.stage === 'new' || w.excluded || w.h <= 0) continue;
      const t = w.lastReviewed + w.h * retentionFactor;
      if (t < nextDueTime) nextDueTime = t;
    }
    if (!isFinite(nextDueTime)) return null;
    const waitMins = Math.max(1, Math.round(Math.max(0, nextDueTime - this.state.currentTime) * 24 * 60));
    if (waitMins < 60) return `約<strong>${waitMins}</strong>分後`;
    return `約<strong>${Math.round(waitMins / 60)}</strong>時間後`;
  }

  _showNoWork() {
    const waitDisplay = this._calcWaitDisplay();
    const sess = 1 / this.config.sessionsPerDay;
    const wrapper = document.getElementById('card-wrapper');

    wrapper.innerHTML = `
      <div class="card nowork-card">
        <div class="nowork-title">今はなにもしなくて大丈夫。</div>
        <ul class="nowork-bullets">
          ${waitDisplay !== null ? `<li>少し忘れかけてから復習するのが最も効果的です。${waitDisplay}がそのタイミングです。</li>` : ''}
          <li>すでに覚えかけの単語がたくさんあります。新しい単語に取り組むのはもうすこしあとで。</li>
        </ul>
        <button class="btn-secondary" id="nw-refresh" style="width:100%;margin-bottom:8px">更新</button>
        <div class="time-controls">
          <label>時間を進める（動作確認用）</label>
          <div class="time-btn-row">
            <button class="time-btn" id="nw-next-session">${LABELS.session.timeForward1}</button>
            <button class="time-btn" id="nw-next-day">${LABELS.session.timeForward2}</button>
            <button class="time-btn" id="nw-next-week">${LABELS.session.timeForward3}</button>
          </div>
        </div>
        <button class="btn-danger" id="btn-reset-from-nowork">リセット</button>
      </div>
    `;

    document.getElementById('nw-next-session').addEventListener('click', () => this._advanceTime(sess));
    document.getElementById('nw-next-day').addEventListener('click',     () => this._advanceTime(1));
    document.getElementById('nw-next-week').addEventListener('click',    () => this._advanceTime(7));
    document.getElementById('btn-reset-from-nowork').addEventListener('click', () => this._reset());
    document.getElementById('nw-refresh').addEventListener('click', () => {
      const elapsed = this.state.savedAt ? (Date.now() - this.state.savedAt) / 86400000 : 0;
      this.state.currentTime += elapsed;
      this.state.savedAt = Date.now();
      this._startSession();
    });

    this._updateProgress();
    this._updateStats();
  }

  _hideOverlays() {
    document.getElementById('overlay-complete').style.display    = 'none';
    document.getElementById('overlay-wavecomplete').style.display = 'none';
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
    const maxStudiedWave = this.state.words.reduce(
      (max, w) => w.stage !== 'new' ? Math.max(max, w.waveNumber) : max, 1
    );
    document.getElementById('stat-waves').textContent    = maxStudiedWave;
    document.getElementById('stat-day').textContent      = this.state.currentTime.toFixed(1);
    this.heatmap.render();
  }

  // -------------------------------------------------------
  // トースト通知
  // -------------------------------------------------------
  showToast(message) {
    this._toastQueue.push(message);
    if (!this._toastShowing) this._dequeueToast();
  }

  _dequeueToast() {
    if (this._toastQueue.length === 0) { this._toastShowing = false; return; }
    this._toastShowing = true;
    const el = document.getElementById('toast');
    el.classList.remove('visible');
    el.textContent = this._toastQueue.shift();
    void el.offsetWidth; // 強制リフローで初期状態を確定させてからトランジション開始
    el.classList.add('visible');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      el.classList.remove('visible');
      setTimeout(() => this._dequeueToast(), 420);
    }, 2800);
  }
}

// -------------------------------------------------------
// 起動
// -------------------------------------------------------
new VocabFlowApp();
