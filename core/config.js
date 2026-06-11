// core/config.js — 全パラメータ定義

export const DEFAULT_CONFIG = {
  // Core SRS
  h0: 1.0,              // 新語の初期半減期（日）
  alpha: 2.0,           // 正解時の半減期倍率（基本）
  beta: 0.3,            // 不正解時の半減期倍率
  hMin: 0.5,            // h の下限（h0/2）。death spiral 防止
  hMax: 365,            // h の上限
  sigma0: 1.0,          // 初期不確実性
  sigmaDecay: 0.01,     // 時間経過による不確実性増加（/日）
  targetRetention: 0.85,

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
  uncertainThreshold: 1.5,
  retryGap: 4,          // 不正解時の再挿入位置（現在位置+N枚後）
  maxRetryPerCard: 2,   // 同一カードの最大再挿入回数/セッション

  // Total words
  totalWords: 1900,
};

export function createConfig(overrides = {}) {
  return { ...DEFAULT_CONFIG, ...overrides };
}
