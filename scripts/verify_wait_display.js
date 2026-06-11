// scripts/verify_wait_display.js
// _calcWaitDisplay の新ロジックを検証:
//   予告時刻に generateSession を呼んだとき filler 比率が sessionSize/2 未満になるか
//
// 実行: node --input-type=module < scripts/verify_wait_display.js

import { createConfig } from '../core/config.js';
import { WordState, LearnerState } from '../core/models.js';
import { SRSEngine } from '../core/srs-engine.js';
import { WaveManager } from '../core/wave-manager.js';
import { FeedGenerator } from '../core/feed-generator.js';
import { WORD_DATA } from '../core/word-data.js';
import { VirtualLearner } from '../sim/virtual-learner.js';

// -------------------------------------------------------
// _calcWaitDisplay 相当ロジック（旧・新両方）
// -------------------------------------------------------
function calcWaitOld(state, cfg) {
  const retentionFactor = Math.log2(1 / cfg.targetRetention);
  let nextDueTime = Infinity;
  for (const w of state.words) {
    if (w.stage === 'new' || w.excluded || w.h <= 0) continue;
    const t = w.lastReviewed + w.h * retentionFactor;
    if (t < nextDueTime) nextDueTime = t;
  }
  return isFinite(nextDueTime) ? nextDueTime : null;
}

function calcWaitNew(state, cfg) {
  const retentionFactor = Math.log2(1 / cfg.targetRetention);
  const activeWaveSet = new Set(state.activeWaves);
  const newCount = Math.min(
    cfg.maxNewPerSession,
    state.words.filter(w => w.stage === 'new' && !w.excluded && activeWaveSet.has(w.waveNumber)).length
  );
  const needed = Math.max(1, Math.ceil(cfg.sessionSize / 2) - newCount);
  const dueTimes = [];
  for (const w of state.words) {
    if (w.stage === 'new' || w.excluded || w.h <= 0) continue;
    dueTimes.push(w.lastReviewed + w.h * retentionFactor);
  }
  dueTimes.sort((a, b) => a - b);
  if (dueTimes.length < needed) return null;
  return dueTimes[needed - 1];
}

// -------------------------------------------------------
// セッション内のカード種別を集計
// -------------------------------------------------------
function countCardTypes(cards) {
  let filler = 0, meaningful = 0;
  for (const card of cards) {
    // intro/recognition/recall/dictation/handwrite は meaningful
    // passive は intro 扱いで meaningful
    // filler 相当: 実際の filler フラグはないが、
    //   stage='mastered' かつ p >= targetRetention な語からくる復習 ≒ filler
    // ここでは cardType を見る: filler pool から来たカードは特別なフラグなし。
    // 代わりに _buildCandidatePools のロジックを再現してカウント
    if (card.isFiller) filler++;
    else meaningful++;
  }
  return { filler, meaningful, total: cards.length };
}

// -------------------------------------------------------
// メイン検証ロジック
// -------------------------------------------------------
const cfg = createConfig({});
const words = WORD_DATA.map(d => new WordState(d.id, d.word, Math.ceil(d.id / cfg.waveSize)));
const state = new LearnerState(words, cfg);
const engine = new SRSEngine(cfg);
const waveManager = new WaveManager(cfg, state);
const feedGen = new FeedGenerator(cfg, engine, waveManager);
const learner = new VirtualLearner({ correctRate: 0.80 });

