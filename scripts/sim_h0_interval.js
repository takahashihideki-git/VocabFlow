// scripts/sim_h0_interval.js
// h0 をセッション間隔から逆算する設計の検証
//
// コア仮説:
//   h0 = min(baseH0, sessionInterval / retentionFactor)
//   → 4分後セッションなら h0=0.012日、2.5h後なら h0=0.444日
//   → 「まとめ消化は足踏み（h が育たない）」が SRS の数理から自然に出る

import { createConfig } from '../core/config.js';
import { WordState, LearnerState, Card } from '../core/models.js';
import { SRSEngine } from '../core/srs-engine.js';
import { WaveManager } from '../core/wave-manager.js';
import { FeedGenerator } from '../core/feed-generator.js';
import { WORD_DATA } from '../core/word-data.js';
import { VirtualLearner } from '../sim/virtual-learner.js';

const RETENTION_FACTOR = Math.log2(1 / 0.85); // ≈ 0.2344

// -------------------------------------------------------
// セッション間隔から h0 を逆算
// -------------------------------------------------------
function calcH0FromInterval(baseH0, sessionInterval) {
  if (sessionInterval <= 0) return baseH0;
  // 「この単語が次のセッション時刻に due になる」ような h0
  // h0 × retentionFactor = sessionInterval → h0 = sessionInterval / retentionFactor
  return Math.min(baseH0, sessionInterval / RETENTION_FACTOR);
}

// -------------------------------------------------------
// セッション実行
// -------------------------------------------------------
function runSession(cardQueue, engine, cfg, learner, sessionTime, h0ForNewWords) {
  const reinsertCount = new Map();
  let i = 0;
  while (i < cardQueue.length) {
    const card = cardQueue[i];
    const result = learner.respond(card.word, card.cardType, sessionTime);
    const stageBeforeProcess = card.word.stage;

    if (card.isRetry && result !== 'wrong') {
      if (card.cardType === 'handwrite') engine.processResponse(card.word, card.cardType, result, sessionTime);
      else card.word.stage = card.stageBeforeWrong;
    } else if (card.cardType === 'intro' && !card.isRetry && h0ForNewWords !== null) {
      const origH0 = cfg.h0;
      cfg.h0 = h0ForNewWords;
      engine.processResponse(card.word, card.cardType, result, sessionTime);
      cfg.h0 = origH0;
    } else {
      engine.processResponse(card.word, card.cardType, result, sessionTime);
    }

    if (result === 'wrong' && card.cardType !== 'passive') {
      const key = card.word.wordId;
      if ((reinsertCount.get(key) ?? 0) < cfg.maxRetryPerCard) {
        reinsertCount.set(key, (reinsertCount.get(key) ?? 0) + 1);
        const retryCard = new Card(card.word, card.cardType);
        retryCard.isRetry = true;
        retryCard.stageBeforeWrong = card.isRetry ? card.stageBeforeWrong : stageBeforeProcess;
        cardQueue.splice(Math.min(i + 1 + cfg.retryGap, cardQueue.length), 0, retryCard);
      }
    }
    i++;
  }
}

