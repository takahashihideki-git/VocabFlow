// core/models.js — データモデル

export class WordState {
  constructor(wordId, word, waveNumber) {
    this.wordId = wordId;
    this.word = word;           // 単語文字列 or wordデータオブジェクト
    this.waveNumber = waveNumber;
    this.h = 0;                 // 半減期（日）。未学習時は0
    this.peakH = 0;             // これまで達成した最大 h（Word Wave ポップオーバー表示・sim/scenarios 用。core の wave 解放は供給ベースになり未使用）
    this.lastReviewed = 0;      // 最後の復習時刻（日数）
    this.stage = 'new';         // new|intro|recognition|recall|dictation|handwrite|mastered
    this.reviewCount = 0;
    this.correctCount = 0;
    this.incorrectCount = 0;
    this.stuckCount = 0;        // 現在の段階での累積不正解数。stage 変更時にリセット
    this.needsHandwrite = false; // 停滞介入モード：次回 Handwrite カードを出題する
    this.skipped = false;       // スキップされたか。次セッションで最優先再出題
    this.excluded = false;      // 学習対象から除外されているか
    this.passiveCursor = 0;     // 次に表示する Passive セクションのインデックス（ローテーション用）
  }

  pRecall(currentTime) {
    if (this.h <= 0 || this.stage === 'new') return 0;
    const deltaT = Math.max(0, currentTime - this.lastReviewed);
    return Math.pow(2, -deltaT / this.h);
  }

  // h 推定の不確実性の「幅」（提案書 §2）。状態を持たず観測から導出する。
  // - 観測が少ないほど（reviewCount 小）幅が広い
  // - 最終観測から時間が経つほど（deltaT 大）幅が広い（記憶の干渉・変化を反映）
  // 旧 σ（状態変数・不正解でも単調減少という誤った更新則）の置き換え。
  uncertaintyWidth(currentTime, config) {
    const obsFactor = config.uncertaintyBase / Math.sqrt(Math.max(1, this.reviewCount));
    const deltaT = Math.max(0, currentTime - this.lastReviewed);
    const staleFactor = config.staleGrowth * Math.log(1 + deltaT);
    // 0.9 で上限（noise = 1 ± width が負にならないよう防御。実用上 width は 1 未満）
    return Math.min(0.9, Math.max(config.uncertaintyFloor, obsFactor + staleFactor));
  }

  // due 判定用にサンプリングした実効半減期（提案書 §3.2・トンプソンサンプリング）。
  // 不確実性の幅 w の中から h_eff = h × (1 ± w 一様乱数) を引く。
  // 観測が少ない/古い語ほど due タイミングが大きく散り、位相同期が壊れる。
  effectiveH(currentTime, config) {
    if (this.h <= 0) return this.h;
    const w = this.uncertaintyWidth(currentTime, config);
    const noise = 1 + (Math.random() * 2 - 1) * w; // [1-w, 1+w] の一様乱数
    return this.h * noise;
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
    this.result = null;         // 回答結果（後で設定）
    this.userAnswer = null;     // ユーザーが選択/入力した内容（履歴ビュー復元用）
    this.shuffledChoices = null;// シャッフル済み選択肢（履歴ビューで順序を再現するために保存）
    this.bgUrl = null;          // 使用した背景画像URL（履歴ビューで再現するために保存）
    this.done = false;          // 回答済みまたはスキップ済み（戻りスワイプ時の history 判定に使用）
    this.isRetry = false;     // リトライカード（不正解後の再挿入）かどうか
    this.passiveSection = null;   // 表示する Passive セクション種別（履歴ビュー再現用）
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
    this.everClearedWaves = [];     // 過去に1度でも全mastered到達した wave 番号（重複overlay抑制用）
    this.handwriteCountThisSession = 0;
    this.handwriteModeEnabled = true; // ユーザーが手書き可能かどうか（app層から設定）
  }

  get masteredCount() {
    // stage === 'mastered' を唯一の定着定義とする。
    // h ベース（h>=masteredThresholdH）だと、降格して stage=dictation だが h が高いまま
    // 居座る語（opportunity 事件）がヘッダ統計では「定着」に数えられるのに Wave クリア判定
    // （stage 基準）ではブロックされる二重評価ズレが起きる。Wave クリア・Word Wave 金色ドット
    // と同じ stage 基準に統一する。
    return this.words.filter(w => w.stage === 'mastered').length;
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
      everClearedWaves: this.everClearedWaves ?? [],
      savedAt: this.savedAt ?? Date.now(),
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
    state.everClearedWaves = data.everClearedWaves ?? [];
    state.savedAt = data.savedAt ?? null;
    return state;
  }
}
