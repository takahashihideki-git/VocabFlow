// scripts/verify_adaptive_floor_matrix.js
// 残タスク②: exponential×novice の崖を消す「最低導入フロア＋上限 throttle」設計を
// 絶対アウトカム（mastered / genuine / avgH）で真実族 × 学習者層 × ポリシーの総当たり検証。
//
// 製品の「定着」= stage==='mastered'（dictation 通過 + h≥14）。
// genuine = Σ 真の保持率（latent memory・stage 非依存）。両方を併読する（§6.5 の教訓）。
//
// 実行: node scripts/verify_adaptive_floor_matrix.js [days] [N]

import { createConfig } from '../core/config.js';
import { WordState, LearnerState, Card } from '../core/models.js';
import { SRSEngine } from '../core/srs-engine.js';
import { WaveManager } from '../core/wave-manager.js';
import { FeedGenerator } from '../core/feed-generator.js';
import { WORD_DATA } from '../core/word-data.js';
import { VirtualLearner } from '../sim/virtual-learner.js';

const DAYS = Number(process.argv[2] ?? 90);
const N = Number(process.argv[3] ?? 3);
const SIX = 6 / 1440;
const avg = a => a.reduce((x, y) => x + y, 0) / a.length;

function simulate({ truth, policy, floor, spd, burst, ability, hVar }) {
  const cfg = createConfig({
    memoryCore: 'hlr', sessionsPerDay: spd,
    reserveNewSlots: policy === 'reserve',
    adaptiveNew: policy === 'adaptive',
    adaptiveNewSignal: 'success',
    adaptiveNewFloor: floor,
  });
  const words = WORD_DATA.map(d => new WordState(d.id, d.word, Math.ceil(d.id / cfg.waveSize)));
  const state = new LearnerState(words, cfg);
  const engine = new SRSEngine(cfg);
  const wm = new WaveManager(cfg, state);
  const fg = new FeedGenerator(cfg, engine, wm);
  const learner = new VirtualLearner({ learnerAbility: ability, hVariation: hVar, srsConfig: cfg, trueModel: truth });

  for (let day = 0; day < DAYS; day++) {
    for (let s = 0; s < spd; s++) {
      const t = burst ? day + s * SIX : day + s / spd;
      const q = fg.generateSession(state, t);
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
  }

  const tEnd = DAYS;
  const learned = state.words.filter(w => w.stage !== 'new' && !w.excluded);
  const genuine = learned.reduce((acc, w) => acc + learner.truePRecall(w, tEnd), 0);
  const mastered = state.words.filter(w => w.stage === 'mastered').length;
  const avgH = learned.length ? learned.reduce((a, w) => a + w.h, 0) / learned.length : 0;
  return { genuine, learned: learned.length, mastered, avgH };
}

function runAvg(opts) {
  const rs = Array.from({ length: N }, () => simulate(opts));
  return {
    genuine: avg(rs.map(r => r.genuine)),
    learned: avg(rs.map(r => r.learned)),
    mastered: avg(rs.map(r => r.mastered)),
    avgH: avg(rs.map(r => r.avgH)),
  };
}

const TRUTHS = [['指数則', 'alpha'], ['べき則', 'dsr'], ['ACT-R', 'ebisu']];
const LEARNERS = [
  ['novice  ', 1.0, 0.3],
  ['advanced', 1.5, 0.05],
];
const PROFILES = [['標準3/日', 3, false], ['朝集中5', 5, true]];
const POLICIES = [
  ['greedy      ', 'greedy', 0],
  ['adapt        ', 'adaptive', 0],
  ['adapt+floor1 ', 'adaptive', 1],
  ['adapt+floor2 ', 'adaptive', 2],
];

console.log(`残タスク②: 適応導入フロア設計の絶対アウトカム検証 ｜ ${DAYS}日 N=${N}平均`);
console.log('指標: mastered=stage定着(製品定義) / 真=genuine保持 / avgH。崖の有無を見る。\n');

for (const [tName, truth] of TRUTHS) {
  for (const [lName, ability, hVar] of LEARNERS) {
    for (const [pName, spd, burst] of PROFILES) {
      console.log(`■ 真実=${tName} ｜ ${lName} ｜ ${pName}`);
      for (const [polLabel, policy, floor] of POLICIES) {
        const r = runAvg({ truth, policy, floor, spd, burst, ability, hVar });
        console.log(`  ${polLabel} mastered=${r.mastered.toFixed(0).padStart(4)}  真=${r.genuine.toFixed(0).padStart(4)}  学習=${r.learned.toFixed(0).padStart(4)}  avgH=${r.avgH.toFixed(1).padStart(5)}`);
      }
      console.log();
    }
  }
}
