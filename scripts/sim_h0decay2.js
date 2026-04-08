// scripts/sim_h0decay2.js
// h0DecayBase を変えて「初回 復習なし」の遅延効果を計測する

import { createConfig } from '../core/config.js';
import { WordState, LearnerState, Card } from '../core/models.js';
import { SRSEngine } from '../core/srs-engine.js';
import { WaveManager } from '../core/wave-manager.js';
import { FeedGenerator } from '../core/feed-generator.js';
import { WORD_DATA } from '../core/word-data.js';
import { VirtualLearner } from '../sim/virtual-learner.js';

const H0_MIN = 0.3;

function adjustedH0(baseH0, todayNewCount, decayBase) {
  if (decayBase >= 1.0 || todayNewCount === 0) return baseH0;
  return Math.max(H0_MIN, baseH0 * Math.pow(decayBase, todayNewCount));
}

function runSession(cardQueue, engine, cfg, learner, sessionTime, todayNewCount, decayBase) {
  const reinsertCount = new Map();
  let newWordsIntroduced = 0;
  let i = 0;
  while (i < cardQueue.length) {
    const card = cardQueue[i];
    const result = learner.respond(card.word, card.cardType, sessionTime);
    const stageBeforeProcess = card.word.stage;

    if (card.isRetry && result !== 'wrong') {
      if (card.cardType === 'handwrite') engine.processResponse(card.word, card.cardType, result, sessionTime);
      else card.word.stage = card.stageBeforeWrong;
    } else if (card.cardType === 'intro' && !card.isRetry && decayBase < 1.0) {
      const origH0 = cfg.h0;
      cfg.h0 = adjustedH0(origH0, todayNewCount + newWordsIntroduced, decayBase);
      engine.processResponse(card.word, card.cardType, result, sessionTime);
      cfg.h0 = origH0;
      newWordsIntroduced++;
    } else {
      if (card.cardType === 'intro' && !card.isRetry) newWordsIntroduced++;
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
  return newWordsIntroduced;
}

function simulate(pattern, decayBase, durationDays = 21, runs = 8) {
  const SESSION_OFFSETS =
    pattern === 'まとめ'
      ? [0, 4/1440, 8/1440, 12/1440, 16/1440]
      : [0, 2.5/24, 5/24, 7.5/24, 10/24];

  // 複数回実行して平均を取る
  let totalFirstNoWork = 0;
  let totalNoWorkCount = 0;
  let totalLearnedCount = 0;
  let firstNoWorkDayByRun = [];

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

    for (let day = 0; day < durationDays; day++) {
      let todayNewCount = 0;

      for (const offset of SESSION_OFFSETS) {
        const sessionTime = day + offset;
        const cardQueue = fg.generateSession(state, sessionTime);

        if (cardQueue.length === 0) {
          noWorkCount++;
          if (firstNoWorkDay === null) firstNoWorkDay = day + 1;
        } else {
          const n = runSession(cardQueue, engine, cfg, learner, sessionTime, todayNewCount, decayBase);
          todayNewCount += n;
        }
      }
      state.currentTime = day + 1;
    }

    const learnedCount = state.words.filter(w => w.stage !== 'new').length;
    totalFirstNoWork += firstNoWorkDay ?? (durationDays + 1);
    totalNoWorkCount += noWorkCount;
    totalLearnedCount += learnedCount;
    firstNoWorkDayByRun.push(firstNoWorkDay ?? (durationDays + 1));
  }

  return {
    pattern,
    decayBase,
    avgFirstNoWork: totalFirstNoWork / runs,
    avgNoWorkCount: totalNoWorkCount / runs,
    avgLearned: totalLearnedCount / runs,
    firstNoWorkDays: firstNoWorkDayByRun,
  };
}

// h0減衰後の due 間隔を理論計算して表示
console.log('■ h0DecayBase別: 25語目の h0 値と、intro直後の due 間隔');
console.log('（retentionFactor = log2(1/0.85) ≈ 0.234）\n');
console.log('DecayBase  25語目h0   intro後interval  recog後interval');
const rf = Math.log2(1/0.85);
for (const db of [1.00, 0.99, 0.98, 0.95, 0.90, 0.85, 0.80]) {
  const h0_25 = Math.max(H0_MIN, 1.0 * Math.pow(db, 25));
  const introInterval_h = h0_25 * rf;
  const recogH = Math.min(Math.max(h0_25 * 2.0 * 0.8, 0.5), 365);
  const recogInterval_h = recogH * rf;
  console.log(
    `  ${db.toFixed(2)}       ${h0_25.toFixed(3)}      ${(introInterval_h * 24).toFixed(1)}h               ${(recogInterval_h * 24).toFixed(1)}h`
  );
}

console.log('\n■ まとめ消化（4分間隔）: セッション間 = 0.07時間');
console.log('■ 分散消化（2.5h間隔）:  セッション間 = 2.5時間\n');

// 各条件をシミュレーション
const decayBases = [1.00, 0.99, 0.98, 0.95, 0.90, 0.85, 0.80];
const patterns = ['まとめ', '分散'];

for (const pattern of patterns) {
  console.log(`\n${'='.repeat(65)}`);
  console.log(`${pattern}消化 × DecayBase 比較（21日間、5セッション/日、8回平均）`);
  console.log('='.repeat(65));
  console.log('DecayBase  初回復習なし   復習なし総計  Day21学習済み');
  console.log('-'.repeat(55));

  for (const db of decayBases) {
    const r = simulate(pattern, db, 21, 8);
    const firstStr = r.avgFirstNoWork > 21 ? 'なし(21日超)' : `Day ${r.avgFirstNoWork.toFixed(1)}`;
    console.log(
      `  ${db.toFixed(2)}       ${firstStr.padEnd(12)}  ${r.avgNoWorkCount.toFixed(1).padStart(6)}回  ${r.avgLearned.toFixed(0).padStart(8)}語`
    );
  }
}

// 分散消化に絞って、Wave 1 枯渇後も 復習なしが出ない条件を探す
console.log('\n■ 分散消化: due 間隔 vs セッション間隔の比較');
console.log('「介入後 due ≤ 2.5h」を満たす h0 の上限:');
const maxHforDue = 2.5 / 24 / rf;
console.log(`  2.5h以内に due になるための最大 h = ${maxHforDue.toFixed(3)} 日 (= ${(maxHforDue*24).toFixed(1)}h)`);
console.log(`  現行 h0=1.0 の intro 直後 due 間隔: ${(1.0 * rf * 24).toFixed(1)}h`);
console.log(`  → intro後の語が次の2.5h後セッションに due で来るには h0 ≤ ${maxHforDue.toFixed(3)}`);
for (const db of [0.98, 0.95, 0.90, 0.85]) {
  let words_needed = 0;
  for (let n = 0; n <= 50; n++) {
    if (Math.max(H0_MIN, Math.pow(db, n)) <= maxHforDue) { words_needed = n; break; }
  }
  console.log(`  DecayBase=${db}: ${words_needed}語目以降で due ≤ 2.5h`);
}
