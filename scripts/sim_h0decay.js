// scripts/sim_h0decay.js
// h0 decay 仮説検証シミュレーション
//
// 比較条件:
//   まとめ消化（6分間隔で5セッション） × h0固定 / h0減衰
//   分散消化（2.5時間間隔で5セッション）× h0固定 / h0減衰
//
// 実行: node --input-type=module < scripts/sim_h0decay.js
//       または: node scripts/sim_h0decay.js  (package.json "type":"module" のため)

import { createConfig } from '../core/config.js';
import { WordState, LearnerState, Card } from '../core/models.js';
import { SRSEngine } from '../core/srs-engine.js';
import { WaveManager } from '../core/wave-manager.js';
import { FeedGenerator } from '../core/feed-generator.js';
import { WORD_DATA } from '../core/word-data.js';
import { VirtualLearner } from '../sim/virtual-learner.js';

// -------------------------------------------------------
// h0 減衰パラメータ
// -------------------------------------------------------
const H0_DECAY_BASE = 0.98;  // 新語1語追加ごとの減衰率
const H0_MIN = 0.3;          // h0 の下限

function adjustedH0(baseH0, todayNewCount, useDecay) {
  if (!useDecay || todayNewCount === 0) return baseH0;
  return Math.max(H0_MIN, baseH0 * Math.pow(H0_DECAY_BASE, todayNewCount));
}

// -------------------------------------------------------
// セッション内のカード消化ループ
// -------------------------------------------------------
function runSession(cardQueue, engine, cfg, learner, sessionTime, todayNewCount, useH0Decay) {
  const reinsertCount = new Map();
  let newWordsIntroduced = 0;
  let i = 0;

  while (i < cardQueue.length) {
    const card = cardQueue[i];
    const result = learner.respond(card.word, card.cardType, sessionTime);
    card.result = result;
    const stageBeforeProcess = card.word.stage;

    if (card.isRetry && result !== 'wrong') {
      if (card.cardType === 'handwrite') {
        engine.processResponse(card.word, card.cardType, result, sessionTime);
      } else {
        card.word.stage = card.stageBeforeWrong;
      }
    } else {
      if (card.cardType === 'intro' && !card.isRetry && useH0Decay) {
        // h0 を一時的に調整してから processResponse → 元に戻す
        const origH0 = cfg.h0;
        cfg.h0 = adjustedH0(origH0, todayNewCount + newWordsIntroduced, true);
        engine.processResponse(card.word, card.cardType, result, sessionTime);
        cfg.h0 = origH0;
        newWordsIntroduced++;
      } else {
        if (card.cardType === 'intro' && !card.isRetry) newWordsIntroduced++;
        engine.processResponse(card.word, card.cardType, result, sessionTime);
      }
    }

    if (result === 'wrong' && card.cardType !== 'passive') {
      const key = card.word.wordId;
      if ((reinsertCount.get(key) ?? 0) < cfg.maxRetryPerCard) {
        reinsertCount.set(key, (reinsertCount.get(key) ?? 0) + 1);
        const pos = Math.min(i + 1 + cfg.retryGap, cardQueue.length);
        const retryCard = new Card(card.word, card.cardType);
        retryCard.isRetry = true;
        retryCard.stageBeforeWrong = card.isRetry ? card.stageBeforeWrong : stageBeforeProcess;
        cardQueue.splice(pos, 0, retryCard);
      }
    }
    i++;
  }

  return newWordsIntroduced;
}

// -------------------------------------------------------
// meaningful カード数（passive / filler 以外）
// -------------------------------------------------------
function countMeaningful(cards) {
  return cards.filter(c => c.cardType !== 'passive').length;
}

// -------------------------------------------------------
// メインシミュレーション
// -------------------------------------------------------
function simulate({ pattern, useH0Decay, durationDays = 14, seed = 42 }) {
  const cfg = createConfig();
  const words = WORD_DATA.map(d => new WordState(d.id, d.word, Math.ceil(d.id / cfg.waveSize)));
  const state = new LearnerState(words, cfg);
  const engine = new SRSEngine(cfg);
  const wm = new WaveManager(cfg, state);
  const fg = new FeedGenerator(cfg, engine, wm);
  const learner = new VirtualLearner({ learnerAbility: 1.0 });

  // セッション開始時刻（1日あたり5セッション）
  const SESSION_OFFSETS =
    pattern === 'まとめ'
      ? [0, 4/1440, 8/1440, 12/1440, 16/1440]   // 4分間隔（ほぼ同時）
      : [0, 2.5/24, 5/24, 7.5/24, 10/24];        // 2.5時間間隔

  const dailyLog = [];
  let totalNoWork = 0;
  let totalSessions = 0;

  for (let day = 0; day < durationDays; day++) {
    let todayNewCount = 0; // その日に導入した新語数（h0 decay の基準）
    const dayLog = {
      day: day + 1,
      sessions: [],
      noWork: 0,
    };

    for (const offset of SESSION_OFFSETS) {
      const sessionTime = day + offset;
      const cardQueue = fg.generateSession(state, sessionTime);

      totalSessions++;

      if (cardQueue.length === 0) {
        totalNoWork++;
        dayLog.noWork++;
        dayLog.sessions.push({ noWork: true, meaningful: 0, total: 0 });
        continue;
      }

      const meaningful = countMeaningful(cardQueue);
      const total = cardQueue.length;
      const newIntroduced = runSession(cardQueue, engine, cfg, learner, sessionTime, todayNewCount, useH0Decay);
      todayNewCount += newIntroduced;

      dayLog.sessions.push({ noWork: false, meaningful, total });
    }

    state.currentTime = day + 1;
    dailyLog.push(dayLog);
  }

  const learnedCount = state.words.filter(w => w.stage !== 'new').length;
  const masteredCount = state.words.filter(w => w.h >= cfg.masteredThresholdH).length;

  return {
    pattern,
    useH0Decay,
    totalNoWork,
    totalSessions,
    noWorkRate: totalNoWork / totalSessions,
    learnedCount,
    masteredCount,
    dailyLog,
  };
}

