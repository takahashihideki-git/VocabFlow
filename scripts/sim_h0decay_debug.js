// scripts/sim_h0decay_debug.js
// h0 decay で「復習なし」がなぜ増えるかを診断する
// wave unlock タイミング・新語枯渇・セッション内訳を追跡

import { createConfig } from '../core/config.js';
import { WordState, LearnerState, Card } from '../core/models.js';
import { SRSEngine } from '../core/srs-engine.js';
import { WaveManager } from '../core/wave-manager.js';
import { FeedGenerator } from '../core/feed-generator.js';
import { WORD_DATA } from '../core/word-data.js';
import { VirtualLearner } from '../sim/virtual-learner.js';

const H0_DECAY_BASE = 0.98;
const H0_MIN = 0.3;

function adjustedH0(baseH0, todayNewCount, useDecay) {
  if (!useDecay || todayNewCount === 0) return baseH0;
  return Math.max(H0_MIN, baseH0 * Math.pow(H0_DECAY_BASE, todayNewCount));
}

function runSession(cardQueue, engine, cfg, learner, sessionTime, todayNewCount, useH0Decay) {
  const reinsertCount = new Map();
  let newWordsIntroduced = 0;
  let i = 0;
  while (i < cardQueue.length) {
    const card = cardQueue[i];
    const result = learner.respond(card.word, card.cardType, sessionTime);
    card.result = result;
    const stageBeforeProcess = card.word.stage;

    if (card.isRetry && result !== 'wrong') {
      if (card.cardType === 'handwrite') {
        engine.processResponse(card.word, card.cardType, result, sessionTime);
      } else {
        card.word.stage = card.stageBeforeWrong;
      }
    } else {
      if (card.cardType === 'intro' && !card.isRetry && useH0Decay) {
        const origH0 = cfg.h0;
        cfg.h0 = adjustedH0(origH0, todayNewCount + newWordsIntroduced, true);
        engine.processResponse(card.word, card.cardType, result, sessionTime);
        cfg.h0 = origH0;
        newWordsIntroduced++;
      } else {
        if (card.cardType === 'intro' && !card.isRetry) newWordsIntroduced++;
        engine.processResponse(card.word, card.cardType, result, sessionTime);
      }
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

function simulate(useH0Decay, durationDays = 14) {
  const cfg = createConfig();
  const words = WORD_DATA.map(d => new WordState(d.id, d.word, Math.ceil(d.id / cfg.waveSize)));
  const state = new LearnerState(words, cfg);
  const engine = new SRSEngine(cfg);
  const wm = new WaveManager(cfg, state);
  const fg = new FeedGenerator(cfg, engine, wm);
  const learner = new VirtualLearner({ learnerAbility: 1.0 });

  // まとめ消化: 4分間隔
  const SESSION_OFFSETS = [0, 4/1440, 8/1440, 12/1440, 16/1440];

  const log = [];

  for (let day = 0; day < durationDays; day++) {
    let todayNewCount = 0;
    const wavesBefore = [...state.activeWaves];

    for (let si = 0; si < SESSION_OFFSETS.length; si++) {
      const sessionTime = day + SESSION_OFFSETS[si];

      // セッション生成前のプール状態を診断
      const retentionFactor = Math.log2(1 / cfg.targetRetention);
      const newAvail = wm.getNewWordsFromActiveWaves().filter(w => !w.excluded).length;
      const learnedWords = state.words.filter(w => w.stage !== 'new' && !w.excluded);
      const urgentCount = learnedWords.filter(w => w.pRecall(sessionTime) < 0.5).length;
      const dueCount = learnedWords.filter(w => {
        const p = w.pRecall(sessionTime);
        if (p < 0.5) return false;
        const opt = w.lastReviewed + (w.h > 0 ? w.h * retentionFactor : 0);
        return sessionTime >= opt && p < cfg.targetRetention;
      }).length;

      const cardQueue = fg.generateSession(state, sessionTime);
      const noWork = cardQueue.length === 0;
      const meaningful = cardQueue.filter(c => c.cardType !== 'passive').length;

      // wave1の語のpeakH分布（unlock進捗）
      const wave1 = state.words.filter(w => w.waveNumber === 1);
      const wave1MetUnlock = wave1.filter(w => w.peakH >= cfg.waveUnlockH).length;
      const wave1Introduced = wave1.filter(w => w.stage !== 'new').length;
      const unlockProgress = wave1Introduced > 0
        ? (wave1MetUnlock / wave1Introduced * 100).toFixed(0)
        : '0';

      log.push({
        day: day + 1,
        si: si + 1,
        noWork,
        meaningful,
        newAvail,
        urgentCount,
        dueCount,
        wave1Introduced,
        wave1MetUnlock,
        unlockProgress,
        activeWaves: [...state.activeWaves],
      });

      if (!noWork) {
        const n = runSession(cardQueue, engine, cfg, learner, sessionTime, todayNewCount, useH0Decay);
        todayNewCount += n;
      }
    }

    state.currentTime = day + 1;
  }

  return log;
}

function printLog(log, label) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`${label}`);
  console.log('='.repeat(70));
  console.log('Day S  結果     意味 新語可 urgent due  Wave1進捗    activeWaves');
  console.log('-'.repeat(70));

  for (const e of log) {
    const result = e.noWork ? '【復習なし】' : '        OK';
    const waves = JSON.stringify(e.activeWaves);
    console.log(
      `${String(e.day).padStart(3)} ${e.si}  ${result}` +
      `  ${String(e.meaningful).padStart(3)}枚` +
      `  新${String(e.newAvail).padStart(2)}語` +
      `  u:${String(e.urgentCount).padStart(2)}` +
      `  d:${String(e.dueCount).padStart(2)}` +
      `  ${e.wave1Introduced}/50→${e.wave1MetUnlock}(${e.unlockProgress}%)` +
      `  ${waves}`
    );
  }
}

// wave unlock に必要な recognition 回数の理論値も計算
console.log('■ Wave unlock に必要な recognition 正解回数（h0別）');
console.log('peakH >= 2.0 が条件');
console.log('h0      → 1回目h  → 2回目h  → 3回目h  → 達成?');
const alpha = 2.0, rw = 0.8;
for (const h0 of [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3]) {
  let h = h0;
  const steps = [];
  for (let i = 0; i < 5; i++) {
    h = Math.min(Math.max(h * alpha * rw, 0.5), 365);
    steps.push(h.toFixed(3));
    if (h >= 2.0) { steps[steps.length-1] += `✓(${i+1}回目)`; break; }
  }
  console.log(`h0=${h0.toFixed(2)}: ${steps.join(' → ')}`);
}

// 2条件を実行して並べて表示
const logFixed = simulate(false, 14);
const logDecay = simulate(true, 14);

printLog(logFixed, 'まとめ消化 × h0固定');
printLog(logDecay, 'まとめ消化 × h0減衰');
