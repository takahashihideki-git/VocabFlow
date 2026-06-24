// scripts/verify_oracle.js
// 「対オラクル％」ハーネス — 記憶コア選定の物差しを「校正MAE（circular）」から
// 「アウトカム比（実用性・非circular）」へ替える。
//
// 問い: 真のカーブを知らない我々のアルゴリズムは、真のカーブを知る神様（オラクル）に
//       どれだけ肉薄するか。それは真実カーブの族全体で頑健か。
//
// 設計の肝（非circular の理由）:
//   オラクル = 我々と全く同じ全系（Wave 供給・貪欲 feed・ステージ遷移・リトライ・同じ engine）。
//   唯一の違いは「保持率の推定」だけ——オラクルは feed-generator の recallFn / dueHFn に
//   learner の真のカーブ（truePRecall / trueHalflife）を注入する。
//   よって ours/oracle 比は「推定誤差のコスト」だけを測る＝記憶コアの良し悪しがそのまま出る。
//   校正MAE と違い「予測=真実」の循環に依存しない（指標は最終的な genuine 保持＝アウトカム）。
//
// 指標（期末試験＝最終時刻での真の保持率）:
//   genuine   = Σ 真の保持率（学習済・非除外）＝「いま試験したら何語覚えているか」の期待値
//   reviews   = 採点された復習カード数（intro/passive を除く＝復習の労力）
//   efficiency= genuine / reviews（労力あたりの定着）
//   %oracle   = ours.genuine / oracle.genuine（対オラクル達成率）
//
// 実行: node scripts/verify_oracle.js [days] [N]

import { createConfig } from '../core/config.js';
import { WordState, LearnerState, Card } from '../core/models.js';
import { SRSEngine } from '../core/srs-engine.js';
import { WaveManager } from '../core/wave-manager.js';
import { FeedGenerator } from '../core/feed-generator.js';
import { WORD_DATA } from '../core/word-data.js';
import { VirtualLearner } from '../sim/virtual-learner.js';

const SIX = 6 / 1440;
const DAYS = Number(process.argv[2] ?? 90);
const N = Number(process.argv[3] ?? 3);
const SLIP = Number(process.env.SLIP ?? 0);    // 観測ノイズ: 正解を 'wrong' と見る確率（うっかり）
const GUESS = Number(process.env.GUESS ?? 0);  // 観測ノイズ: 不正解を 'perfect' と見る確率（まぐれ）

const avg = a => a.reduce((x, y) => x + y, 0) / a.length;

function simulate({ core, truth, oracle, days, spd, burst }) {
  const cfg = createConfig({ memoryCore: core, sessionsPerDay: spd,
    reserveNewSlots: process.env.RESERVE_NEW === '1' });   // deltaTGain/seedNoise は既定 true（実シップ構成）
  const words = WORD_DATA.map(d => new WordState(d.id, d.word, Math.ceil(d.id / cfg.waveSize)));
  const state = new LearnerState(words, cfg);
  const engine = new SRSEngine(cfg);
  const wm = new WaveManager(cfg, state);
  const fg = new FeedGenerator(cfg, engine, wm);
  const learner = new VirtualLearner({ learnerAbility: 1.0, hVariation: 0.3, srsConfig: cfg,
    trueModel: truth, slipRate: SLIP, guessRate: GUESS });

  // オラクル: 我々と同一の全系で、recall 推定だけを真のカーブに差し替える
  if (oracle) {
    fg.recallFn = (w, t) => learner.truePRecall(w, t);
    fg.dueHFn = (w) => learner.trueHalflife(w);
  }

  let reviews = 0;
  for (let day = 0; day < days; day++) {
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
        if (c.cardType !== 'intro' && c.cardType !== 'passive') reviews++;
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

  const tEnd = days;
  const learned = state.words.filter(w => w.stage !== 'new' && !w.excluded);
  const genuine = learned.reduce((acc, w) => acc + learner.truePRecall(w, tEnd), 0);
  const mastered = state.words.filter(w => w.stage === 'mastered').length;
  return { genuine, learned: learned.length, mastered, reviews };
}

function runAvg(opts) {
  const rs = Array.from({ length: N }, () => simulate(opts));
  const m = k => avg(rs.map(r => r[k]));
  return { genuine: m('genuine'), learned: m('learned'), mastered: m('mastered'), reviews: m('reviews') };
}

console.log(`対オラクル％（アウトカム＝期末の真の保持語数）｜ ${DAYS}日・N=${N}平均｜観測ノイズ slip=${SLIP} guess=${GUESS}`);
console.log('オラクル = 同一全系で recall 推定だけ真のカーブ。ours/oracle = 推定誤差のコスト。\n');

const TRUTHS = [
  ['指数則(alpha・HLR同族)', 'alpha'],
  ['べき則(dsr・FSRS系/中立)', 'dsr'],
  ['Ebisu生成過程(ebisu同族)', 'ebisu'],
];
const PROFILES = [
  ['標準 3回/日', 3, false],
  ['朝集中 5回/朝', 5, true],
];
const CORES = ['hlr', 'ebisu', 'dsr'];

for (const [truthName, truth] of TRUTHS) {
  for (const [profName, spd, burst] of PROFILES) {
    console.log(`■ 真実=${truthName} ｜ 学習者=${profName}`);
    for (const core of CORES) {
      const oracle = runAvg({ core, truth, oracle: true, days: DAYS, spd, burst });
      const ours = runAvg({ core, truth, oracle: false, days: DAYS, spd, burst });
      const pct = oracle.genuine > 0 ? (100 * ours.genuine / oracle.genuine) : 0;
      const effO = oracle.reviews > 0 ? oracle.genuine / oracle.reviews : 0;
      const effU = ours.reviews > 0 ? ours.genuine / ours.reviews : 0;
      console.log(
        `  ${core.padEnd(5)} ours: 定着真${ours.genuine.toFixed(0)} 学習${ours.learned.toFixed(0)} 復習${ours.reviews.toFixed(0)} 効率${effU.toFixed(3)}` +
        ` ｜ oracle: 真${oracle.genuine.toFixed(0)} 復習${oracle.reviews.toFixed(0)} 効率${effO.toFixed(3)}` +
        ` ｜ 対オラクル ${pct.toFixed(1)}%`
      );
    }
    console.log();
  }
}
