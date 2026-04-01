// core/labels.js
// UIラベル定数・変換関数（ui-labels-spec.md 準拠）

export const LABELS = {
  params: {
    h: '記憶強度',
    peakH: '最高記憶強度',
    avgH: '平均記憶強度',
    pRecall: '記憶保持率',
    sigma: '確信度',
    reviewCount: '復習回数',
    correctCount: '正解回数',
    incorrectCount: '不正解回数',
    stuckCount: '苦手度',
  },
  pools: {
    urgent: '要復習',
    due: '復習時期',
    uncertain: '確認待ち',
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

/**
 * σ（推定の不確かさ）を確信度ラベルに変換する。
 * @param {number} sigma
 * @returns {'高'|'中'|'低'}
 */
export function sigmaToConfidence(sigma) {
  if (sigma < 0.5) return '高';
  if (sigma < 1.5) return '中';
  return '低';
}
