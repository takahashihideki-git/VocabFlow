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
  // gain  = 1 + (alpha−1) × cardWeight × ratio
  // ratio = min(1, deltaT / (h × retentionFactor))  ← 予定復習間隔で正規化（校正済み）
  // - 予定どおりの復習（deltaT ≈ h × retentionFactor ≈ h × 0.234）→ ratio≈1 → full gain（旧 alpha 挙動）
  // - クラミング/リトライ/filler（予定より早い）→ ratio<1 → 減衰（間隔反復の本質）
  // 素の min(1, deltaT/h) は target-retention スケジューリングと噛み合わず ratio が ~0.234 で
  // 頭打ちになり定着が ~20倍遅延したため、retentionFactor 正規化で校正した（2026-06-11）。
  // 間隔効果ありの sim（virtual-learner）で OFF 比キャリブMAE 約半減を確認し既定 true に。
  deltaTGain: true,

  // 播種ノイズ（seed noise・seed-noise-findings.md）。位相同期の分散。
  // 正解時の h 更新後に信頼度連動ノイズ h *= 1 + (rand·2−1) × seedNoiseBase/rc^seedNoiseExp を乗せ、
  // 同日導入コホートの h を恒久的に分岐させる。急勾配（exp=2.5）なので rc=1（導入時）の一撃に
  // 播種が集中し rc≥2 で実質ゼロ＝「導入時の一回播種」で複利蓄積しない（√rc だと成熟語まで汚れる）。
  // 過負荷学習者（位相同期局面）で genuine に定着 +約5%・余裕学習者は無害＝常時適用で安全。
  // h は真の記憶の測定値ではなくスケジュールを回す seed なので、この分散は推定の破壊ではない。
  seedNoise: true,
  seedNoiseBase: 0.5,
  seedNoiseExp: 2.5,

  // 不確実性（提案書: bayesian-srs-proposal.md §2/§3）
  // σ 状態変数を持たず、観測回数と経過時間から「不確実性の幅」を導出し、
  // due 判定時に h をトンプソンサンプリングして位相同期を散らす。
  // ※ 位相同期の分散は新 learner で throughput 効果を立証できず、より強力で outcome 検証済みの
  //   seedNoise に置き換えたため既定 false。effectiveH/uncertaintyWidth は提案書の系譜として残置
  //   （dueSampling=true で再有効化可能）。seed-noise-findings.md 参照。
  dueSampling: false,       // due 判定時の effectiveH サンプリング（false で点推定 = 既定）
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
  // 新語枠を復習から独立に予約するか（false=従来の復習優先・新語は余りスロット）。
  // true にすると保守的なコア（復習多め）でも新語供給が枯渇しない＝実アプリの「1日N新語」方式。
  reserveNewSlots: false,

  // 適応導入（spec の過負荷保護と oracle のスループットを両立）。
  // 深刻に遅れた語（urgent・p<0.5）の滞留量に応じて新語予約枠を線形に絞る:
  //   urgent ≤ soft → 満額（maxNewPerSession）/ urgent ≥ hard → 0 / 間は線形。
  // 余裕があれば新語を入れ（べき則の枯渇を回避）、溺れ始めたら絞る（指数則の過剰導入崩壊を回避）。
  // true のとき reserveNewSlots より優先。false で従来挙動（既定）。
  // ⚠️ adaptive-success は「現実=べき則忘却」への賭け。べき則真実では near-oracle だが、
  //    exponential 真実（標準 sim の既定）では絶対アウトカムが壊滅（Day90 定着 245→2）＝
  //    成熟しない。%oracle は policy-matched オラクルとの比較で絶対崩壊を隠す。greedy(false)が
  //    真実不確実性に頑健なため既定維持。詳細は memory-core-investigation.md §6.5/§11。
  adaptiveNew: false,
  adaptiveNewSignal: 'success', // 'urgent'（urgent 滞留で絞る・コア依存）| 'success'（観測成功率で絞る・頑健）
  adaptiveNewSoft: 5,    // urgent 信号: この urgent 数までは満額予約
  adaptiveNewHard: 20,   // urgent 信号: この urgent 数で新語ゼロ
  successEWMAAlpha: 0.05,      // 成功率 EWMA の更新係数（≈直近20件の窓）
  adaptiveNewSuccLow: 0.6,     // success 信号: この成功率で新語ゼロ
  adaptiveNewSuccHigh: 0.85,   // success 信号: この成功率で満額予約
  // 最低導入フロア: 成功率が低くても最低この語数は予約（0=フロアなし）。
  // ⚠️ 「exponential×novice の崖をフロアで消す」案は反証済み（§12）。崖の原因は新語不足でなく
  //    容量限界下での成熟阻害なので、フロアは導入を増やすだけで mastered/avgH をむしろ下げる。
  //    再検証用に gated 残置・既定 0。
  adaptiveNewFloor: 0,
  sessionsPerDay: 3,
  retryGap: 4,          // 不正解時の再挿入位置（現在位置+N枚後）
  maxRetryPerCard: 2,   // 同一カードの最大再挿入回数/セッション

  // 記憶コアの選択（sim 検証用プロトタイプ）。
  // 'hlr'   = 既存の h 点推定 + α/β 乗算更新（+ deltaTGain / seedNoise）。既定・本番挙動。
  // 'ebisu' = 本物の Bayesian 記憶モデル（core/ebisu.js）。h は Ebisu の halflife を同期し、
  //           pRecall は Ebisu の predictRecall を使う。deltaTGain は Ebisu が内包するため不使用。
  //           seedNoise はモデルの時間尺度 t をスケールして halflife を恒久シフトさせる。
  // 'dsr' = べき則忘却 + 安定度成長（FSRS 系・core/dsr.js）。実 forgetting がべき則寄りという
  //         経験的事実に形だけ乗る第三の族。成長定数は手選び（真カーブに未 fit）。
  memoryCore: 'hlr',
  ebisuAlpha0: 2.0,     // Ebisu 初期 Beta(α0, β0)。大きいほど初期半減期 t0=h0 への信頼が高い
  ebisuBeta0: 2.0,
  dsrCoreGain: 2.5,     // DSR コア: 成功時の安定度成長ゲイン
  dsrCoreSat: 0.2,      // 安定度飽和指数（S^(−sat)）
  dsrCoreSpacing: 1.0,  // 間隔感度（e^(spacing·(1−R))）
  dsrCoreLapse: 0.3,    // 失敗時の安定度減衰

  // Total words
  totalWords: 1900,
};

export function createConfig(overrides = {}) {
  return { ...DEFAULT_CONFIG, ...overrides };
}
