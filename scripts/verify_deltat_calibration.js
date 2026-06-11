// scripts/verify_deltat_calibration.js
// review #1（deltaT 連動 h ゲイン）の「校正の真価」検証。
//
// 動機: 単純な residual-memory（trueH = h × 個体差）だとシステムの h をそのまま真の記憶と
// みなすため、「massed（クラミング）で h は伸びたが実際には定着していない」状況を表現できず、
// deltaT 連動が本来補正する誤差（間隔・タイミング起因）を測れない。
//
// そこで virtual-learner（間隔効果ありの独立した真の記憶モデルに刷新済み）を真の記憶源として
// 使い、システム側の deltaTGain だけを OFF/ON で切り替えて校正を比較する。learner.truePRecall が
// 「間隔効果に従って成長した真の保持率」を返す（massed は durable に効かない）。
//
// 測定: 復習時の |システム予測p − 真p| の平均（MAE）と平均符号付き誤差（バイアス）。
//   ON の MAE < OFF の MAE なら「deltaT 連動で h が真の記憶をよく追える」＝ #1 の価値。
//   バイアス >0 はシステムが保持率を過大評価（覚えていると過信）している量。
//
// 実行: node scripts/verify_deltat_calibration.js [days]

import { createConfig } from '../core/config.js';
import { WordState, LearnerState, Card } from '../core/models.js';
import { SRSEngine } from '../core/srs-engine.js';
import { WaveManager } from '../core/wave-manager.js';
import { FeedGenerator } from '../core/feed-generator.js';
import { WORD_DATA } from '../core/word-data.js';
import { VirtualLearner } from '../sim/virtual-learner.js';

const SIX_MIN = 6 / 1440;

function runOnce(deltaTGain, duration, spd, burst) {
  const cfg = createConfig({ deltaTGain, sessionsPerDay: spd });
  const words = WORD_DATA.map(d => new WordState(d.id, d.word, Math.ceil(d.id / cfg.waveSize)));
  const state = new LearnerState(words, cfg);
  const engine = new SRSEngine(cfg);
  const wm = new WaveManager(cfg, state);
  const fg = new FeedGenerator(cfg, engine, wm);
  const learner = new VirtualLearner({ learnerAbility: 1.0, srsConfig: cfg });

  let errSum = 0, errN = 0, overSum = 0;

  for (let day = 0; day < duration; day++) {
    for (let s = 0; s < spd; s++) {
      const t = burst ? day + s * SIX_MIN : day + s / spd;
      const queue = fg.generateSession(state, t);
      const reinsert = new Map();
      let i = 0;
      while (i < queue.length) {
        const card = queue[i];
        const w = card.word;
        // 校正測定（回答前・復習カードのみ）。真 p は learner の間隔効果ありの記憶から。
        if (card.cardType !== 'intro' && card.cardType !== 'passive' && w.stage !== 'new') {
          const predP = w.pRecall(t);
          const realP = learner.truePRecall(w, t);
          errSum += Math.abs(predP - realP); errN++;
          overSum += (predP - realP);
        }
        const result = learner.respond(w, card.cardType, t);
        card.result = result;
        engine.processResponse(w, card.cardType, result, t);
        const isWrong = result === 'wrong' || result === 'near_miss' || result === 'phonetic';
        if (isWrong && card.cardType !== 'passive') {
          const k = w.wordId;
          if ((reinsert.get(k) ?? 0) < cfg.maxRetryPerCard) {
            reinsert.set(k, (reinsert.get(k) ?? 0) + 1);
            const pos = Math.min(i + 1 + cfg.retryGap, queue.length);
            const rc = new Card(w, fg._assignCardType(w, state));
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

  const mastered = state.words.filter(w => w.stage === 'mastered').length;
  return { mastered, mae: errN ? errSum / errN : 0, bias: errN ? overSum / errN : 0 };
}

function avg(a) { return a.reduce((x, y) => x + y, 0) / a.length; }
function summarize(label, runs) {
  const m = k => avg(runs.map(r => r[k]));
  console.log(
    `${label}: 定着=${m('mastered').toFixed(0)} | 校正MAE=${m('mae').toFixed(4)} ` +
    `バイアス=${m('bias') >= 0 ? '+' : ''}${m('bias').toFixed(4)}（+は過大評価）`
  );
}

const REPEATS = 3;
const DUR = Number(process.argv[2] ?? 120);
console.log(`間隔効果ありの真の記憶モデル（virtual-learner）で OFF/ON を校正比較（${DUR}日・${REPEATS}回平均）`);
console.log('真 p = learner.truePRecall（成功時 (1−R) 正規化で成長＝massed では伸びない）。MAE = |予測p − 真p|。\n');

for (const [name, spd, burst] of [['標準（3回/日・規則的）', 3, false], ['朝集中（5回/朝・6分間隔）', 5, true]]) {
  console.log(`■ ${name}`);
  const off = Array.from({ length: REPEATS }, () => runOnce(false, DUR, spd, burst));
  const on  = Array.from({ length: REPEATS }, () => runOnce(true, DUR, spd, burst));
  summarize('  OFF（旧 alpha・間隔無視）', off);
  summarize('  ON （正規化 deltaT 連動） ', on);
  console.log();
}
