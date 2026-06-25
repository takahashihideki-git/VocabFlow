// scripts/diag_adaptive_cliff.js
// adaptive-success の exponential×novice 崖を機構レベルで観察する診断。
// 新語導入数・観測成功率・reservedNew・絶対アウトカムを日次で追跡。
//
// 実行: NEW_POLICY=greedy|adaptive ADAPT_SIGNAL=success node scripts/diag_adaptive_cliff.js [days]
//       FLOOR=2 でフロア付き adaptive を試す（adaptiveNewFloor）。

import { createConfig } from '../core/config.js';
import { WordState, LearnerState, Card } from '../core/models.js';
import { SRSEngine } from '../core/srs-engine.js';
import { WaveManager } from '../core/wave-manager.js';
import { FeedGenerator } from '../core/feed-generator.js';
import { WORD_DATA } from '../core/word-data.js';
import { VirtualLearner } from '../sim/virtual-learner.js';

const DAYS = Number(process.argv[2] ?? 90);
const TRUTH = process.env.TRUE_MODEL || 'alpha';
const SPD = Number(process.env.SPD ?? 3);
const BURST = process.env.BURST === '1';
const SIX = 6 / 1440;
const policy = process.env.NEW_POLICY || 'greedy';

const cfg = createConfig({
  memoryCore: 'hlr',
  sessionsPerDay: SPD,
  reserveNewSlots: policy === 'reserve',
  adaptiveNew: policy === 'adaptive',
  adaptiveNewSignal: process.env.ADAPT_SIGNAL || 'success',
  adaptiveNewFloor: Number(process.env.FLOOR ?? 0),
  adaptiveNewSuccLow: Number(process.env.SUCC_LOW ?? 0.6),
  adaptiveNewSuccHigh: Number(process.env.SUCC_HIGH ?? 0.85),
});

const words = WORD_DATA.map(d => new WordState(d.id, d.word, Math.ceil(d.id / cfg.waveSize)));
const state = new LearnerState(words, cfg);
const engine = new SRSEngine(cfg);
const wm = new WaveManager(cfg, state);
const fg = new FeedGenerator(cfg, engine, wm);
const learner = new VirtualLearner({ learnerAbility: 1.0, hVariation: 0.3, srsConfig: cfg, trueModel: TRUTH });

console.log(`policy=${policy} signal=${process.env.ADAPT_SIGNAL || 'success'} floor=${cfg.adaptiveNewFloor} truth=${TRUTH} spd=${SPD} burst=${BURST}`);
console.log('Day | newIntro | success | learned | mastered | avgH | activeWaves');

let totalNew = 0;
for (let day = 0; day < DAYS; day++) {
  let dayNew = 0;
  for (let s = 0; s < SPD; s++) {
    const t = BURST ? day + s * SIX : day + s / SPD;
    const q = fg.generateSession(state, t);
    dayNew += q.filter(c => c.cardType === 'intro').length;
    const re = new Map();
    let i = 0;
    while (i < q.length) {
      const c = q[i], w = c.word;
      const r = learner.respond(w, c.cardType, t);
      c.result = r;
      engine.processResponse(w, c.cardType, r, t);
      const wr = r === 'wrong' || r === 'near_miss' || r === 'phonetic';
      if (wr && c.cardType !== 'passive') {
        const k = w.wordId;
        if ((re.get(k) ?? 0) < cfg.maxRetryPerCard) {
          re.set(k, (re.get(k) ?? 0) + 1);
          const pos = Math.min(i + 1 + cfg.retryGap, q.length);
          const rc = new Card(w, fg._assignCardType(w, state)); rc.isRetry = true; q.splice(pos, 0, rc);
        }
      }
      i++;
    }
    state.sessionsCompleted++;
  }
  state.currentTime = day + 1;
  totalNew += dayNew;
  if (day % 10 === 9 || day < 3) {
    const learned = state.words.filter(w => w.stage !== 'new' && !w.excluded);
    const mastered = state.words.filter(w => w.stage === 'mastered').length;
    const avgH = learned.length ? learned.reduce((a, w) => a + w.h, 0) / learned.length : 0;
    console.log(`${String(day + 1).padStart(3)} | ${String(dayNew).padStart(8)} | ${engine.successRate.toFixed(3)}   | ${String(learned.length).padStart(7)} | ${String(mastered).padStart(8)} | ${avgH.toFixed(1).padStart(5)} | ${JSON.stringify(wm.activeWaves)}`);
  }
}

const tEnd = DAYS;
const learned = state.words.filter(w => w.stage !== 'new' && !w.excluded);
const genuine = learned.reduce((acc, w) => acc + learner.truePRecall(w, tEnd), 0);
const mastered = state.words.filter(w => w.stage === 'mastered').length;
console.log(`\n=== Day${DAYS}: 定着真=${genuine.toFixed(0)} 学習=${learned.length} mastered=${mastered} totalNewIntro=${totalNew}`);
