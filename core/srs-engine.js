// core/srs-engine.js — コアSRSロジック

export class SRSEngine {
  constructor(config) {
    this.config = config;
  }

  // -------------------------------------------------------
  // カード応答の処理 → h, stage を更新
  // result: 'perfect' | 'near_miss' | 'phonetic' | 'correct_messy' | 'wrong'
  // -------------------------------------------------------
  processResponse(word, cardType, result, currentTime) {
    // near_miss / phonetic（綴りが惜しいが不正確）は不正解として扱う。
    // ここがポリシーの唯一の源で、sim（生の result を渡す）と
    // app（UI 層で 'wrong' に翻訳済み）が同じ h 減衰・降格経路を通る。
    const isCorrect = result !== 'wrong' && result !== 'near_miss' && result !== 'phonetic';

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
      word.lastReviewed = currentTime;
      word.reviewCount++;
      word.stage = 'recognition';
      // 播種ノイズ: 導入時（rc=1）の一撃でコホートの h0 を分岐させ位相同期を散らす
      this._applySeedNoise(word);
      return;
    }

    // h 更新（currentTime は deltaT 連動ゲインの計算に使う。
    //          word.lastReviewed はこの後で更新するので、ここでは前回復習時刻のまま）
    this._updateHalfLife(word, cardType, isCorrect, result, currentTime);

    // 統計更新
    word.lastReviewed = currentTime;
    word.reviewCount++;
    if (isCorrect) {
      word.correctCount++;
    } else {
      word.incorrectCount++;
    }

    // Handwrite 介入カードは stage を変えない。フラグのみ操作して終了
    if (cardType === 'handwrite') {
      if (isCorrect) {
        word.needsHandwrite = false;
        word.stuckCount = 0;
        this._applySeedNoise(word);
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

    // ステージ遷移（クリーンな h で閾値判定 → その後に播種ノイズを乗せる。
    // 検証と同じ順序＝昇格判定は素の h で行い、ノイズは次回以降のスケジュールに効かせる）
    this._evaluateStageTransition(word, isCorrect);

    // 播種ノイズ: 正解時の h を信頼度連動で分散（昇格判定の後に適用）
    if (isCorrect) this._applySeedNoise(word);
  }

  // -------------------------------------------------------
  // 播種ノイズ（seed noise・seed-noise-findings.md）
  // 正解時の h に信頼度連動ノイズ w = base/rc^exp を乗せ、同日導入コホートの h を恒久的に
  // 分岐させて位相同期を散らす。急勾配（exp=2.5）で rc=1（導入時）の一撃に播種が集中し
  // rc≥2 で実質ゼロ＝「導入時の一回播種」（複利蓄積しない・成熟語の h を汚さない）。
  // h はスケジュールを回す seed なので、この分散は推定の破壊ではない（outcome 検証済み:
  // 過負荷学習者で genuine に定着 +約5%・余裕学習者は無害）。rc は更新後 reviewCount。
  // -------------------------------------------------------
  _applySeedNoise(word) {
    const cfg = this.config;
    if (!cfg.seedNoise || word.h <= 0) return;
    const width = cfg.seedNoiseBase / Math.pow(word.reviewCount, cfg.seedNoiseExp);
    word.h *= 1 + (Math.random() * 2 - 1) * width;
    word.h = Math.min(Math.max(word.h, cfg.hMin), cfg.hMax);
  }

  // -------------------------------------------------------
  // 半減期の更新
  //
  // deltaTGain（review #1）有効時は、正解時のゲインを「前回復習からの経過時間 deltaT」で
  // 減衰させる。素の `min(1, deltaT/h)` は target-retention スケジューリングと噛み合わない
  // （予定どおり復習すると deltaT ≈ h × retentionFactor ≈ h × 0.234 のため ratio が常に
  //  ~0.234 で頭打ち → gain ~1.2 止まりで定着が ~20倍遅延）。そこで ratio を「予定復習間隔
  // （h × retentionFactor）」で正規化する:
  //   ratio = min(1, deltaT / (h × retentionFactor))
  //   gain  = 1 + (alpha − 1) × cardWeight × ratio
  // - 予定どおりの復習（deltaT ≈ h × retentionFactor）→ ratio≈1 → full gain（旧 alpha 挙動を回復）
  // - クラミング/リトライ/filler（予定より早い・deltaT ≪ 予定間隔）→ ratio<1 → 減衰
  //   （短間隔の正解は h をほぼ伸ばさない＝間隔反復の本質）
  // - 予定より遅い復習 → ratio は 1 で頭打ち（暴走防止）
  // cardWeight は alpha の全体倍率ではなくボーナス項に掛ける（正解で h が縮まない不変条件を保つ）。
  // 旧挙動（h × alpha × cardWeight・deltaT 無視）は deltaTGain=false で再現可能。
  // -------------------------------------------------------
  _updateHalfLife(word, cardType, isCorrect, result, currentTime) {
    const cfg = this.config;

    if (word.h <= 0) word.h = cfg.h0;

    if (isCorrect) {
      const cardWeight = this._cardWeight(cardType, result);
      if (cfg.deltaTGain) {
        const deltaT = Math.max(0, currentTime - word.lastReviewed);
        // 予定復習間隔（h × retentionFactor）で正規化。予定どおり＝ratio 1＝full gain。
        const retentionFactor = Math.log2(1 / cfg.targetRetention);
        const schedule = word.h * retentionFactor;
        const ratio = schedule > 0 ? Math.min(1, deltaT / schedule) : 1;
        const gain = 1 + (cfg.alpha - 1) * cardWeight * ratio;
        word.h = word.h * gain;
      } else {
        word.h = word.h * cfg.alpha * cardWeight;
      }
    } else {
      word.h = word.h * cfg.beta;
    }

    // 範囲を保証（hMin〜hMax）
    word.h = Math.min(Math.max(word.h, this.config.hMin), this.config.hMax);
    // peakH を更新（Word Wave ポップオーバー表示・sim/scenarios 用。core の wave 解放は供給ベースで未使用）
    if (word.h > word.peakH) word.peakH = word.h;
  }

  _cardWeight(cardType, result) {
    const cfg = this.config;
    // near_miss / phonetic は isCorrect=false で beta 減衰に回るため、
    // ここ（正解時の重み）には到達しない。
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
    // 発音由来でよく起きるスペル混同パターン（全置換で全出現箇所を変換）。
    // 名前どおり「音は近いがスペルが違う」ケースだけを phonetic と判定する。
    // 旧実装は ① regex を replace(/ie/) で渡し最初の1箇所しか置換せず、
    // ② 「編集距離≤2 かつ 長さ≥4」の広いフォールバックで大半の2文字タイポを
    // phonetic に巻き込んでいた（判定名と実態の乖離）。両方を解消。
    const patterns = [
      [/ie/g, 'ei'], [/ei/g, 'ie'],
      [/ph/g, 'f'],  [/f/g, 'ph'],
      [/ck/g, 'k'],  [/k/g, 'ck'],
      [/ss/g, 's'],  [/s/g, 'ss'],
      [/ll/g, 'l'],  [/l/g, 'll'],
      [/tion/g, 'sion'], [/sion/g, 'tion'],
    ];
    for (const [from, to] of patterns) {
      if (input.replace(from, to) === expected) return true;
    }
    return false;
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
