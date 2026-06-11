// scripts/verify_due_sampling.js
// 提案書 §3/§8 シナリオ E の検証:
// due 判定の effectiveH トンプソンサンプリング有無で、位相同期の分散とその副作用を測る。
//
// 朝集中型学習者（5セッション/朝・6分間隔）× 30日。
// 測定:
//   - 復習需要クラスタ: 各セッションで「点推定 h 基準で復習適齢を過ぎた語数」（urgent+due）。
//     ※ off/on どちらの run でも同じ点推定基準で数える中立指標。状態の散らばりだけを比較する。
//   - 復習なし回数: generateSession が [] を返したセッション数
//   - 定着語数（throughput への副作用）
//
// 【検証の現状（2026-06-11）】throughput への効果は sim で立証できていない:
//   - 位相同期は提案書 §3.1 のとおり既習レジーム（上級ドッグフーダー・語を既知）で観測された現象。
//     理論上は「既習・難度均一でコホートがロックステップ」のときサンプリングが効くはずなので、
//     初学者/既習の2プロファイルを併記する。
//   - だが N=24 で測ると Δ定着は初学者 +0.2(SE±1.7)・既習 +1.3(SE±2.2) で**有意差なし**。
//     当初の「+7%」は旧 learner（trueH=h×個体差）のアーティファクトで、間隔効果あり learner では再現しない。
//   - 【教訓】Δの真値（±1〜2）が run 間 std（±6〜9）より小さく、5回程度では符号すら定まらない。
//     タイミング系機構の検証は N≥20 + 標準誤差（下記出力の SE）で判定すること。
//
// 実行: node scripts/verify_due_sampling.js [repeats=20]

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
const REPEATS = Number(process.argv[2] ?? 20);   // タイミング系の判定は N≥20 推奨

// 学習者プロファイル: 初学者（難度バラつき大）と既習（難度ほぼ均一・上級ドッグフーダー相当）
const PROFILES = [
  { name: '初学者（難度バラつき大）  ', ability: 1.0, hVariation: 0.3 },
  { name: '既習（難度ほぼ均一・上級者）', ability: 1.5, hVariation: 0.05 },
];

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

function runOnce(dueSampling, profile) {
  const cfg = createConfig({ dueSampling, sessionsPerDay: SESSIONS_PER_MORNING });
  const words = WORD_DATA.map(d => new WordState(d.id, d.word, Math.ceil(d.id / cfg.waveSize)));
  const state = new LearnerState(words, cfg);
  const engine = new SRSEngine(cfg);
  const wm = new WaveManager(cfg, state);
  const fg = new FeedGenerator(cfg, engine, wm);
  const learner = new VirtualLearner({
    learnerAbility: profile.ability,
    hVariation: profile.hVariation,
    srsConfig: cfg,
  });

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
function std(arr) { const m = avg(arr); return Math.sqrt(avg(arr.map(x => (x - m) ** 2))); }

function summarize(label, runs) {
  const m = k => avg(runs.map(r => r[k]));
  console.log(
    `${label}: 需要mean=${m('mean').toFixed(1)} CV=${m('cv').toFixed(3)} max=${m('max').toFixed(0)} ` +
    `復習なし=${m('noWork').toFixed(1)}/${DAYS * SESSIONS_PER_MORNING} | ` +
    `定着=${m('mastered').toFixed(1)}±${std(runs.map(r => r.mastered)).toFixed(1)} avgH=${m('avgH').toFixed(1)}`
  );
}

console.log(`朝集中学習者（6分間隔×${SESSIONS_PER_MORNING}/朝）× ${DAYS}日・${REPEATS}回平均`);
console.log('効果判定は Δ定着 と SE で（|Δ| < 2×SE はノイズ）。CV/throughput とも新 learner では有意差を確認できていない。\n');

for (const profile of PROFILES) {
  const off = Array.from({ length: REPEATS }, () => runOnce(false, profile));
  const on  = Array.from({ length: REPEATS }, () => runOnce(true, profile));
  const offM = off.map(r => r.mastered), onM = on.map(r => r.mastered);
  const dM = avg(onM) - avg(offM);
  const se = Math.sqrt(std(offM) ** 2 / REPEATS + std(onM) ** 2 / REPEATS);
  console.log(`■ ${profile.name}（ability=${profile.ability} hVariation=${profile.hVariation}）`);
  summarize('  サンプリングOFF（点推定・旧挙動）', off);
  summarize('  サンプリングON （effectiveH）  ', on);
  console.log(`  → Δ定着 = ${dM >= 0 ? '+' : ''}${dM.toFixed(1)}（SE±${se.toFixed(1)}・${Math.abs(dM) > 2 * se ? '有意' : '有意でない(noise域)'}）\n`);
}
