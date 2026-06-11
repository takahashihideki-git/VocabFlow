// sim/scenarios.js — シナリオ定義

export const SCENARIOS = {
  A: {
    id: 'A',
    name: '混合比率の感度分析',
    description: '新語上限（maxNewPerSession）を変化させたときの定着効率を測定',
    variable: 'maxNewPerSession',
    values: [2, 3, 5, 7, 10],
    fixedOverrides: {},
    duration: 90,
  },
  B: {
    id: 'B',
    name: '忘却曲線パラメータの影響',
    description: 'α（正解時倍率）の違いが定着率に与える影響',
    variable: 'alpha',
    values: [1.5, 1.8, 2.0, 2.5, 3.0],
    fixedOverrides: {},
    duration: 90,
  },
  C: {
    id: 'C',
    name: '1000語到達シミュレーション',
    description: 'デフォルトパラメータで1000語定着（h≥14日）までの日数を推定',
    variable: null,
    values: [null],
    fixedOverrides: {},
    duration: 365,
  },
  D: {
    id: 'D',
    name: 'ウェーブパラメータの感度分析',
    description: 'waveSize と waveUnlockRatio の組み合わせ比較',
    variable: ['waveSize', 'waveUnlockRatio'],
    values: {
      waveSize: [30, 50, 80],
      waveUnlockRatio: [0.5, 0.7, 0.9],
    },
    fixedOverrides: {},
    duration: 180,
  },
  E: {
    id: 'E',
    name: '位相同期の分散（due サンプリング）',
    description: 'due 判定の effectiveH トンプソンサンプリング有無で定着効率・副作用を比較（頻回学習者）。クラスタ分散・復習なし回数の詳細は scripts/verify_due_sampling.js を参照',
    variable: 'dueSampling',
    values: [false, true],
    fixedOverrides: { sessionsPerDay: 5 },
    duration: 60,
  },
};
