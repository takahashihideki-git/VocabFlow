// sim/virtual-learner.js — 仮想学習者モデル
//
// 真の記憶モデル（2026-06-11 改訂・review #1 検証のため間隔効果を導入）:
// 旧モデルは trueH = システムの h × 個体差 で、システムの h をそのまま真の記憶とみなしていた。
// この設計だと「massed（クラミング）で h は伸びたが実際には定着していない」状況を表現できず、
// deltaT 連動 h ゲイン（#1）が本来補正する誤差（間隔・タイミング起因）を sim で測れなかった。
//
// 新モデルは「システムの h とは独立した真の半減期 trueH」を語ごとに保持し、間隔効果に従って
// 成長させる:
//   成功時: trueH × (1 + (alpha−1) × cardWeight × spacing)
//           spacing = min(1, (1 − R) / (1 − targetRetention))   ← 想起難度ベース（正規化）
//           - massed（R≈1・直前に見た）  → spacing≈0 → trueH ほぼ伸びない（クラミングは durable に効かない）
//           - 最適復習（R≈targetRetention）→ spacing≈1 → full gain（×2 相当・現実的スループット）
//           - overdue（R 低）             → spacing は 1 で頭打ち
//   不正解: trueH × beta
//   個体差: 語ごとに hFactor（±hVariation）を成長率へ掛け、システムが観測できない残差を作る。
//
// システム側の h（wordState.h）はこの真の記憶を観測できず、deltaTGain ON なら deltaT 正規化
// ゲインで、OFF なら素の alpha 倍率で h を推定する。ON の方が真の記憶をよく追える（#1 の価値）。

import { DEFAULT_CONFIG } from '../core/config.js';
import { defaultModel as ebisuDefault, predictRecall as ebisuPredict,
         updateRecall as ebisuUpdate, modelToHalflife as ebisuHalflife } from '../core/ebisu.js';

export class VirtualLearner {
  constructor(config = {}) {
    this.ability = config.learnerAbility ?? 1.0;   // 0.5〜1.5
    this.categoryWeakness = config.categoryWeakness ?? {};
    // near_miss/phonetic はアプリでは「即 wrong 登録 → その場で再入力 →
    // 直せば perfect に巻き戻し / ギブアップで wrong 確定」という回復可能イベント。
    // sim ではこの再入力を fix 確率で終端化する。
    this.nearMissFixRate = config.nearMissFixRate ?? 0.85;
    this.phoneticFixRate = config.phoneticFixRate ?? 0.6;

    // 観測ノイズ（既定 0＝既存挙動ゼロ変更）。真の記憶は本物の retrieval で更新し、
    // システムが「見る」結果だけをノイズで汚す＝Ebisu の確信度頑健性が効く局面を作る。
    //   slipRate : 本当は思い出せた（真の記憶あり）のに観測が 'wrong'（打ち間違い・気の散り）
    //   guessRate: 本当は思い出せない（真の記憶なし）のに観測が 'perfect'（まぐれ当たり）
    this.slipRate = config.slipRate ?? 0;
    this.guessRate = config.guessRate ?? 0;

    // 語ごとの「真の忘れにくさ」個体差。真の記憶の成長率に掛け、システムが観測できない
    // 推定誤差を生む。これがないとトンプソンサンプリング（提案 Phase 1）や deltaT 連動 h
    // 更新（#1）の真価＝「推定誤りの発見・訂正」を sim で測定できない。
    this.hVariation = config.hVariation ?? 0.3;

    // 真の記憶を成長させる際に参照する SRS パラメータ（alpha/beta/h0/hMin/hMax/targetRetention・
    // cardWeight 群）。sim-runner からは現行 cfg を渡す。
    this.srs = config.srsConfig ?? DEFAULT_CONFIG;

    // 真実モデルの選択。記憶コア比較（HLR vs Ebisu）を公平にするための中立性レバー。
    // 'alpha'（既定・既存）: trueH × (1+(α−1)·weight·spacing) の指数忘却。HLR の成長則と同族＝
    //   HLR の校正検証には適切だが、別の更新則（Ebisu）の優劣を測るには HLR 有利に交絡する。
    // 'dsr'（中立・FSRS 風）: べき則忘却 + 安定度飽和つき間隔カーネル。HLR の指数でも Ebisu の
    //   GB1 でもない第三の真実なので、どちらの更新則にも home advantage を与えない。
    // 'ebisu'（Ebisu のホームグラウンド）: 真の記憶が Ebisu の生成過程（Beta 分布した保持率の
    //   指数減衰＋ベイズ共役更新）に従う。ここでは Ebisu コアの推定が真実と一致＝過小評価バイアス
    //   が消え、under-spacing トラップも起きないので Ebisu が勝てる唯一の環境。
    this.trueModel = config.trueModel ?? 'alpha';
    this._trueEbisu = new Map();   // 'ebisu' 真実用の per-word モデル [α, β, t]
    this.dsrDecay = -0.5;                                  // べき則の減衰指数（FSRS-4.5）
    this.dsrFactor = Math.pow(0.9, 1 / this.dsrDecay) - 1; // R(S)=0.9 となる係数 ≈ 0.23457
    this.dsrGain = config.dsrGain ?? 6.0;                  // 成功時の安定度成長ゲイン
    this.dsrSat = config.dsrSat ?? 0.3;                    // 安定度飽和指数（S^(−sat)＝高安定ほど伸びにくい）
    this.dsrSpacing = config.dsrSpacing ?? 1.0;            // 間隔感度（e^(spacing·(1−R)) の凸性）
    this.dsrLapse = config.dsrLapse ?? 0.3;               // 失敗時の安定度減衰

    this._hFactorCache = new Map();
    this._trueH = new Map();      // wordId → 真の半減期（システムの h とは独立）
    this._trueLastT = new Map();  // wordId → 真の記憶での最終復習時刻（日数）
  }

