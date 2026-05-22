// core/srs-engine.js — コアSRSロジック

export class SRSEngine {
  constructor(config) {
    this.config = config;
  }

  // -------------------------------------------------------
  // カード応答の処理 → h, μ, σ, stage を更新
  // result: 'perfect' | 'near_miss' | 'phonetic' | 'correct_messy' | 'wrong'
  // -------------------------------------------------------
  processResponse(word, cardType, result, currentTime) {
    const isCorrect = result !== 'wrong';

    // Passive は間接観測のみ。h は更新しない。
    // ただし mastered 語の passive は維持クレジットとして lastReviewed を更新し、
    // h が伸びないまま due に居座り続ける（毎セッション再出題される）ループを防ぐ。
    if (cardType === 'passive') {
      if (word.stage === 'mastered') word.lastReviewed = currentTime;
      return;
    }

    // Intro は h₀ を設定するだけ（ステージ遷移のみ）
    if (cardType === 'intro') {
      word.h = this.config.h0;
      word.mu = Math.log(word.h);
      word.sigma = this.config.sigma0;
      word.lastReviewed = currentTime;
      word.reviewCount++;
      word.stage = 'recognition';
      return;
    }

    // h 更新
    this._updateHalfLife(word, cardType, isCorrect, result);

    // ベイズ更新
    this._bayesianUpdate(word, isCorrect, currentTime);

    // 統計更新
    word.lastReviewed = currentTime;
    word.reviewCount++;
    if (isCorrect) {
      word.correctCount++;
    } else {
      word.incorrectCount++;
    }

    // スペリングフラグ
    if (result === 'phonetic') {
      word.spellingFlag = true;
    }

    // Handwrite 介入カードは stage を変えない。フラグのみ操作して終了
    if (cardType === 'handwrite') {
      if (isCorrect) {
        word.needsHandwrite = false;
        word.stuckCount = 0;
      }
      // 不正解時: needsHandwrite はそのまま（次セッションも Handwrite で再挑戦）
      return;
    }

    // 不正解時: stuckCount をインクリメント → 閾値到達で Handwrite 介入フラグを立てる
    if (!isCorrect) {
      word.stuckCount++;
      if (word.stuckCount >= this.config.handwriteStuckThreshold) {
        word.needsHandwrite = true;
      }
    }

    // ステージ遷移
    this._evaluateStageTransition(word, isCorrect);
  }

  // -------------------------------------------------------
  // 半減期の更新
  // -------------------------------------------------------
  _updateHalfLife(word, cardType, isCorrect, result) {
    const cfg = this.config;

    if (word.h <= 0) word.h = cfg.h0;

    if (isCorrect) {
      const cardWeight = this._cardWeight(cardType, result);
      word.h = word.h * cfg.alpha * cardWeight;
    } else {
      word.h = word.h * cfg.beta;
    }

    // 範囲を保証（hMin〜hMax）
    word.h = Math.min(Math.max(word.h, this.config.hMin), this.config.hMax);
    // peakH を更新（ウェーブ解放判定に使用）
    if (word.h > word.peakH) word.peakH = word.h;
  }

  _cardWeight(cardType, result) {
    const cfg = this.config;
    if (result === 'near_miss' || result === 'phonetic') {
      return cfg.nearMissWeight;
    }
    if (result === 'correct_messy') {
      return cfg.handwriteMessyWeight;
    }
    switch (cardType) {
      case 'recognition': return cfg.recognitionWeight;
      case 'recall':      return cfg.recallWeight;
      case 'dictation':   return cfg.dictationWeight;
      case 'handwrite':   return cfg.handwriteWeight;
      default:            return 1.0;
    }
  }