// -------------------------------------------------------
// 複数回実行して平均（乱数による揺れを抑える）
// -------------------------------------------------------
function runMultiple(params, runs = 5) {
  const results = Array.from({ length: runs }, (_, i) => simulate({ ...params, seed: i }));

  // 平均値を計算
  const avg = (fn) => results.reduce((s, r) => s + fn(r), 0) / runs;
  const sample = results[0]; // 日別ログは最初の1回分を代表として使用

  return {
    pattern: params.pattern,
    useH0Decay: params.useH0Decay,
    totalNoWork: avg(r => r.totalNoWork).toFixed(1),
    totalSessions: sample.totalSessions,
    noWorkRate: avg(r => r.noWorkRate),
    learnedCount: avg(r => r.learnedCount).toFixed(1),
    masteredCount: avg(r => r.masteredCount).toFixed(1),
    dailyLog: sample.dailyLog,
  };
}

// -------------------------------------------------------
// 出力
// -------------------------------------------------------
const RUNS = 5;

console.log('='.repeat(60));
console.log('h0 decay シミュレーション（14日間、5セッション/日）');
console.log(`各条件 ${RUNS} 回実行の平均`);
console.log('='.repeat(60));

const conditions = [
  { pattern: 'まとめ', useH0Decay: false },
  { pattern: 'まとめ', useH0Decay: true },
  { pattern: '分散',   useH0Decay: false },
  { pattern: '分散',   useH0Decay: true },
];

const allResults = conditions.map(p => runMultiple(p, RUNS));

// サマリーテーブル
console.log('\n■ サマリー（14日間）\n');
console.log('条件                  | 復習なし回数 | 復習なし率 | Day14学習済み');
console.log('----------------------|------------|-----------|-------------');
for (const r of allResults) {
  const label = `${r.pattern}×h0${r.useH0Decay ? '減衰' : '固定'}`;
  console.log(
    `${label.padEnd(22)}| ${String(r.totalNoWork).padStart(10)} | ${(r.noWorkRate * 100).toFixed(1).padStart(8)}% | ${String(r.learnedCount).padStart(9)}語`
  );
}

// 日別サマリー（まとめ消化の2条件を並べて比較）
const matome_fixed  = allResults.find(r => r.pattern === 'まとめ' && !r.useH0Decay);
const matome_decay  = allResults.find(r => r.pattern === 'まとめ' && r.useH0Decay);
const bunsan_fixed  = allResults.find(r => r.pattern === '分散'   && !r.useH0Decay);
const bunsan_decay  = allResults.find(r => r.pattern === '分散'   && r.useH0Decay);

console.log('\n■ 日別「復習なし」発生数 と 有効セッションの平均meaningful枚数\n');
console.log('     まとめ×固定          まとめ×減衰          分散×固定            分散×減衰');
console.log('Day  復習なし avg意味   復習なし avg意味   復習なし avg意味   復習なし avg意味');
console.log('-'.repeat(90));

for (let d = 0; d < 14; d++) {
  const row = [matome_fixed, matome_decay, bunsan_fixed, bunsan_decay].map(res => {
    const dl = res.dailyLog[d];
    const worked = dl.sessions.filter(s => !s.noWork);
    const avgMean = worked.length > 0
      ? (worked.reduce((s, x) => s + x.meaningful, 0) / worked.length).toFixed(1)
      : '-  ';
    return `${String(dl.noWork).padStart(2)}/5    ${String(avgMean).padStart(4)}`;
  });
  console.log(`${String(d + 1).padStart(3)}  ${row.join('   ')}`);
}

// h0 decay の効果を可視化：まとめ消化での同日導入語の h0 分布
console.log('\n■ h0 decay の効果: 同日に導入された語の初期 h0 値');
console.log('（h0DecayBase=0.98, h0Min=0.3, baseH0=1.0）\n');
console.log('N語目  h0固定  h0減衰');
console.log('-------|-------|------');
for (const n of [0, 5, 10, 15, 20, 25, 30]) {
  const decayed = Math.max(H0_MIN, 1.0 * Math.pow(H0_DECAY_BASE, n));
  console.log(`${String(n).padStart(6)}語目  1.000   ${decayed.toFixed(3)}`);
}

console.log('\n完了。');
