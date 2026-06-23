// core/labels.js
// UIラベル定数・変換関数（ui-labels-spec.md 準拠）

// 信頼度卒業の閾値（reviewCount）。これ未満の導入済み語は h ティア（暖色）ではなく
// 「出会ったばかり」の青で一律表示する（Word Wave 一覧・Wave Heatmap 共通）。
// 導入直後の h は ripple 播種ノイズを多く含み語間の色差が「確認された差」でないため、
// 観測を重ねるまでノイズを色として見せない。詳細・設計理由は spec.md §5.2。
export const CONFIDENCE_MIN_REVIEWS = 3;

// Marine Chart 学習プロファイルの FAB を Word Wave 画面に出す閾値（学習済み語数）。
// プロファイルの主要コンテンツ（誤答の渦：品詞/カテゴリ・綴りの暗礁）は learned（stage!=='new'）
// 全体から算出するため、gate も learnedCount で測る（mastered ではない＝中身と指標を一致させる）。
// 50 は実用下限: 19カテゴリ中いくつかが minN=5 に届きカテゴリの渦が成立し始める語数。
// これ未満では誤答の渦チャートが疎で読み取れないため隠す。
export const PROFILE_FAB_MIN_LEARNED = 50;

// 学習プロファイル画面の文言（誤答の渦＝品詞/カテゴリ・乗り越えた難所・綴りの暗礁）
export const PROFILE_LABELS = {
  title: 'Marine Chart 学習プロファイル',
  posSection: '誤答の渦：品詞',
  catSection: '誤答の渦：カテゴリ',
  overcameSection: '乗り越えた難所',
  reefSection: '綴りの暗礁',
  topErrorWords: '誤答が多い単語 上位10語',
  topErrorWordsAll: '誤答が多い単語 上位10語（全カテゴリ）',
  reefCta: (n) => `この暗礁だけで特訓する（${n}語）`,
};

export const LABELS = {
  params: {
    h: '記憶強度',
    peakH: '最高記憶強度',
    avgH: '平均記憶強度',
    pRecall: '記憶保持率',
    reviewCount: '復習回数',
    correctCount: '正解回数',
    incorrectCount: '不正解回数',
    stuckCount: '苦手度',
  },
  pools: {
    urgent: '要復習',
    due: '復習時期',
    new: '新語',
    filler: '定着語',
  },
  cardTypes: {
    intro: 'Intro',
    recognition: 'Recognition',
    recall: 'Recall',
    dictation: 'Dictation',
    handwrite: 'Handwrite',
    passive: 'Passive',
  },
  stages: {
    new: 'new',
    intro: 'intro',
    recognition: 'recognition',
    recall: 'recall',
    dictation: 'dictation',
    handwrite: 'handwrite',
    mastered: 'mastered',
  },
  session: {
    sessionSize: 'セッション枚数',
    sessionsPerDay: '1日のセッション数',
    completed: '今日の復習は完了です',
    timeForward1: '8時間後',
    timeForward2: '1日後',
    timeForward3: '1週間後',
  },
  wordwave: {
    masteredCount: '定着語数',
    learnedCount: '学習済み語数',
    activeWaves: '現在のWave',
    excluded: '除外',
  },
  heatmap: {
    unlearned: '未学習',
    started: '学習開始',
    practicing: '練習中',
    growing: '成長中',
    almost: 'もう少し',
    nearMastered: 'ほぼ定着',
    mastered: '定着',
    excluded: '除外',
  },
};

/**
 * h（半減期、日単位）を人間が読みやすい文字列に変換する。
 * @param {number} h
 * @returns {string}
 */
export function formatH(h) {
  if (h <= 0) return '—';
  if (h < 1) return `${(h * 24).toFixed(0)}時間`;
  if (h < 30) return `${h.toFixed(1)}日`;
  if (h < 365) return `${(h / 30).toFixed(1)}ヶ月`;
  return `${(h / 365).toFixed(1)}年`;
}

/**
 * 記憶保持率（0〜1）をパーセント文字列に変換する。
 * @param {number} p
 * @returns {string}
 */
export function formatPRecall(p) {
  return `${(p * 100).toFixed(0)}%`;
}