  // -------------------------------------------------------
  // ベイズ更新（μ, σ）
  // -------------------------------------------------------
  _bayesianUpdate(word, isCorrect, currentTime) {
    const cfg = this.config;
    const learningRate = 0.3;

    if (isCorrect) {
      // 正解 → μ増加、σ減少
      word.mu = Math.log(Math.max(word.h, 0.01));
      word.sigma = Math.max(0.1, word.sigma * (1 - learningRate));
    } else {
      // 不正解 → μ減少、σやや減少
      word.mu = Math.log(Math.max(word.h, 0.01));
      word.sigma = Math.max(0.1, word.sigma * (1 - learningRate * 0.5));
    }
  }

  // -------------------------------------------------------
  // ステージ遷移判定
  // -------------------------------------------------------
  _evaluateStageTransition(word, isCorrect) {
    const cfg = this.config;
    const prevStage = word.stage;

    if (!isCorrect) {
      word.stage = this._demoteStage(word.stage);
    } else {
      // 正解時の昇格判定
      switch (word.stage) {
        case 'recognition':
          word.stage = 'recall';
          break;
        case 'recall':
          if (word.h >= cfg.dictationThresholdH) word.stage = 'dictation';
          break;
        case 'dictation':
          if (word.h >= cfg.masteredThresholdH) word.stage = 'mastered';
          break;
      }
    }

    // 昇格時のみ stuckCount と needsHandwrite をリセット
    // （降格は不正解そのもので起きるためリセットしない。stuckCount は昇格まで蓄積し続ける）
    if (isCorrect && word.stage !== prevStage) {
      word.stuckCount = 0;
      word.needsHandwrite = false;
    }
  }

  _demoteStage(stage) {
    // 'handwrite' は廃止済みステージ（旧セーブデータ互換性のため 'dictation' に落とす）
    if (stage === 'handwrite') return 'dictation';
    const order = ['new', 'intro', 'recognition', 'recall', 'dictation', 'mastered'];
    const idx = order.indexOf(stage);
    if (idx <= 2) return 'recognition'; // recognition 以下には降格させない
    return order[idx - 1];
  }

  // -------------------------------------------------------
  // Dictation 入力の判定
  // result: 'perfect' | 'near_miss' | 'phonetic' | 'wrong'
  // -------------------------------------------------------
  judgeDictation(input, expected) {
    const a = input.trim().toLowerCase();
    const b = expected.trim().toLowerCase();

    if (a === b) return 'perfect';

    const dist = this.levenshteinDistance(a, b);
    if (dist === 1) return 'near_miss';

    // 簡易的な発音類似判定（一般的な混同パターン）
    if (this._isPhoneticMatch(a, b)) return 'phonetic';

    return 'wrong';
  }

  _isPhoneticMatch(input, expected) {
    // よくある英語スペルミスパターン
    const patterns = [
      [/ie/, 'ei'], [/ei/, 'ie'],
      [/ph/, 'f'],  [/f/, 'ph'],
      [/ck/, 'k'],  [/k/, 'ck'],
      [/ss/, 's'],  [/s/, 'ss'],
      [/ll/, 'l'],  [/l/, 'll'],
      [/tion/, 'sion'], [/sion/, 'tion'],
    ];
    for (const [from, to] of patterns) {
      if (typeof from === 'object') {
        if (input.replace(from, to) === expected) return true;
      } else {
        if (input.replace(from, to) === expected) return true;
      }
    }
    // レーベンシュタイン距離が2以内で発音的に近い場合
    return this.levenshteinDistance(input, expected) <= 2 &&
           input.length >= 4 &&
           Math.abs(input.length - expected.length) <= 1;
  }

  // -------------------------------------------------------
  // レーベンシュタイン距離
  // -------------------------------------------------------
  levenshteinDistance(a, b) {
    const matrix = Array.from({ length: b.length + 1 }, (_, i) =>
      Array.from({ length: a.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        matrix[i][j] = b[i - 1] === a[j - 1]
          ? matrix[i - 1][j - 1]
          : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
      }
    }
    return matrix[b.length][a.length];
  }
}