  // wordId に紐づく安定した真 h 個体差係数（[1-hVariation, 1+hVariation] の決定的擬似乱数）
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

  _cardWeight(cardType, result) {
    const c = this.srs;
    if (result === 'correct_messy') return c.handwriteMessyWeight;
    switch (cardType) {
      case 'recognition': return c.recognitionWeight;
      case 'recall':      return c.recallWeight;
      case 'dictation':   return c.dictationWeight;
      case 'handwrite':   return c.handwriteWeight;
      default:            return 1.0;
    }
  }

  // 真の半減期を取得（未初期化なら h0 × ability × 個体差 で遅延初期化）
  _ensureTrueH(wordState) {
    let th = this._trueH.get(wordState.wordId);
    if (th === undefined) {
      th = this.srs.h0 * this.ability * this._hFactor(wordState.wordId);
      this._trueH.set(wordState.wordId, th);
    }
    return th;
  }

  // 'ebisu' 真実用の per-word モデル（未初期化なら α0=β0=2・t0=h0×ability×個体差 で遅延初期化）
  _ensureTrueEbisu(wordState) {
    let m = this._trueEbisu.get(wordState.wordId);
    if (m === undefined) {
      const t0 = this.srs.h0 * this.ability * this._hFactor(wordState.wordId);
      m = ebisuDefault(2.0, 2.0, t0);
      this._trueEbisu.set(wordState.wordId, m);
    }
    return m;
  }

  // 学習者の真の保持率（difficultyMod を含まない素の記憶）。検証スクリプトの校正測定にも使う。
  // _trueH に入る値は trueModel により意味が異なる（'alpha'=半減期 / 'dsr'=安定度 S）。
  truePRecall(wordState, currentTime) {
    const lastT = this._trueLastT.get(wordState.wordId) ?? currentTime;
    const dt = Math.max(0, currentTime - lastT);
    if (this.trueModel === 'ebisu') {
      return ebisuPredict(this._ensureTrueEbisu(wordState), dt);
    }
    const s = this._ensureTrueH(wordState);
    if (this.trueModel === 'dsr') {
      // べき則: R(t) = (1 + factor·t/S)^decay（R(S)=0.9・指数より重い裾）
      return Math.pow(1 + this.dsrFactor * dt / s, this.dsrDecay);
    }
    return Math.pow(2, -dt / s);
  }

  // 真のカーブの半減期（真の保持率が 0.5 になる経過時間）。オラクルの due 判定に使う。
  // 'alpha'（指数則）では強度 = 半減期そのもの。'dsr'（べき則）では S から解析的に導く。
  trueHalflife(wordState) {
    if (this.trueModel === 'ebisu') {
      return ebisuHalflife(this._ensureTrueEbisu(wordState), 0.5);
    }
    const s = this._ensureTrueH(wordState);
    if (this.trueModel === 'dsr') {
      // R=0.5 → (1+factor·t/S)^decay = 0.5 → t = S·(0.5^(1/decay) − 1)/factor
      return s * (Math.pow(0.5, 1 / this.dsrDecay) - 1) / this.dsrFactor;
    }
    return s;
  }