// isFiller フラグを付与するため _buildCandidatePools を使う
// FeedGenerator に公開メソッドがないので、内部的に due/urgent/new/filler を判定する関数
function countMeaningfulAtTime(time) {
  const retentionFactor = Math.log2(1 / cfg.targetRetention);
  const activeWaveSet = new Set(state.activeWaves);

  let meaningful = 0; // skipped + urgent + due + new
  let filler = 0;

  // new
  const newCount = Math.min(
    cfg.maxNewPerSession,
    state.words.filter(w => w.stage === 'new' && !w.excluded && activeWaveSet.has(w.waveNumber)).length
  );
  meaningful += newCount;

  // skipped / urgent / due（feed-generator._buildCandidatePools と同じ分類。
  // uncertain プールは review #5 ステップ1 で削除済み）
  for (const w of state.words) {
    if (w.stage === 'new' || w.excluded || w.h <= 0) continue;
    if (w.skipped) { meaningful++; continue; }
    const p = w.pRecall(time);
    const optimalNextReview = w.lastReviewed + w.h * retentionFactor;
    if (p < 0.5) { meaningful++; continue; }
    if (w.stage !== 'mastered' && time >= optimalNextReview) { meaningful++; continue; }
    if (w.stage === 'mastered' && p < cfg.targetRetention) { meaningful++; continue; }
    filler++;
  }

  return { meaningful, filler, total: meaningful + filler };
}

// -------------------------------------------------------
// シミュレーション実行
// -------------------------------------------------------
const CHECK_DAYS = [3, 7, 10, 14, 21, 30, 45, 60];
const results = [];

let currentDay = 0;

for (let day = 1; day <= 60; day++) {
  for (let s = 0; s < cfg.sessionsPerDay; s++) {
    const sessionTime = day + s / cfg.sessionsPerDay;
    const cards = feedGen.generateSession(state, sessionTime);
    if (cards.length === 0) continue;

    for (const card of cards) {
      const result = learner.respond(card.word, card.cardType, sessionTime);
      const stageBeforeProcess = card.word.stage;
      if (card.isRetry && result !== 'wrong') {
        if (card.cardType === 'handwrite') engine.processResponse(card.word, card.cardType, result, sessionTime);
        else card.word.stage = card.stageBeforeWrong;
      } else {
        engine.processResponse(card.word, card.cardType, result, sessionTime);
      }
    }
  }

  if (CHECK_DAYS.includes(day)) {
    const oldTime = calcWaitOld(state, cfg);
    const newTime = calcWaitNew(state, cfg);

    const oldMins = oldTime != null ? Math.round(Math.max(0, oldTime - day) * 24 * 60) : null;
    const newMins = newTime != null ? Math.round(Math.max(0, newTime - day) * 24 * 60) : null;

    // 旧予告時刻でのセッション内容
    const oldCheck = oldTime != null ? countMeaningfulAtTime(oldTime) : null;
    // 新予告時刻でのセッション内容
    const newCheck = newTime != null ? countMeaningfulAtTime(newTime) : null;

    results.push({ day, oldMins, newMins, oldCheck, newCheck });
  }
}

// -------------------------------------------------------
// 結果表示
// -------------------------------------------------------
const half = Math.ceil(cfg.sessionSize / 2);
console.log(`sessionSize=${cfg.sessionSize}  half=${half}  maxNewPerSession=${cfg.maxNewPerSession}\n`);
console.log('Day | 旧:待機 | 新:待機 | 旧:meaningful | 新:meaningful | 合格?');
console.log('----|---------|---------|--------------|--------------|---------');

for (const r of results) {
  const oldMinsStr = r.oldMins != null ? `${r.oldMins}分` : 'null';
  const newMinsStr = r.newMins != null ? `${r.newMins}分` : 'null';
  const oldM = r.oldCheck ? `${r.oldCheck.meaningful}/${r.oldCheck.total}` : '-';
  const newM = r.newCheck ? `${r.newCheck.meaningful}/${r.newCheck.total}` : '-';
  const pass = r.newCheck ? (r.newCheck.meaningful >= half ? '✅' : '❌') : '-';
  console.log(`${String(r.day).padStart(3)} | ${oldMinsStr.padStart(7)} | ${newMinsStr.padStart(7)} | ${oldM.padStart(12)} | ${newM.padStart(12)} | ${pass}`);
}

console.log('\n旧: 1語目が due になる時刻  新: needed 語目が due になる時刻');
console.log(`✅ = 予告時刻に meaningful >= ${half} 枚`);
