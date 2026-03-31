// sim/sim-runner.js — シミュレーション実行ロジック（UI非依存）

import { createConfig } from '../core/config.js';
import { WordState, LearnerState, Card } from '../core/models.js';
import { SRSEngine } from '../core/srs-engine.js';
import { WaveManager } from '../core/wave-manager.js';
import { FeedGenerator } from '../core/feed-generator.js';
import { WORD_DATA } from '../core/word-data.js';
import { VirtualLearner } from './virtual-learner.js';
import { SCENARIOS } from './scenarios.js';

// -------------------------------------------------------
// 1日分のシミュレーション実行
// -------------------------------------------------------
function simulateDay(learnerState, engine, waveManager, feedGen, learner, day) {
  const cfg = learnerState.config;
  const stats = { urgentCards: 0, newCards: 0, reviewCards: 0, correctCount: 0, totalCount: 0 };

  for (let s = 0; s < cfg.sessionsPerDay; s++) {
    const sessionTime = day + s / cfg.sessionsPerDay;
    const cardQueue = feedGen.generateSession(learnerState, sessionTime);

    // 不正解カードの再出題カウント（1セッション内で各単語1回まで）
    const reinsertCount = new Map();

    let i = 0;
    while (i < cardQueue.length) {
      const card = cardQueue[i];
      const result = learner.respond(card.word, card.cardType, sessionTime);
      card.result = result;

      // processResponse 前に stage を保存（不正解時の降格前の値が必要）
      const stageBeforeProcess = card.word.stage;

      // spec §4.5: リトライ正解は「ダメージ回復」であって「成長」ではない
      //   → h 更新なし、不正解時の stage 降格のみキャンセル
      // 例外: Handwrite リトライ正解は h ブーストあり（停滞突破が目的）
      if (card.isRetry && result !== 'wrong') {
        if (card.cardType === 'handwrite') {
          engine.processResponse(card.word, card.cardType, result, sessionTime);
        } else {
          card.word.stage = card.stageBeforeWrong;
        }
      } else {
        engine.processResponse(card.word, card.cardType, result, sessionTime);
      }

      stats.totalCount++;
      if (result !== 'wrong') stats.correctCount++;
      if (card.cardType === 'intro') {
        stats.newCards++;
      } else {
        stats.reviewCards++;
      }

      // 不正解 → retryGap 枚後に再出題（relearning step, spec §4.5）
      if (result === 'wrong' && card.cardType !== 'passive') {
        const key = card.word.wordId;
        if ((reinsertCount.get(key) ?? 0) < cfg.maxRetryPerCard) {
          reinsertCount.set(key, (reinsertCount.get(key) ?? 0) + 1);
          const pos = Math.min(i + 1 + cfg.retryGap, cardQueue.length);
          const retryCard = new Card(card.word, card.cardType);
          retryCard.isRetry = true;
          // 連続不正解時は最初の不正解前の stage を引き継ぐ
          // stageBeforeProcess は processResponse 呼び出し前（降格前）の値
          retryCard.stageBeforeWrong = card.isRetry ? card.stageBeforeWrong : stageBeforeProcess;
          cardQueue.splice(pos, 0, retryCard);
        }
      }

      i++;
    }

    learnerState.totalCardsConsumed += cardQueue.length;
    learnerState.sessionsCompleted++;
  }

  learnerState.currentTime = day + 1;
  return stats;
}

// -------------------------------------------------------
// 単一シナリオ実行
// -------------------------------------------------------
export function runSimulation(configOverrides = {}, duration = 90, onProgress = null) {
  const cfg = createConfig(configOverrides);
  const words = WORD_DATA.map(d => new WordState(d.id, d.word, Math.ceil(d.id / cfg.waveSize)));
  const state = new LearnerState(words, cfg);
  const engine = new SRSEngine(cfg);
  const wm = new WaveManager(cfg, state);
  const fg = new FeedGenerator(cfg, engine, wm);
  const learner = new VirtualLearner({ learnerAbility: 1.0 });

  const snapshots = [];

  for (let day = 0; day < duration; day++) {
    const stats = simulateDay(state, engine, wm, fg, learner, day);

    const masteredCount = state.words.filter(w => w.h >= cfg.masteredThresholdH).length;
    const learnedCount  = state.words.filter(w => w.stage !== 'new').length;
    const activeWords   = state.words.filter(w => w.h > 0);
    const avgH = activeWords.length
      ? activeWords.reduce((s, w) => s + w.h, 0) / activeWords.length
      : 0;

    // 10日ごと（または最終日）に全語の h 値を保存 → ヒートマップスライダー用
    const storeHeatmap = (day % 10 === 9) || (day === duration - 1);

    snapshots.push({
      day: day + 1,
      masteredCount,
      learnedCount,
      activeWaves: [...state.activeWaves],
      avgH,
      correctRate: stats.totalCount > 0 ? stats.correctCount / stats.totalCount : 0,
      newCards: stats.newCards,
      reviewCards: stats.reviewCards,
      totalCards: stats.totalCount,
      heatmapData: storeHeatmap ? Array.from(state.words, w => w.h) : null,
    });

    if (onProgress) onProgress(day + 1, duration, snapshots[snapshots.length - 1]);

    // 1000語定着到達で打ち切り（シナリオC用）
    if (masteredCount >= 1000 && duration > 180) break;
  }

  return { config: cfg, snapshots, finalState: state };
}

// -------------------------------------------------------
// シナリオ実行
// -------------------------------------------------------
export function runScenario(scenarioId, onProgress = null) {
  const scenario = SCENARIOS[scenarioId];
  const results = [];

  if (scenario.variable === null) {
    const result = runSimulation(scenario.fixedOverrides, scenario.duration, onProgress);
    results.push({ label: 'default', ...result });
  } else if (Array.isArray(scenario.variable)) {
    const [v1, v2] = scenario.variable;
    const combos = [];
    for (const val1 of scenario.values[v1])
      for (const val2 of scenario.values[v2])
        combos.push({ [v1]: val1, [v2]: val2 });
    const totalUnits = combos.length * scenario.duration;
    combos.forEach((combo, idx) => {
      const cb = onProgress ? (day, dur, snap) =>
        onProgress(idx * scenario.duration + day, totalUnits, snap) : null;
      const overrides = { ...scenario.fixedOverrides, ...combo };
      const result = runSimulation(overrides, scenario.duration, cb);
      results.push({ label: Object.entries(combo).map(([k, v]) => `${k}=${v}`).join(', '), ...result });
    });
  } else {
    const totalUnits = scenario.values.length * scenario.duration;
    scenario.values.forEach((val, idx) => {
      const overrides = { ...scenario.fixedOverrides, [scenario.variable]: val };
      const cb = onProgress ? (day, dur, snap) =>
        onProgress(idx * scenario.duration + day, totalUnits, snap) : null;
      const result = runSimulation(overrides, scenario.duration, cb);
      results.push({ label: `${scenario.variable}=${val}`, ...result });
    });
  }

  return results;
}
