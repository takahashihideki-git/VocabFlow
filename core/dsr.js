// core/dsr.js — DSR（Difficulty-Stability-Retrievability・FSRS 系）記憶コアの最小実装（sim 検証用）
//
// 目的: memoryCore='dsr' のとき、システムの記憶推定を「べき則忘却＋安定度成長」で行う。
// HLR（指数則）でも Ebisu（Beta/GB1）でもない第三の族。実 forgetting がべき則寄り（FSRS が
// 実データで実証）という経験的事実に、データ収集なしで"形だけ"乗る試み。
//
// 注: ここで使う成長定数（gain/sat/spacing）は手選びの固定値で、真のカーブに fit していない。
// FSRS は実データでこれらを最適化する。本コアは「族を合わせれば対オラクル％が closes するか」を
// 測るためのもの（最後の数%の fit には実データが要る、という切り分けを sim で示す）。

export const DSR_DECAY = -0.5;                              // べき則の減衰指数（FSRS-4.5）
export const DSR_FACTOR = Math.pow(0.9, 1 / DSR_DECAY) - 1; // R(S)=0.9 となる係数 ≈ 0.23457

// 経過時間 dt における保持率の推定（S=安定度＝R が 0.9 に落ちる経過時間）
export function predictRecall(S, dt) {
  if (S <= 0) return 0;
  return Math.pow(1 + DSR_FACTOR * Math.max(0, dt) / S, DSR_DECAY);
}

// 安定度 S → 半減期（R=0.5 になる経過時間）。ステージ閾値・due 判定が使う word.h に同期するため。
export function halflife(S) {
  return S * (Math.pow(0.5, 1 / DSR_DECAY) - 1) / DSR_FACTOR;
}

// 観測（正誤）後の安定度更新。FSRS 同様、復習時点の"自分の"推定保持率 R を使う。
//   成功: ΔS/S = gain · S^(−sat) · (e^(spacing·(1−R)) − 1) · weight   （間隔を空けるほど凸に伸び、高安定ほど飽和）
//   失敗: S × lapse
export function updateStability(S, isCorrect, dt, cfg, weight = 1) {
  const R = predictRecall(S, dt);
  if (isCorrect) {
    const grow = cfg.dsrCoreGain * Math.pow(S, -cfg.dsrCoreSat)
               * (Math.exp(cfg.dsrCoreSpacing * (1 - R)) - 1) * weight;
    return S * (1 + grow);
  }
  return S * cfg.dsrCoreLapse;
}
