// scripts/verify_due_sampling.js
// 提案書 §3/§8 シナリオ E の検証:
// due 判定の effectiveH トンプソンサンプリング有無で「位相同期の分散」を測る。
//
// 朝集中型学習者（5セッション/朝・6分間隔）× 30日。
// 測定:
//   - 復習需要クラスタ: 各セッションで「点推定 h 基準で復習適齢を過ぎた語数」（urgent+due）。
//     ※ off/on どちらの run でも同じ点推定基準で数える中立指標。状態の散らばりだけを比較する。
//   - 復習なし回数: generateSession が [] を返したセッション数
//   - 副作用: 定着語数・avgH
//
//   位相同期が強いほどクラスタは尖り（高 max・高 CV）、谷で復習なしが出る。
//   分散が効けばクラスタは均され（低 CV）、復習なしが減る。
//
// 実行: node scripts/verify_due_sampling.js

import { createConfig } from '../core/config.js';
import { WordState, LearnerState, Card } from '../core/models.js';
import { SRSEngine } from '../core/srs-engine.js';
import { WaveManager } from '../core/wave-manager.js';
import { FeedGenerator } from '../core/feed-generator.js';
import { WORD_DATA } from '../core/word-data.js';
import { VirtualLearner } from '../sim/virtual-learner.js';

const SIX_MIN = 6 / 1440;       // 6分（日）
const SESSIONS_PER_MORNING = 5;
const DAYS = 30;

// 点推定 h 基準で復習適齢を過ぎた非除外・非new・非mastered 語数（中立指標）
function countReviewDemand(state, t, cfg) {
  const rf = Math.log2(1 / cfg.targetRetention);
  let n = 0;
  for (const w of state.words) {
    if (w.excluded || w.skipped) continue;
    if (w.stage === 'new' || w.stage === 'mastered') continue;
    const p = w.pRecall(t);
    if (p < 0.5) { n++; continue; }
    const optimal = w.lastReviewed + (w.h > 0 ? w.h * rf : 0);
    if (t >= optimal) n++;
  }
  return n;
}

function runOnce(dueSampling) {
  const cfg = createConfig({ dueSampling, sessionsPerDay: SESSIONS_PER_MORNING });
  const words = WORD_DATA.map(d => new WordState(d.id, d.word, Math.ceil(d.id / cfg.waveSize)));
  const state = new LearnerState(words, cfg);
  const engine = new SRSEngine(cfg);
  const wm = new WaveManager(cfg, state);
  const fg = new FeedGenerator(cfg, engine, wm);
  const learner = new VirtualLearner({ learnerAbility: 1.0 });

  const demands = [];
  let noWork = 0;

  for (let day = 0; day < DAYS; day++) {
    for (let s = 0; s < SESSIONS_PER_MORNING; s++) {
      const t = day + s * SIX_MIN;       // 朝の6分間隔バースト
      demands.push(countReviewDemand(state, t, cfg));

      const queue = fg.generateSession(state, t);
      if (queue.length === 0) { noWork++; continue; }

      const reinsert = new Map();
      let i = 0;
      while (i < queue.length) {
        const card = queue[i];
        const result = learner.respond(card.word, card.cardType, t);
        card.result = result;
        engine.processResponse(card.word, card.cardType, result, t);
        const isWrong = result === 'wrong' || result === 'near_miss' || result === 'phonetic';
        if (isWrong && card.cardType !== 'passive') {
          const k = card.word.wordId;
          if ((reinsert.get(k) ?? 0) < cfg.maxRetryPerCard) {
            reinsert.set(k, (reinsert.get(k) ?? 0) + 1);
            const pos = Math.min(i + 1 + cfg.retryGap, queue.length);
            const rc = new Card(card.word, fg._assignCardType(card.word, state));
            rc.isRetry = true;
            queue.splice(pos, 0, rc);
          }
        }
        i++;
      }
      state.sessionsCompleted++;
    }
    state.currentTime = day + 1;
  }

  // 統計
  const n = demands.length;
  const mean = demands.reduce((a, b) => a + b, 0) / n;
  const variance = demands.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  const cv = mean > 0 ? std / mean : 0;
  const max = Math.max(...demands);
  const mastered = state.words.filter(w => w.stage === 'mastered').length;
  const learned = state.words.filter(w => w.stage !== 'new').length;
  const active = state.words.filter(w => w.h > 0);
  const avgH = active.length ? active.reduce((a, w) => a + w.h, 0) / active.length : 0;

  return { mean, std, cv, max, noWork, mastered, learned, avgH };
}

function avg(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }

function summarize(label, runs) {
  const m = k => avg(runs.map(r => r[k]));
  console.log(
    `${label}: 需要mean=${m('mean').toFixed(1)} std=${m('std').toFixed(1)} ` +
    `CV=${m('cv').toFixed(3)} max=${m('max').toFixed(0)} ` +
    `復習なし=${m('noWork').toFixed(1)}/${DAYS * SESSIONS_PER_MORNING} | ` +
    `定着=${m('mastered').toFixed(0)} 学=${m('learned').toFixed(0)} avgH=${m('avgH').toFixed(1)}`
  );
}

const REPEATS = 5;
const off = Array.from({ length: REPEATS }, () => runOnce(false));
const on  = Array.from({ length: REPEATS }, () => runOnce(true));

console.log(`朝集中学習者（6分間隔×${SESSIONS_PER_MORNING}/朝）× ${DAYS}日・${REPEATS}回平均`);
console.log('CV・max・復習なしが下がれば位相同期が散った証拠。定着/avgH は副作用チェック。\n');
summarize('サンプリングOFF（点推定・旧挙動）', off);
summarize('サンプリングON （effectiveH）  ', on);
