// core/models.js — データモデル

export class WordState {
  constructor(wordId, word, waveNumber) {
    this.wordId = wordId;
    this.word = word;           // 単語文字列 or wordデータオブジェクト
    this.waveNumber = waveNumber;
    this.h = 0;                 // 半減期（日）。未学習時は0
    this.peakH = 0;             // これまで達成した最大 h（ウェーブ解放判定に使用）
    this.mu = 0;                // log(h)の推定値
    this.sigma = 1.0;           // 不確実性
    this.lastReviewed = 0;      // 最後の復習時刻（日数）
    this.stage = 'new';         // new|intro|recognition|recall|dictation|handwrite|mastered
    this.reviewCount = 0;
    this.correctCount = 0;
    this.incorrectCount = 0;
    this.spellingFlag = false;  // 発音は合っているがスペルが怪しい
    this.stuckCount = 0;        // 現在の段階での累積不正解数。stage 変更時にリセット
    this.needsHandwrite = false; // 停滞介入モード：次回 Handwrite カードを出題する
    this.skipped = false;       // スキップされたか。次セッションで最優先再出題
    this.excluded = false;      // 学習対象から除外されているか
  }

  pRecall(currentTime) {
    if (this.h <= 0 || this.stage === 'new') return 0;
    const deltaT = Math.max(0, currentTime - this.lastReviewed);
    return Math.pow(2, -deltaT / this.h);
  }

  currentSigma(currentTime, sigmaDecay) {
    const deltaT = Math.max(0, currentTime - this.lastReviewed);
    return this.sigma + sigmaDecay * deltaT;
  }

  get wordString() {
    if (typeof this.word === 'string') return this.word;
    return this.word?.word ?? `word_${this.wordId}`;
  }
}

export class Card {
  constructor(wordState, cardType) {
    this.word = wordState;    // WordState 参照
    this.cardType = cardType; // 'intro'|'recognition'|'recall'|'dictation'|'handwrite'|'passive'
    this.result = null;       // 回答結果（後で設定）
    this.done = false;        // 回答済みまたはスキップ済み（戻りスワイプ時の history 判定に使用）
    this.isRetry = false;     // リトライカード（不正解後の再挿入）かどうか
    this.stageBeforeWrong = null; // 不正解直前の stage（リトライ正解時に復元する）
  }
}

export class Session {
  constructor(cards, sessionTime) {
    this.cards = cards;           // Card[]
    this.sessionTime = sessionTime; // セッション開始時刻（日数）
    this.currentIndex = 0;
  }

  get currentCard() {
    return this.cards[this.currentIndex] ?? null;
  }

  get isComplete() {
    return this.currentIndex >= this.cards.length;
  }

  advance() {
    this.currentIndex++;
  }
}

export class LearnerState {
  constructor(words, config) {
    this.words = words;             // WordState[]
    this.config = config;
    this.currentTime = 0;           // シミュレーション上の現在時刻（日数）
    this.totalCardsConsumed = 0;
    this.sessionsCompleted = 0;
    this.waveUnlockEvents = [];     // [{waveNumber, day}]
    this.activeWaves = [1];         // 現在アクティブなウェーブ番号リスト
    this.handwriteCountThisSession = 0;
    this.handwriteModeEnabled = true; // ユーザーが手書き可能かどうか（app層から設定）
  }

  get masteredCount() {
    return this.words.filter(w => w.h >= this.config.masteredThresholdH).length;
  }

  get learnedCount() {
    return this.words.filter(w => w.stage !== 'new').length;
  }

  toJSON() {
    return {
      words: this.words,
      config: this.config,
      currentTime: this.currentTime,
      totalCardsConsumed: this.totalCardsConsumed,
      sessionsCompleted: this.sessionsCompleted,
      waveUnlockEvents: this.waveUnlockEvents,
      activeWaves: this.activeWaves,
    };
  }

  static fromJSON(data) {
    const state = new LearnerState([], data.config);
    state.words = data.words.map(w => {
      const ws = new WordState(w.wordId, w.word, w.waveNumber);
      Object.assign(ws, w);
      return ws;
    });
    state.currentTime = data.currentTime;
    state.totalCardsConsumed = data.totalCardsConsumed;
    state.sessionsCompleted = data.sessionsCompleted;
    state.waveUnlockEvents = data.waveUnlockEvents;
    state.activeWaves = data.activeWaves;
    return state;
  }
}
