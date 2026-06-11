// scripts/verify_seed_noise.js
// 播種ノイズ（seed noise）の検証 — 位相同期の分散をめぐる探索の到達点。
//
// 背景: 提案書 §3 のトンプソンサンプリング（dueSampling）は新 learner では throughput に
// 有意な効果を出せなかった。そこで「h は真の記憶の測定値ではなく SRS を回す seed」という
// 再フレームのもと、h 更新そのものに信頼度連動ノイズを保存型で乗せる案を検証した。
//
// 鍵は「勾配」: ノイズ幅 w = base / rc^exp。
//   - exp 小（√rc 相当）: 成熟語まで ±5〜25% 残存 → 複利蓄積で成熟 h を汚す（校正悪化・便益相殺）
//   - exp 大（rc^2.5）   : rc=1 の一撃(±50%)に播種が集中し rc≥2 で実質ゼロ → 複利停止
//                          ＝「導入時に一度だけ種をまく」。成熟 footprint 極小で desync を seed する。
//
// 結論（N=30・長期・両学習者・ラチェット反証済み）:
//   - 過負荷の朝バースト学習者（位相同期が起きる局面）で genuine に throughput +約5%
//     （真に覚えてる語数 +14.6＠120日・4.9σ）。偽 mastered ではない（mastered 語の真の
//      保持率は不変・符号付きバイアスは下降＝過信は増えない）。
//   - 余裕のある分散学習者では完全に中立（下振れなし）。→ 常時適用で安全（load-gating 不要）。
//   ※ throughput は小標本で何度もノイズに騙された指標。判定は必ず N≥30 + 標準誤差 + 複数指標
//     （mastered だけでなく「真に覚えてる語数」「mastered 語の真の保持率」「バイアス」）で。
//
// ※ これは検証スクリプトであり、播種ノイズは未だ core 未実装（採否判断待ち）。
//
// 実行: node scripts/verify_seed_noise.js [spread|burst] [days] [N] [exp]

import { createConfig } from '../core/config.js';
import { WordState, LearnerState, Card } from '../core/models.js';
import { SRSEngine } from '../core/srs-engine.js';
import { WaveManager } from '../core/wave-manager.js';
import { FeedGenerator } from '../core/feed-generator.js';
import { WORD_DATA } from '../core/word-data.js';
import { VirtualLearner } from '../sim/virtual-learner.js';

const SIX = 6 / 1440;
const LEARNER = process.argv[2] ?? 'burst';
const DAYS = Number(process.argv[3] ?? 120);
const N = Number(process.argv[4] ?? 30);
const EXP = Number(process.argv[5] ?? 2.5);   // 勾配指数（base/rc^exp）
const BASE = 0.5;
const SPD = LEARNER === 'burst' ? 5 : 3;
const sessionTime = (day, s) => LEARNER === 'burst' ? day + s * SIX : day + s / SPD;

const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
const sdv = a => { const m = avg(a); return Math.sqrt(avg(a.map(x => (x - m) ** 2))); };
const se = a => sdv(a) / Math.sqrt(a.length);

function runOnce(seed) {
  // core の seedNoise を直接トグルして実コードパスを検証（旧版は harness で手注入していた）
  const cfg = createConfig({ deltaTGain: true, dueSampling: false, sessionsPerDay: SPD,
    seedNoise: seed, seedNoiseBase: BASE, seedNoiseExp: EXP });
  const words = WORD_DATA.map(d => new WordState(d.id, d.word, Math.ceil(d.id / cfg.waveSize)));
  const state = new LearnerState(words, cfg);
  const engine = new SRSEngine(cfg);
  const wm = new WaveManager(cfg, state);
  const fg = new FeedGenerator(cfg, engine, wm);
  const learner = new VirtualLearner({ learnerAbility: 1.0, hVariation: 0.3, srsConfig: cfg });
  let biasSum = 0, biasN = 0;
  for (let day = 0; day < DAYS; day++) {
    for (let s = 0; s < SPD; s++) {
      const t = sessionTime(day, s);
      const q = fg.generateSession(state, t);
      const re = new Map(); let i = 0;
      while (i < q.length) {
        const c = q[i], w = c.word;
        if (c.cardType !== 'intro' && c.cardType !== 'passive' && w.stage !== 'new') {
          biasSum += (w.pRecall(t) - learner.truePRecall(w, t)); biasN++;
        }
        const r = learner.respond(w, c.cardType, t);
        c.result = r;
        engine.processResponse(w, c.cardType, r, t);   // 播種は core 内（cfg.seedNoise）で適用
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
  const examAll = avg(learned.map(w => learner.truePRecall(w, tEnd)));
  const mastered = state.words.filter(w => w.stage === 'mastered');
  return {
    mastered: mastered.length,
    knownTotal: examAll * learned.length,                  // 真に覚えてる語数（期待値）
    examAll,                                               // 1語あたり真の保持率（期末試験）
    examMastered: mastered.length ? avg(mastered.map(w => learner.truePRecall(w, tEnd))) : 0,
    bias: biasSum / biasN,                                 // predP − trueP（>0=過信）
  };
}

function dlt(on, off, key, dec) {
  const d = avg(on.map(r => r[key])) - avg(off.map(r => r[key]));
  const s = Math.sqrt(se(on.map(r => r[key])) ** 2 + se(off.map(r => r[key])) ** 2);
  return `Δ=${d >= 0 ? '+' : ''}${d.toFixed(dec)}(${(d / s).toFixed(1)}σ ${Math.abs(d) > 2 * s ? '有意' : 'ns'})`;
}

console.log(`学習者=${LEARNER}（${SPD}/日）× ${DAYS}日・N=${N}・播種 base/rc^${EXP}（deltaTGain=true・dueSampling=false）`);
const off = Array.from({ length: N }, () => runOnce(false));
const on  = Array.from({ length: N }, () => runOnce(true));
const row = (l, rs) => console.log(`${l}: mastered=${avg(rs.map(r => r.mastered)).toFixed(1)} 真に覚=${avg(rs.map(r => r.knownTotal)).toFixed(1)} 試験全=${avg(rs.map(r => r.examAll)).toFixed(4)} 試験mastered=${avg(rs.map(r => r.examMastered)).toFixed(4)} バイアス=${avg(rs.map(r => r.bias)).toFixed(4)}`);
row('播種OFF', off); row('播種ON ', on);
console.log(`\nmastered ${dlt(on, off, 'mastered', 1)} | 真に覚えてる語数 ${dlt(on, off, 'knownTotal', 1)}`);
console.log(`試験(全) ${dlt(on, off, 'examAll', 4)} | 試験(mastered) ${dlt(on, off, 'examMastered', 4)} | バイアス ${dlt(on, off, 'bias', 4)}`);
console.log(`\n判定: 「真に覚えてる語数」が mastered と同程度↑＝本物。mastered だけ↑・試験mastered↓・バイアス上方＝偽mastered。`);
