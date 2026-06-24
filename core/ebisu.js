// core/ebisu.js — Ebisu（fasiha/ebisu）v2 の Bayesian 記憶モデルの JS 移植（sim 検証用プロトタイプ）
//
// 目的: VocabFlow の記憶コア（h 点推定 + α/β 乗算更新 + 手製 uncertaintyWidth）を、
// 本物の Bayesian 記憶モデル Ebisu に差し替えて sim で A/B するための最小実装。
// memoryCore='ebisu' のときだけ使われ、'hlr'（既定）では一切読まれない（既存挙動はゼロ変更）。
//
// モデル: 各語の「最後の復習からの経過時間 t における記憶保持確率」を
//   p_t ~ Beta(α, β)         （t は時間尺度パラメータ＝モデルの参照時刻）
// とし、別の経過時間 s では p_s = p_t^(s/t)（指数忘却）で減衰する。
// 任意時刻 s の保持確率の N 次モーメントが Beta 関数で解析的に閉じる:
//   E[p_s^N] = B(α + N·s/t, β) / B(α, β)
// これが predictRecall（期待保持率）と updateRecall（観測後のベイズ更新）の土台。
//
// 参照: https://github.com/fasiha/ebisu — 「deliberately a recall-probability component」
// （カード種別・新語投入・セッション生成・出題順は持たない＝VocabFlow の srs-engine の
//  h 更新層だけに対応する）。

// 同一セッション内リトライ等で deltaT≈0 になると更新が退化する（成功は無変化・失敗は
// 退化）。実時間の下限としてごく小さい正値で floor する（約 8.6 秒）。
export const EBISU_DT_FLOOR = 1e-4;

// ---- 特殊関数（Lanczos 近似の log-gamma） ----
const LANCZOS_G = 7;
const LANCZOS_C = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028,
  771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

export function gammaln(x) {
  if (x < 0.5) {
    // 反射公式（我々の引数は常に正だが防御的に）
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - gammaln(1 - x);
  }
  x -= 1;
  let a = LANCZOS_C[0];
  const t = x + LANCZOS_G + 0.5;
  for (let i = 1; i < LANCZOS_G + 2; i++) a += LANCZOS_C[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

export function betaln(a, b) {
  return gammaln(a) + gammaln(b) - gammaln(a + b);
}

// log(exp(x) − exp(y))（x ≥ y を前提）。B(·) の差を安定に計算するため。
function logSubExp(x, y) {
  if (x <= y) return -Infinity;
  return x + Math.log1p(-Math.exp(y - x));
}

// ---- 初期モデル ----
// α0=β0（信頼度）と t0（初期半減期の推測）。VocabFlow では t0 = h0。
export function defaultModel(alpha0, beta0, t0) {
  return [alpha0, beta0, t0];
}

// ---- predictRecall: 経過時間 tnow における期待保持率 E[p_tnow] ----
export function predictRecall(model, tnow) {
  const [a, b, t] = model;
  const dt = Math.max(0, tnow) / t;
  if (dt === 0) return 1;
  return Math.exp(betaln(a + dt, b) - betaln(a, b));
}

// ---- modelToHalflife: predictRecall = percentile となる経過時間（既定 0.5＝半減期） ----
export function modelToHalflife(model, percentile = 0.5) {
  const [, , t] = model;
  // predictRecall は s について単調減少。percentile 未満になる上限を倍々で探索 → 二分。
  let hi = t;
  let guard = 0;
  while (predictRecall(model, hi) > percentile && guard++ < 60) hi *= 2;
  let lo = 0;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (predictRecall(model, mid) > percentile) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// (mean, var) を Beta(α, β) にモーメントマッチ
function meanVarToBeta(mean, variance) {
  const m = Math.min(1 - 1e-9, Math.max(1e-9, mean));
  const v = Math.max(1e-12, variance);
  const tmp = (m * (1 - m)) / v - 1;
  let a = m * tmp;
  let b = (1 - m) * tmp;
  // 退化（極端な観測）を防ぐ最小値ガード
  if (!(a > 0) || !isFinite(a)) a = 1e-3;
  if (!(b > 0) || !isFinite(b)) b = 1e-3;
  return [a, b];
}

// ---- updateRecall: 経過時間 tnow に successes/total を観測した後の事後モデル ----
// total=1 の二値観測（successes ∈ {0,1}）を扱う。tback は返すモデルの参照時刻（既定＝
// 更新前の半減期＝「rebalance」相当。tnow=0 でのモーメント退化を避ける）。
export function updateRecall(model, successes, total, tnow, tback = null) {
  const [a, b, t] = model;
  const dt = Math.max(EBISU_DT_FLOOR, tnow) / t;
  const tb = tback == null ? modelToHalflife(model, 0.5) : tback;
  const eps = tb / t;

  let mean, m2;
  if (successes >= 1) {
    // 事後 ∝ Beta(a+dt, b)。E[p_tback^N] = B(a+dt+N·eps, b) / B(a+dt, b)
    const logDen = betaln(a + dt, b);
    mean = Math.exp(betaln(a + dt + eps, b) - logDen);
    m2   = Math.exp(betaln(a + dt + 2 * eps, b) - logDen);
  } else {
    // 事後 ∝ (1 − p^dt)·Beta(a,b)。
    // E[p_tback^N] = [B(a+N·eps,b) − B(a+dt+N·eps,b)] / [B(a,b) − B(a+dt,b)]
    const logDen = logSubExp(betaln(a, b), betaln(a + dt, b));
    const logN1  = logSubExp(betaln(a + eps, b), betaln(a + dt + eps, b));
    const logN2  = logSubExp(betaln(a + 2 * eps, b), betaln(a + dt + 2 * eps, b));
    mean = Math.exp(logN1 - logDen);
    m2   = Math.exp(logN2 - logDen);
  }
  const variance = m2 - mean * mean;
  const [na, nb] = meanVarToBeta(mean, variance);
  return [na, nb, tb];
}
