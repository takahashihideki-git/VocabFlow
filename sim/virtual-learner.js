// sim/virtual-learner.js — 仮想学習者モデル

export class VirtualLearner {
  constructor(config = {}) {
    this.ability = config.learnerAbility ?? 1.0;   // 0.5〜1.5
    this.categoryWeakness = config.categoryWeakness ?? {};
    // near_miss/phonetic はアプリでは「即 wrong 登録 → その場で再入力 →
    // 直せば perfect に巻き戻し / ギブアップで wrong 確定」という回復可能イベント。
    // sim ではこの再入力を fix 確率で終端化する。
    // near_miss は1文字違い（知っている語の打ち間違い）→高確率で修正、
    // phonetic は発音由来の混同→修正しにくい。
    this.nearMissFixRate = config.nearMissFixRate ?? 0.85;
    this.phoneticFixRate = config.phoneticFixRate ?? 0.6;

    // 語ごとの「真の忘れにくさ」個体差。システムの推定 h（全語一律 alpha で成長）と
    // 学習者の真の h の間にずれを持たせる。これがないと推定誤差ゼロになり、
    // トンプソンサンプリングや deltaT 連動 h 更新の真価（推定誤りの発見・訂正）を
    // sim で測定できない（提案書 §8 / review #1 の検証注意点）。
    // wordId から決定的に [1-hVariation, 1+hVariation] の係数を導出（再現性のため）。
    this.hVariation = config.hVariation ?? 0.3;
    this._hFactorCache = new Map();
  }

  // wordId に紐づく安定した真 h 係数（[1-hVariation, 1+hVariation] の決定的擬似乱数）
  _hFactor(wordId) {
    let f = this._hFactorCache.get(wordId);
    if (f === undefined) {
      // sin ハッシュ → [0,1) の決定的擬似乱数（Math.random を使わず再現性を確保）
      const x = Math.sin(wordId * 127.1 + 311.7) * 43758.5453;
      const u = x - Math.floor(x);
      f = 1 + (u * 2 - 1) * this.hVariation;
      this._hFactorCache.set(wordId, f);
    }
    return f;
  }

  // カードへの応答をシミュレート（終端結果のみ返す）
  // → 'perfect' | 'correct_messy' | 'wrong'
  //   ※ near_miss/phonetic は _resolveSpelling で perfect/wrong に終端化される
  respond(wordState, cardType, currentTime) {
    // 残留記憶モデル:
    // 実際の半減期 = max(推定h × ability × 語ごとの個体差, 最小値)
    // 最小値はレビュー回数と共に成長（何度も見た単語は忘れにくい）
    const reviewFloor = Math.min(0.5, wordState.reviewCount * 0.07); // 最大0.5日
    const trueFactor = this.ability * this._hFactor(wordState.wordId);
    const trueH = Math.max((wordState.h > 0 ? wordState.h * trueFactor : 0.1), reviewFloor);
    const deltaT = Math.max(0, currentTime - wordState.lastReviewed);
    const trueP = Math.pow(2, -deltaT / trueH);

    const difficultyMod = {
      intro:        1.5,   // Intro は基本的に正解（提示のみ）
      recognition:  1.2,
      recall:       1.0,
      dictation:    0.8,
      handwrite:    0.75,
      passive:      1.5,
    };

    const adjustedP = Math.min(1.0, trueP * (difficultyMod[cardType] ?? 1.0));
    const isCorrect = Math.random() < adjustedP;

    if (!isCorrect) return 'wrong';

    if (cardType === 'dictation') {
      const r = Math.random();
      if (r < 0.70) return 'perfect';
      const kind = r < 0.85 ? 'near_miss' : 'phonetic';
      return this._resolveSpelling(kind);
    }
    if (cardType === 'handwrite') {
      const r = Math.random();
      if (r < 0.60) return 'perfect';
      if (r < 0.80) return 'correct_messy';
      if (r < 0.92) return this._resolveSpelling('near_miss');
      return 'wrong';
    }

    return 'perfect';
  }

  // near_miss/phonetic（綴りが惜しい中間判定）を、アプリの再入力モデルに沿って
  // 終端結果（'perfect' = 修正成功 / 'wrong' = ギブアップ）へ解決する。
  // エンジンには終端結果のみ渡るため、sim と app が同じ h 更新経路を通る。
  _resolveSpelling(kind) {
    const fixRate = kind === 'near_miss' ? this.nearMissFixRate : this.phoneticFixRate;
    return Math.random() < fixRate ? 'perfect' : 'wrong';
  }
}