// -------------------------------------------------------
// シミュレーション本体
// -------------------------------------------------------
function simulate({ pattern, useIntervalH0, durationDays = 21, runs = 8 }) {
  const SESSION_OFFSETS =
    pattern === 'まとめ'
      ? [0, 4/1440, 8/1440, 12/1440, 16/1440]
      : [0, 2.5/24, 5/24, 7.5/24, 10/24];

  let sumFirstNoWork = 0;
  let sumNoWorkCount = 0;
  let sumLearned = 0;
  let sumMastered = 0;

  // h の成長を追跡するためのサンプル
  let sumAvgHAtDay7 = 0;
  let sumAvgHAtDay14 = 0;
  let sumAvgHAtDay21 = 0;

  for (let run = 0; run < runs; run++) {
    const cfg = createConfig();
    const words = WORD_DATA.map(d => new WordState(d.id, d.word, Math.ceil(d.id / cfg.waveSize)));
    const state = new LearnerState(words, cfg);
    const engine = new SRSEngine(cfg);
    const wm = new WaveManager(cfg, state);
    const fg = new FeedGenerator(cfg, engine, wm);
    const learner = new VirtualLearner({ learnerAbility: 1.0 });

    let firstNoWorkDay = null;
    let noWorkCount = 0;
    let prevSessionTime = null;

    for (let day = 0; day < durationDays; day++) {
      for (let si = 0; si < SESSION_OFFSETS.length; si++) {
        const sessionTime = day + SESSION_OFFSETS[si];

        // h0 逆算（前セッションとの間隔から）
        let h0ForNewWords = null; // null = baseH0 をそのまま使用
        if (useIntervalH0 && prevSessionTime !== null) {
          const interval = sessionTime - prevSessionTime;
          h0ForNewWords = calcH0FromInterval(cfg.h0, interval);
        }

        const cardQueue = fg.generateSession(state, sessionTime);

        if (cardQueue.length === 0) {
          noWorkCount++;
          if (firstNoWorkDay === null) firstNoWorkDay = day + 1;
        } else {
          runSession(cardQueue, engine, cfg, learner, sessionTime, h0ForNewWords);
          prevSessionTime = sessionTime;
        }
      }
      state.currentTime = day + 1;

      // h 分布を記録
      const activeWords = state.words.filter(w => w.h > 0);
      if (activeWords.length > 0) {
        const avgH = activeWords.reduce((s, w) => s + w.h, 0) / activeWords.length;
        if (day === 6) sumAvgHAtDay7 += avgH;
        if (day === 13) sumAvgHAtDay14 += avgH;
        if (day === 20) sumAvgHAtDay21 += avgH;
      }
    }

    sumFirstNoWork += firstNoWorkDay ?? (durationDays + 1);
    sumNoWorkCount += noWorkCount;
    sumLearned += state.words.filter(w => w.stage !== 'new').length;
    sumMastered += state.words.filter(w => w.h >= cfg.masteredThresholdH).length;
  }

  return {
    pattern,
    useIntervalH0,
    avgFirstNoWork: sumFirstNoWork / runs,
    avgNoWorkCount: sumNoWorkCount / runs,
    avgLearned: sumLearned / runs,
    avgMastered: sumMastered / runs,
    avgHDay7: sumAvgHAtDay7 / runs,
    avgHDay14: sumAvgHAtDay14 / runs,
    avgHDay21: sumAvgHAtDay21 / runs,
  };
}

// -------------------------------------------------------
// 理論値を先に表示
// -------------------------------------------------------
console.log('■ セッション間隔 → h0 逆算値 → due 間隔（= 次セッション時刻）');
console.log('h0 = sessionInterval / retentionFactor\n');
console.log('セッション間隔   h0逆算値    due間隔（確認）  peakH≥2.0まで必要な正解数');
for (const [label, interval_h] of [
  ['4分',    4/60],
  ['30分',   0.5],
  ['1時間',  1.0],
  ['2.5時間', 2.5],
  ['6時間',  6.0],
  ['12時間', 12.0],
  ['24時間', 24.0],
]) {
  const interval_d = interval_h / 24;
  const h0 = Math.min(1.0, interval_d / RETENTION_FACTOR);
  const dueH = h0 * RETENTION_FACTOR * 24;
  // peakH≥2.0 に必要な正解数（recognition×recallの連鎖）
  let h = h0;
  let steps = 0;
  const weights = [0.8, 1.0, 1.3]; // recognition, recall, dictation
  for (let wi = 0; wi < weights.length && h < 2.0; wi++) {
    h = Math.min(h * 2.0 * weights[wi], 365);
    steps++;
  }
  const unlockStr = h >= 2.0 ? `${steps}回` : `>${steps}回以上`;
  console.log(`${label.padEnd(8)}: h0=${h0.toFixed(4)}  due=${dueH.toFixed(1)}h  unlock=${unlockStr}`);
}

// -------------------------------------------------------
// シミュレーション結果
// -------------------------------------------------------
const RUNS = 10;

console.log(`\n${'='.repeat(70)}`);
console.log(`比較シミュレーション（21日間、5セッション/日、${RUNS}回平均）`);
console.log('='.repeat(70));

const conditions = [
  { pattern: 'まとめ', useIntervalH0: false },
  { pattern: 'まとめ', useIntervalH0: true  },
  { pattern: '分散',   useIntervalH0: false },
  { pattern: '分散',   useIntervalH0: true  },
];

const results = conditions.map(c => simulate({ ...c, durationDays: 21, runs: RUNS }));

console.log('\n条件              | 初回復習なし  | 総計   | 学習済み | avgH Day7 | Day14 | Day21');
console.log('-'.repeat(80));
for (const r of results) {
  const label = `${r.pattern}×h0${r.useIntervalH0 ? '間隔逆算' : '固定(1.0)'}`;
  const firstStr = r.avgFirstNoWork > 21 ? 'なし' : `Day${r.avgFirstNoWork.toFixed(1)}`;
  console.log(
    `${label.padEnd(18)}| ${firstStr.padEnd(13)}| ${r.avgNoWorkCount.toFixed(1).padStart(4)}回 ` +
    `| ${r.avgLearned.toFixed(0).padStart(5)}語   ` +
    `| ${r.avgHDay7.toFixed(2).padStart(8)} | ${r.avgHDay14.toFixed(2).padStart(5)} | ${r.avgHDay21.toFixed(2)}`
  );
}

