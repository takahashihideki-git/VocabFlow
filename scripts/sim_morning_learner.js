// scripts/sim_morning_learner.js
// 「毎朝20分・5セッション」学習者に最適なパラメータ探索
//
// パターン: 1日1回、朝に5セッションを4分間隔で実施
// 目標: 毎朝 meaningful カード（urgent+due+new）が100枚程度確保できること
//       = 5セッション × meaningful平均20枚

import { createConfig } from '../core/config.js';
import { WordState, LearnerState, Card } from '../core/models.js';
import { SRSEngine } from '../core/srs-engine.js';
import { WaveManager } from '../core/wave-manager.js';
import { FeedGenerator } from '../core/feed-generator.js';
import { WORD_DATA } from '../core/word-data.js';
import { VirtualLearner } from '../sim/virtual-learner.js';

const RF_DEFAULT = Math.log2(1 / 0.85);

// -------------------------------------------------------
// セッション実行
// -------------------------------------------------------
function runSession(cardQueue, engine, cfg, learner, sessionTime) {
  const reinsertCount = new Map();
  let i = 0;
  while (i < cardQueue.length) {
    const card = cardQueue[i];
    const result = learner.respond(card.word, card.cardType, sessionTime);
    const stageBeforeProcess = card.word.stage;

    if (card.isRetry && result !== 'wrong') {
      if (card.cardType === 'handwrite') engine.processResponse(card.word, card.cardType, result, sessionTime);
      else card.word.stage = card.stageBeforeWrong;
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
// 1回分のシミュレーション
// -------------------------------------------------------
function simulate({ alpha, targetRetention, durationDays = 21, runs = 8 }) {
  // 5セッション、4分間隔（全て朝の20分に集中）
  const SESSION_OFFSETS = [0, 4/1440, 8/1440, 12/1440, 16/1440];

  let sumNoWork = 0;
  let sumMeaningful = 0;       // 有効セッション（復習なし以外）での meaningful 枚数合計
  let sumValidSessions = 0;    // 有効セッション数
  let sumLearned = 0;
  let sumMastered = 0;
  let sumWave2UnlockDay = 0;
  let sumAvgH14 = 0;
  // 日別 meaningful 枚数（波形を見るため）
  const dailyMeaningfulSum = new Array(durationDays).fill(0);

  for (let run = 0; run < runs; run++) {
    const cfg = createConfig({ alpha, targetRetention });
    const words = WORD_DATA.map(d => new WordState(d.id, d.word, Math.ceil(d.id / cfg.waveSize)));
    const state = new LearnerState(words, cfg);
    const engine = new SRSEngine(cfg);
    const wm = new WaveManager(cfg, state);
    const fg = new FeedGenerator(cfg, engine, wm);
    const learner = new VirtualLearner({ learnerAbility: 1.0 });

    let wave2UnlockDay = null;

    for (let day = 0; day < durationDays; day++) {
      let dayMeaningful = 0;

      for (const offset of SESSION_OFFSETS) {
        const sessionTime = day + offset;
        const cardQueue = fg.generateSession(state, sessionTime);

        if (cardQueue.length === 0) {
          sumNoWork++;
        } else {
          const m = cardQueue.filter(c => c.cardType !== 'passive').length;
          sumMeaningful += m;
          dayMeaningful += m;
          sumValidSessions++;
          runSession(cardQueue, engine, cfg, learner, sessionTime);
        }
      }

      state.currentTime = day + 1;
      dailyMeaningfulSum[day] += dayMeaningful;

      if (wave2UnlockDay === null && state.activeWaves.length >= 2) {
        wave2UnlockDay = day + 1;
      }

      if (day === 13) {
        const aw = state.words.filter(w => w.h > 0);
        if (aw.length > 0) sumAvgH14 += aw.reduce((s, w) => s + w.h, 0) / aw.length;
      }
    }

    sumLearned += state.words.filter(w => w.stage !== 'new').length;
    sumMastered += state.words.filter(w => w.h >= cfg.masteredThresholdH).length;
    sumWave2UnlockDay += wave2UnlockDay ?? (durationDays + 1);
  }

  return {
    alpha,
    targetRetention,
    avgNoWork: sumNoWork / runs,
    avgMeaningfulPerSession: sumValidSessions > 0 ? sumMeaningful / sumValidSessions : 0,
    avgDailyMeaningful: dailyMeaningfulSum.map(v => v / runs),
    avgLearned: sumLearned / runs,
    avgMastered: sumMastered / runs,
    avgWave2Day: sumWave2UnlockDay / runs,
    avgHDay14: sumAvgH14 / runs,
  };
}

// -------------------------------------------------------
// まず理論値：24時間後に due になる h の閾値を alpha 別に計算
// -------------------------------------------------------
console.log('■ 理論分析: 24時間後（翌朝）にちょうど due になる h の上限\n');
console.log('h × retentionFactor × 24 = 24 → h = 1/retentionFactor が due境界\n');

for (const ret of [0.75, 0.80, 0.85]) {
  const rf = Math.log2(1 / ret);
  const maxH = 1.0 / rf; // due になる最大 h（日）
  console.log(`targetRetention=${ret}: 翌朝 due の上限 h = ${maxH.toFixed(2)}日`);
  console.log(`  alpha別: 何回正解で h がこの上限を超えるか（recognition→recall→dictation）`);
  for (const alpha of [1.3, 1.5, 1.6, 1.75, 1.8, 2.0]) {
    let h = 1.0;
    let reviews = 0;
    const weights = [0.8, 1.0, 1.0, 1.0, 1.3]; // recognition, recall×3, dictation
    const stages  = ['recognition', 'recall', 'recall', 'recall', 'dictation'];
    const history = ['h0=1.0'];
    for (let i = 0; i < weights.length; i++) {
      h = Math.min(h * alpha * weights[i], 365);
      reviews++;
      history.push(`${h.toFixed(2)}`);
      if (h > maxH) break;
    }
    const chain = history.join('→');
    console.log(`    alpha=${alpha}: ${reviews}回で h=${h.toFixed(2)} (> ${maxH.toFixed(2)}で翌朝miss)  [${chain}]`);
  }
  console.log('');
}

// -------------------------------------------------------
// パラメータスキャン
// -------------------------------------------------------
const RUNS = 8;
const DAYS = 21;

const alphas = [1.3, 1.5, 1.6, 1.75, 1.8, 2.0];
const retentions = [0.75, 0.80, 0.85];

const allResults = [];
for (const alpha of alphas) {
  for (const ret of retentions) {
    allResults.push(simulate({ alpha, targetRetention: ret, durationDays: DAYS, runs: RUNS }));
  }
}

console.log(`${'='.repeat(90)}`);
console.log(`毎朝5セッション学習者 パラメータスキャン（${DAYS}日間、${RUNS}回平均）`);
console.log('='.repeat(90));
console.log('alpha  ret   復習なし   avg meaningful/SS  Wave2解放  Day14学習済み  avgH Day14');
console.log('-'.repeat(90));

for (const r of allResults) {
  const noWorkStr = r.avgNoWork.toFixed(1).padStart(5);
  const mStr = r.avgMeaningfulPerSession.toFixed(1).padStart(17);
  const w2Str = r.avgWave2Day > DAYS ? `なし` : `Day${r.avgWave2Day.toFixed(1)}`;
  console.log(
    `${r.alpha.toFixed(2).padStart(5)}  ${r.targetRetention}  ${noWorkStr}回  ${mStr}枚  ` +
    `${w2Str.padEnd(10)} ${r.avgLearned.toFixed(0).padStart(11)}語  ${r.avgHDay14.toFixed(2)}`
  );
}

// -------------------------------------------------------
// 最良候補の日別 meaningful 推移
// -------------------------------------------------------
// スコア: 復習なし最小 + meaningful最大 + Wave2早い で総合評価
const scored = allResults.map(r => ({
  r,
  score: -r.avgNoWork * 3
        + r.avgMeaningfulPerSession * 1
        - Math.max(0, r.avgWave2Day - 7) * 0.5  // Wave2が7日超で減点
        + r.avgLearned * 0.01,
})).sort((a, b) => b.score - a.score);

console.log('\n■ 総合スコア上位5候補（復習なし少・meaningful多・Wave2早い）\n');
console.log('順位  alpha  ret   復習なし  avg meaningful  Wave2     学習済み');
for (let i = 0; i < Math.min(5, scored.length); i++) {
  const r = scored[i].r;
  const w2 = r.avgWave2Day > DAYS ? 'なし' : `Day${r.avgWave2Day.toFixed(1)}`;
  console.log(
    `  ${i+1}   ${r.alpha.toFixed(2)}   ${r.targetRetention}   ${r.avgNoWork.toFixed(1).padStart(5)}回   ` +
    `${r.avgMeaningfulPerSession.toFixed(1).padStart(13)}枚  ${w2.padEnd(10)}  ${r.avgLearned.toFixed(0)}語`
  );
}

// ベスト候補の日別推移を表示
const best = scored[0].r;
console.log(`\n■ ベスト候補（alpha=${best.alpha}, targetRetention=${best.targetRetention}）の日別 meaningful 枚数推移\n`);
console.log('Day  5セッション合計meaningful  (目標: 100枚)');
console.log('-'.repeat(50));
for (let d = 0; d < DAYS; d++) {
  const m = best.avgDailyMeaningful[d];
  const bar = '█'.repeat(Math.round(m / 5));
  console.log(`${String(d + 1).padStart(3)}  ${m.toFixed(0).padStart(4)}枚  ${bar}`);
}

// 現行デフォルト（alpha=2.0, ret=0.85）との比較
const baseline = allResults.find(r => r.alpha === 2.0 && r.targetRetention === 0.85);
console.log(`\n■ ベスト vs 現行デフォルト（alpha=2.0, ret=0.85）比較\n`);
console.log(`項目                  ベスト候補         現行デフォルト`);
console.log(`alpha                 ${best.alpha}              2.0`);
console.log(`targetRetention       ${best.targetRetention}             0.85`);
console.log(`復習なし              ${best.avgNoWork.toFixed(1)}回              ${baseline.avgNoWork.toFixed(1)}回`);
console.log(`avg meaningful/SS     ${best.avgMeaningfulPerSession.toFixed(1)}枚             ${baseline.avgMeaningfulPerSession.toFixed(1)}枚`);
console.log(`Wave2解放             Day${best.avgWave2Day.toFixed(1)}          Day${baseline.avgWave2Day.toFixed(1)}`);
console.log(`Day21学習済み         ${best.avgLearned.toFixed(0)}語            ${baseline.avgLearned.toFixed(0)}語`);
console.log(`avgH Day14            ${best.avgHDay14.toFixed(2)}             ${baseline.avgHDay14.toFixed(2)}`);
