// scripts/sim_wavesize.js
// 朝集中学習者（4分間隔×5SS）vs 分散学習者（2.5h間隔×5SS）
// waveSize / maxNewPerSession の変化による効果を検証
//
// 前回研究の結論:
//   - alpha/targetRetention の調整は無効（Wave unlock が binding constraint）
//   - waveSize を小さくすることで Wave unlock の遅延を解消できるか？

import { createConfig } from '../core/config.js';
import { WordState, LearnerState, Card } from '../core/models.js';
import { SRSEngine } from '../core/srs-engine.js';
import { WaveManager } from '../core/wave-manager.js';
import { FeedGenerator } from '../core/feed-generator.js';
import { WORD_DATA } from '../core/word-data.js';
import { VirtualLearner } from '../sim/virtual-learner.js';

// -------------------------------------------------------
// セッション実行（sim_morning_learner.js と同じ）
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
// シミュレーション本体
// -------------------------------------------------------
function simulate({ waveSize, maxNewPerSession, sessionOffsets, label, durationDays = 30, runs = 10 }) {
  let sumNoWork = 0;
  let sumMeaningful = 0;
  let sumValidSessions = 0;
  let sumLearned = 0;
  let sumMastered = 0;
  let sumWave2UnlockDay = 0;
  let sumMinDailyMeaningful = 0;  // 各 run での「最も thin な日」= 底の安定性
  const dailyMeaningfulSum = new Array(durationDays).fill(0);

  for (let run = 0; run < runs; run++) {
    const cfg = createConfig({ waveSize, maxNewPerSession });
    const words = WORD_DATA.map(d => new WordState(d.id, d.word, Math.ceil(d.id / cfg.waveSize)));
    const state = new LearnerState(words, cfg);
    const engine = new SRSEngine(cfg);
    const wm = new WaveManager(cfg, state);
    const fg = new FeedGenerator(cfg, engine, wm);
    const learner = new VirtualLearner({ learnerAbility: 1.0 });

    let wave2UnlockDay = null;
    let minDailyMeaningful = Infinity;

    for (let day = 0; day < durationDays; day++) {
      let dayMeaningful = 0;

      for (const offset of sessionOffsets) {
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
      if (dayMeaningful < minDailyMeaningful) minDailyMeaningful = dayMeaningful;

      if (wave2UnlockDay === null && state.activeWaves.length >= 2) {
        wave2UnlockDay = day + 1;
      }
    }

    sumLearned += state.words.filter(w => w.stage !== 'new').length;
    sumMastered += state.words.filter(w => w.h >= cfg.masteredThresholdH).length;
    sumWave2UnlockDay += wave2UnlockDay ?? (durationDays + 1);
    sumMinDailyMeaningful += minDailyMeaningful === Infinity ? 0 : minDailyMeaningful;
  }

  return {
    label,
    waveSize,
    maxNewPerSession,
    avgNoWork: sumNoWork / runs,
    avgMeaningfulPerSession: sumValidSessions > 0 ? sumMeaningful / sumValidSessions : 0,
    avgDailyMeaningful: dailyMeaningfulSum.map(v => v / runs),
    avgLearned: sumLearned / runs,
    avgMastered: sumMastered / runs,
    avgWave2Day: sumWave2UnlockDay / runs,
    avgMinDailyMeaningful: sumMinDailyMeaningful / runs,
  };
}

// -------------------------------------------------------
// セッションオフセット定義
// -------------------------------------------------------
// 朝集中: 4分間隔×5セッション（前回研究と同一）
const MORNING_OFFSETS  = [0, 4/1440, 8/1440, 12/1440, 16/1440];
// 分散:   2.5h間隔×5セッション（前回研究と同一）
const SPREAD_OFFSETS   = [0, 2.5/24, 5/24, 7.5/24, 10/24];

const DAYS = 30;
const RUNS = 10;

// -------------------------------------------------------
// 実験条件（waveSize × maxNewPerSession × 学習パターン）
// -------------------------------------------------------
const conditions = [
  // --- ベースライン ---
  { waveSize: 50, maxNewPerSession: 5,  offsets: MORNING_OFFSETS, tag: '朝集中' },
  { waveSize: 50, maxNewPerSession: 5,  offsets: SPREAD_OFFSETS,  tag: '分散' },
  // --- waveSize 縮小 ---
  { waveSize: 25, maxNewPerSession: 5,  offsets: MORNING_OFFSETS, tag: '朝集中' },
  { waveSize: 25, maxNewPerSession: 5,  offsets: SPREAD_OFFSETS,  tag: '分散' },
  { waveSize: 10, maxNewPerSession: 5,  offsets: MORNING_OFFSETS, tag: '朝集中' },
  { waveSize: 10, maxNewPerSession: 5,  offsets: SPREAD_OFFSETS,  tag: '分散' },
  // --- waveSize 縮小 + maxNew 増加 ---
  { waveSize: 25, maxNewPerSession: 7,  offsets: MORNING_OFFSETS, tag: '朝集中' },
  { waveSize: 25, maxNewPerSession: 7,  offsets: SPREAD_OFFSETS,  tag: '分散' },
  { waveSize: 25, maxNewPerSession: 10, offsets: MORNING_OFFSETS, tag: '朝集中' },
  { waveSize: 25, maxNewPerSession: 10, offsets: SPREAD_OFFSETS,  tag: '分散' },
  // --- waveSize 極小 + maxNew 増加 ---
  { waveSize: 10, maxNewPerSession: 7,  offsets: MORNING_OFFSETS, tag: '朝集中' },
  { waveSize: 10, maxNewPerSession: 7,  offsets: SPREAD_OFFSETS,  tag: '分散' },
];

console.log(`朝集中 vs 分散 × waveSize × maxNewPerSession（${DAYS}日間、${RUNS}回平均）`);
console.log('='.repeat(100));
console.log('waveSize  new  パターン  復習なし   avg meaningful/SS  daily底  Wave2解放  Day30学習済み');
console.log('-'.repeat(100));

const results = [];
for (const c of conditions) {
  const r = simulate({
    waveSize: c.waveSize,
    maxNewPerSession: c.maxNewPerSession,
    sessionOffsets: c.offsets,
    label: c.tag,
    durationDays: DAYS,
    runs: RUNS,
  });
  results.push({ ...r, tag: c.tag });

  const noWorkStr   = r.avgNoWork.toFixed(1).padStart(5);
  const mStr        = r.avgMeaningfulPerSession.toFixed(1).padStart(17);
  const minStr      = r.avgMinDailyMeaningful.toFixed(0).padStart(7);
  const w2          = r.avgWave2Day > DAYS ? '解放なし' : `Day${r.avgWave2Day.toFixed(1)}`;
  const learnedStr  = r.avgLearned.toFixed(0).padStart(12);
  console.log(
    `${String(c.waveSize).padStart(8)}  ${String(c.maxNewPerSession).padStart(3)}  ${c.tag.padEnd(8)}` +
    `  ${noWorkStr}回  ${mStr}枚  ${minStr}枚  ${w2.padEnd(10)} ${learnedStr}語`
  );

  // 朝集中と分散のペア比較用に空行
  if (c.offsets === SPREAD_OFFSETS) console.log('');
}

// -------------------------------------------------------
// 朝集中と分散のギャップを表形式で比較
// -------------------------------------------------------
console.log('\n■ 朝集中と分散の「差」（分散 − 朝集中）= ギャップ縮小効果');
console.log('='.repeat(90));
console.log('waveSize  new  復習なしギャップ  meaningfulギャップ  学習済みギャップ  daily底ギャップ');
console.log('-'.repeat(90));

const pairs = [
  { waveSize: 50, maxNewPerSession: 5  },
  { waveSize: 25, maxNewPerSession: 5  },
  { waveSize: 10, maxNewPerSession: 5  },
  { waveSize: 25, maxNewPerSession: 7  },
  { waveSize: 25, maxNewPerSession: 10 },
  { waveSize: 10, maxNewPerSession: 7  },
];

for (const p of pairs) {
  const morning = results.find(r => r.waveSize === p.waveSize && r.maxNewPerSession === p.maxNewPerSession && r.tag === '朝集中');
  const spread  = results.find(r => r.waveSize === p.waveSize && r.maxNewPerSession === p.maxNewPerSession && r.tag === '分散');
  if (!morning || !spread) continue;

  const noWorkGap   = (morning.avgNoWork - spread.avgNoWork).toFixed(1);   // 朝集中が多い → 正が悪い
  const mGap        = (spread.avgMeaningfulPerSession - morning.avgMeaningfulPerSession).toFixed(1);
  const learnedGap  = (spread.avgLearned - morning.avgLearned).toFixed(0);
  const minGap      = (spread.avgMinDailyMeaningful - morning.avgMinDailyMeaningful).toFixed(0);

  console.log(
    `${String(p.waveSize).padStart(8)}  ${String(p.maxNewPerSession).padStart(3)}` +
    `  +${String(noWorkGap).padStart(5)}回         +${String(mGap).padStart(4)}枚             -${String(learnedGap).padStart(3)}語           +${String(minGap).padStart(3)}枚`
  );
}

// -------------------------------------------------------
// 日別 meaningful 枚数推移（朝集中 waveSize 別）
// -------------------------------------------------------
console.log('\n■ 朝集中学習者の日別 5SS合計 meaningful 枚数推移（waveSize 別）');
console.log(`${'Day'.padStart(4)} ${'sz50,n5'.padStart(8)} ${'sz25,n5'.padStart(8)} ${'sz10,n5'.padStart(8)} ${'sz25,n7'.padStart(8)} ${'sz25,n10'.padStart(9)} ${'sz10,n7'.padStart(8)}`);
console.log('-'.repeat(60));

const morningResults = {
  '50_5':  results.find(r => r.waveSize === 50 && r.maxNewPerSession === 5  && r.tag === '朝集中'),
  '25_5':  results.find(r => r.waveSize === 25 && r.maxNewPerSession === 5  && r.tag === '朝集中'),
  '10_5':  results.find(r => r.waveSize === 10 && r.maxNewPerSession === 5  && r.tag === '朝集中'),
  '25_7':  results.find(r => r.waveSize === 25 && r.maxNewPerSession === 7  && r.tag === '朝集中'),
  '25_10': results.find(r => r.waveSize === 25 && r.maxNewPerSession === 10 && r.tag === '朝集中'),
  '10_7':  results.find(r => r.waveSize === 10 && r.maxNewPerSession === 7  && r.tag === '朝集中'),
};

for (let d = 0; d < DAYS; d++) {
  const vals = Object.values(morningResults).map(r => r ? r.avgDailyMeaningful[d].toFixed(0).padStart(8) : '       ?');
  console.log(`${String(d+1).padStart(4)} ${vals.join(' ')}`);
}