// -------------------------------------------------------
// まとめ消化の「h の成長曲線」詳細（1回分のデバッグログ）
// -------------------------------------------------------
console.log('\n■ まとめ消化: h0固定 vs h0間隔逆算 — 1語目の h 成長追跡');
console.log('（Wave 1・1語目が各セッションでどう h を積み上げるか）\n');

for (const useIntervalH0 of [false, true]) {
  const cfg = createConfig();
  const words = WORD_DATA.map(d => new WordState(d.id, d.word, Math.ceil(d.id / cfg.waveSize)));
  const state = new LearnerState(words, cfg);
  const engine = new SRSEngine(cfg);
  const wm = new WaveManager(cfg, state);
  const fg = new FeedGenerator(cfg, engine, wm);
  const learner = new VirtualLearner({ learnerAbility: 1.0 });

  const SESSION_OFFSETS = [0, 4/1440, 8/1440, 12/1440, 16/1440];
  const word1 = state.words[0]; // 1語目を追跡
  let prevSessionTime = null;

  console.log(`--- h0${useIntervalH0 ? '間隔逆算' : '固定(1.0)'} ---`);
  console.log('時刻      | 操作           | h0設定  | h値    | stage      | due間隔');

  for (let day = 0; day < 5; day++) {
    for (let si = 0; si < SESSION_OFFSETS.length; si++) {
      const sessionTime = day + SESSION_OFFSETS[si];
      let h0ForNewWords = null;
      if (useIntervalH0 && prevSessionTime !== null) {
        const interval = sessionTime - prevSessionTime;
        h0ForNewWords = calcH0FromInterval(cfg.h0, interval);
      }

      const cardQueue = fg.generateSession(state, sessionTime);
      if (cardQueue.length === 0) {
        const timeStr = `Day${day+1}-S${si+1}`;
        console.log(`${timeStr.padEnd(10)}| 復習なし       | -       | ${word1.h.toFixed(4).padStart(6)} | ${word1.stage.padEnd(10)} | -`);
        continue;
      }

      // word1 が登場するか確認
      const word1Card = cardQueue.find(c => c.word.wordId === word1.wordId && !c.isRetry);
      const timeStr = `Day${day+1}-S${si+1}`;

      if (word1Card) {
        const hBefore = word1.h;
        const stageBefore = word1.stage;
        const result = learner.respond(word1, word1Card.cardType, sessionTime);
        if (word1Card.cardType === 'intro' && h0ForNewWords !== null) {
          const origH0 = cfg.h0;
          cfg.h0 = h0ForNewWords;
          engine.processResponse(word1, word1Card.cardType, result, sessionTime);
          cfg.h0 = origH0;
        } else {
          engine.processResponse(word1, word1Card.cardType, result, sessionTime);
        }
        const dueInterval = word1.h > 0 ? (word1.h * RETENTION_FACTOR * 24).toFixed(1) + 'h' : '-';
        const h0Str = (word1Card.cardType === 'intro' && h0ForNewWords !== null) ? h0ForNewWords.toFixed(4) : cfg.h0.toFixed(4);
        console.log(`${timeStr.padEnd(10)}| ${word1Card.cardType.padEnd(14)} | ${h0Str.padStart(7)} | ${word1.h.toFixed(4).padStart(6)} | ${word1.stage.padEnd(10)} | ${dueInterval}`);

        // 残りのカードも処理（状態を進めるため）
        for (const card of cardQueue) {
          if (card.word.wordId !== word1.wordId) {
            const r = learner.respond(card.word, card.cardType, sessionTime);
            if (card.cardType === 'intro' && !card.isRetry && h0ForNewWords !== null) {
              const origH0 = cfg.h0; cfg.h0 = h0ForNewWords;
              engine.processResponse(card.word, card.cardType, r, sessionTime);
              cfg.h0 = origH0;
            } else {
              engine.processResponse(card.word, card.cardType, r, sessionTime);
            }
          }
        }
      } else {
        console.log(`${timeStr.padEnd(10)}| (word1不在)    | -       | ${word1.h.toFixed(4).padStart(6)} | ${word1.stage.padEnd(10)} | -`);
        for (const card of cardQueue) {
          const r = learner.respond(card.word, card.cardType, sessionTime);
          if (card.cardType === 'intro' && !card.isRetry && h0ForNewWords !== null) {
            const origH0 = cfg.h0; cfg.h0 = h0ForNewWords;
            engine.processResponse(card.word, card.cardType, r, sessionTime);
            cfg.h0 = origH0;
          } else {
            engine.processResponse(card.word, card.cardType, r, sessionTime);
          }
        }
      }

      if (cardQueue.length > 0) prevSessionTime = sessionTime;
    }
    state.currentTime = day + 1;
  }
  console.log('');
}