  // 真の記憶を更新（間隔効果。終端 result の正誤で成長/減衰）
  _updateTrueMemory(wordState, cardType, result, isCorrect, currentTime) {
    const c = this.srs;

    if (this.trueModel === 'ebisu') {
      // Ebisu の生成過程: 経過時間 dt にベイズ共役更新（成功=1/失敗=0）
      const lastT = this._trueLastT.get(wordState.wordId) ?? currentTime;
      const dt = Math.max(0, currentTime - lastT);
      const m = ebisuUpdate(this._ensureTrueEbisu(wordState), isCorrect ? 1 : 0, 1, dt);
      this._trueEbisu.set(wordState.wordId, m);
      this._trueLastT.set(wordState.wordId, currentTime);
      return;
    }

    let s = this._ensureTrueH(wordState);
    const weight = this._cardWeight(cardType, result);
    const r = this.truePRecall(wordState, currentTime);     // 復習時点の真の保持率（更新前）

    if (this.trueModel === 'dsr') {
      // 安定度飽和つき間隔カーネル（FSRS 風・HLR/Ebisu のどちらとも別系統）:
      //   ΔS/S = gain · S^(−sat) · (e^(spacing·(1−R)) − 1) · weight
      // - 間隔を空けるほど（R 低）凸に大きく伸び、高安定語ほど（S^(−sat)）伸びにくい
      if (isCorrect) {
        const grow = this.dsrGain * Math.pow(s, -this.dsrSat)
                   * (Math.exp(this.dsrSpacing * (1 - r)) - 1) * weight;
        s = s * (1 + grow);
      } else {
        s = s * this.dsrLapse;
      }
    } else {
      // 既存 'alpha'（指数忘却・HLR 同族）
      if (isCorrect) {
        const base = 1 - c.targetRetention;               // 最適復習点を full(=1) にする正規化基準
        const spacing = base > 0 ? Math.min(1, (1 - r) / base) : 1;
        s = s * (1 + (c.alpha - 1) * weight * spacing);
      } else {
        s = s * c.beta;
      }
    }
    s = Math.min(Math.max(s, c.hMin), c.hMax);
    this._trueH.set(wordState.wordId, s);
    this._trueLastT.set(wordState.wordId, currentTime);
  }

  // カードへの応答をシミュレート（終端結果のみ返す）
  // → 'perfect' | 'correct_messy' | 'wrong'
  //   ※ near_miss/phonetic は _resolveSpelling で perfect/wrong に終端化される
  respond(wordState, cardType, currentTime) {
    // Intro: 真の記憶を初期化（提示のみ・常に正解扱い・記憶クロックを開始）
    if (cardType === 'intro') {
      this._trueH.set(wordState.wordId, this.srs.h0 * this.ability * this._hFactor(wordState.wordId));
      this._trueLastT.set(wordState.wordId, currentTime);
      return 'perfect';
    }
    // Passive: 間接観測。真の記憶も更新しない（システムも h を更新しない）
    if (cardType === 'passive') return 'perfect';

    // 真の保持率からカード種別の難度補正を掛けて正誤を引く
    const trueP = this.truePRecall(wordState, currentTime);
    const difficultyMod = {
      recognition:  1.2,
      recall:       1.0,
      dictation:    0.8,
      handwrite:    0.75,
    };
    const adjustedP = Math.min(1.0, trueP * (difficultyMod[cardType] ?? 1.0));
    const isCorrect = Math.random() < adjustedP;

    let result;
    if (!isCorrect) {
      result = 'wrong';
    } else if (cardType === 'dictation') {
      const r = Math.random();
      if (r < 0.70) result = 'perfect';
      else result = this._resolveSpelling(r < 0.85 ? 'near_miss' : 'phonetic');
    } else if (cardType === 'handwrite') {
      const r = Math.random();
      if (r < 0.60) result = 'perfect';
      else if (r < 0.80) result = 'correct_messy';
      else if (r < 0.92) result = this._resolveSpelling('near_miss');
      else result = 'wrong';
    } else {
      result = 'perfect';
    }

    // 真の記憶を「本物の retrieval 結果」で更新（観測ノイズの前＝slip/guess は真の記憶を歪めない）
    this._updateTrueMemory(wordState, cardType, result, result !== 'wrong', currentTime);

    // 観測ノイズ層: システムが「見る」結果だけを汚す（真の記憶は上で更新済み）。
    // - slip : 本当は正解（result≠wrong）なのに 'wrong' と観測される
    // - guess: 本当は不正解（result=wrong）なのに 'perfect' と観測される
    if (this.slipRate > 0 || this.guessRate > 0) {
      if (result !== 'wrong') {
        if (Math.random() < this.slipRate) return 'wrong';
      } else if (Math.random() < this.guessRate) {
        return 'perfect';
      }
    }
    return result;
  }

  // near_miss/phonetic（綴りが惜しい中間判定）を、アプリの再入力モデルに沿って
  // 終端結果（'perfect' = 修正成功 / 'wrong' = ギブアップ）へ解決する。
  // エンジンには終端結果のみ渡るため、sim と app が同じ h 更新経路を通る。
  _resolveSpelling(kind) {
    const fixRate = kind === 'near_miss' ? this.nearMissFixRate : this.phoneticFixRate;
    return Math.random() < fixRate ? 'perfect' : 'wrong';
  }
}
