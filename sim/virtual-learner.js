// sim/virtual-learner.js — 仮想学習者モデル

export class VirtualLearner {
  constructor(config = {}) {
    this.ability = config.learnerAbility ?? 1.0;   // 0.5〜1.5
    this.categoryWeakness = config.categoryWeakness ?? {};
  }

  // カードへの応答をシミュレート
  // → 'perfect' | 'near_miss' | 'phonetic' | 'correct_messy' | 'wrong'
  respond(wordState, cardType, currentTime) {
    // 残留記憶モデル:
    // 実際の半減期 = max(推定h × ability, 最小値)
    // 最小値はレビュー回数と共に成長（何度も見た単語は忘れにくい）
    const reviewFloor = Math.min(0.5, wordState.reviewCount * 0.07); // 最大0.5日
    const trueH = Math.max((wordState.h > 0 ? wordState.h * this.ability : 0.1), reviewFloor);
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
      if (r < 0.85) return 'near_miss';
      return 'phonetic';
    }
    if (cardType === 'handwrite') {
      const r = Math.random();
      if (r < 0.60) return 'perfect';
      if (r < 0.80) return 'correct_messy';
      if (r < 0.92) return 'near_miss';
      return 'wrong';
    }

    return 'perfect';
  }
}
