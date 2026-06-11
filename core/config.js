// core/config.js — 全パラメータ定義

export const DEFAULT_CONFIG = {
  // Core SRS
  h0: 1.0,              // 新語の初期半減期（日）
  alpha: 2.0,           // 正解時の半減期倍率（基本）
  beta: 0.3,            // 不正解時の半減期倍率
  hMin: 0.5,            // h の下限（h0/2）。death spiral 防止
  hMax: 365,            // h の上限
  targetRetention: 0.85,

  // deltaT 連動の h ゲイン（review #1）。正解時のゲインを前回復習からの経過時間で減衰させる。
  // gain = 1 + (alpha−1) × cardWeight × min(1, deltaT/h)。
  // ※ 現状は校正前のため既定 false（旧挙動 h × alpha × cardWeight を維持してアプリを壊さない）。
  //   素の式は target-retention スケジューリング（復習時 deltaT≈h×0.234）と噛み合わず、
  //   ratio が常に ~0.234 で頭打ち → gain~1.2 止まりで定着が ~20倍遅延する（sim で確認済み）。
  //   次セッションで ratio 正規化（例: deltaT/(h×retentionFactor)）等を校正し、
  //   個体差ありの sim で検証してから true に倒す予定。
  deltaTGain: false,

  // 不確実性（提案書: bayesian-srs-proposal.md §2/§3）
  // σ 状態変数を持たず、観測回数と経過時間から「不確実性の幅」を導出し、
  // due 判定時に h をトンプソンサンプリングして位相同期を散らす。
  dueSampling: true,        // due 判定時の effectiveH サンプリングを有効化（false で点推定 = 旧挙動）
  uncertaintyBase: 0.5,     // 観測回数項の係数（reviewCount=1 で 0.5、4 で 0.25…）
  uncertaintyFloor: 0.05,   // 不確実性の幅の下限
  staleGrowth: 0.05,        // 経過時間項の係数（staleGrowth × log(1+deltaT)）

  // Card weights
  recognitionWeight: 0.8,
  recallWeight: 1.0,
  dictationWeight: 1.3,
  handwriteWeight: 1.6,
  handwriteMessyWeight: 1.3,

  // Stage thresholds
  dictationThresholdH: 4.0,   // Dictation出題に必要な最小h（日）
  handwriteStuckThreshold: 3, // 同一段階での累積不正解数 ≥ この値で Handwrite 介入
  masteredThresholdH: 14.0,   // 定着済みと見なすh（日）
  maxHandwritePerSession: 2,

  // Wave
  waveSize: 100,
  waveUnlockRatio: 0.7,
  waveUnlockH: 2.0,
  graduationH: 8.0,           // ウェーブ卒業と見なすh（日）

  // Session
  sessionSize: 20,
  maxNewPerSession: 5,
  sessionsPerDay: 3,
  retryGap: 4,          // 不正解時の再挿入位置（現在位置+N枚後）
  maxRetryPerCard: 2,   // 同一カードの最大再挿入回数/セッション

  // Total words
  totalWords: 1900,
};

export function createConfig(overrides = {}) {
  return { ...DEFAULT_CONFIG, ...overrides };
}
