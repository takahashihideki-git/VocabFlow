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
// 播種ノイズは core 採用済み（config.seedNoise 既定 true）。本スクリプトは実コードパスを
// 「決定的 seed + CRN ペア比較」で再検証する参照ハーネス（GPT レビュー重大1 への対応）:
//   - 再現性: 同じコミット・同じ引数・同じ SEED → 完全に同じ結果（core/rng.js で乱数を seed 化）。
//   - CRN: trial k で OFF/ON は同一 masterSeed を使い、learner ストリーム（正誤コイン投げ＝最大の
//     分散源）を共有する。policy ストリームは別系統なので seedNoise の追加消費が learner をずらさない。
//     これにより run 間分散が相殺され、ペア統計 Δ が独立サンプリングより遥かに小さい SE で出る。
//     ※ 限界: seedNoise は h を変え→ due 順を変え→カード列が分岐するため、CRN は早期軌道のみ
//       強相関させる（軌道分岐後は learner 抽選の対応が崩れる）。逐次適応系の CRN の本質的限界。
//   - 出力: seed / config / commitSHA / 全試行の生データ / ペア集計を JSON 保存（再現・追試用）。
//
// 実行: node scripts/verify_seed_noise.js [spread|burst] [days] [N] [exp]
//       環境変数: MEMORY_CORE=hlr|ebisu  TRUE_MODEL=alpha|dsr  SEED=<整数>（既定 1000）

import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createConfig } from '../core/config.js';
import { deriveRng } from '../core/rng.js';
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
const MEMORY_CORE = process.env.MEMORY_CORE || 'hlr';   // 'hlr'（既定）| 'ebisu'
const TRUE_MODEL  = process.env.TRUE_MODEL  || 'alpha'; // 'alpha'（既定）| 'dsr'（中立）
const SEED_BASE = Number(process.env.SEED ?? 1000);     // CRN マスター seed の基点
const SPD = LEARNER === 'burst' ? 5 : 3;
const sessionTime = (day, s) => LEARNER === 'burst' ? day + s * SIX : day + s / SPD;

const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
const sdv = a => { const m = avg(a); return Math.sqrt(avg(a.map(x => (x - m) ** 2))); };
const se = a => sdv(a) / Math.sqrt(a.length);

// 1 試行を決定的に実行。featureOn=seedNoise の ON/OFF、masterSeed が CRN の対応付けキー。
// 同じ masterSeed の OFF/ON は learner ストリームを共有する（CRN）。
function runOnce(featureOn, masterSeed) {
  const cfg = createConfig({ deltaTGain: true, dueSampling: false, sessionsPerDay: SPD,
    seedNoise: featureOn, seedNoiseBase: BASE, seedNoiseExp: EXP, memoryCore: MEMORY_CORE,
    rng: deriveRng(masterSeed, 'policy') });
  const words = WORD_DATA.map(d => new WordState(d.id, d.word, Math.ceil(d.id / cfg.waveSize)));
  const state = new LearnerState(words, cfg);
  const engine = new SRSEngine(cfg);
  const wm = new WaveManager(cfg, state);
  const fg = new FeedGenerator(cfg, engine, wm);
  const learner = new VirtualLearner({ learnerAbility: 1.0, hVariation: 0.3, srsConfig: cfg,
    trueModel: TRUE_MODEL, rng: deriveRng(masterSeed, 'learner') });
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

// 独立サンプリングの Δ（参考・旧表示）
function dlt(on, off, key, dec) {
  const d = avg(on.map(r => r[key])) - avg(off.map(r => r[key]));
  const s = Math.sqrt(se(on.map(r => r[key])) ** 2 + se(off.map(r => r[key])) ** 2);
  return `Δ=${d >= 0 ? '+' : ''}${d.toFixed(dec)}(${(d / s).toFixed(1)}σ ${Math.abs(d) > 2 * s ? '有意' : 'ns'})`;
}

// CRN ペアの Δ（本命）: 同一 seed の on[k]−off[k] の差分系列から平均と SE を取る。
// learner ストリーム共有で run 間分散が相殺され、SE は独立サンプリングより小さくなる。
function paired(on, off, key, dec) {
  const d = on.map((r, k) => r[key] - off[k][key]);
  const m = avg(d), s = se(d);
  return { mean: m, se: s, t: s > 0 ? m / s : 0,
    str: `Δ=${m >= 0 ? '+' : ''}${m.toFixed(dec)}(${s > 0 ? (m / s).toFixed(1) : '∞'}σ ${Math.abs(m) > 2 * s ? '有意' : 'ns'})` };
}

console.log(`記憶コア=${MEMORY_CORE}・真実=${TRUE_MODEL}・学習者=${LEARNER}（${SPD}/日）× ${DAYS}日・N=${N}・播種 base/rc^${EXP}（deltaTGain=true・dueSampling=false）・SEED=${SEED_BASE}（CRN ペア）`);
// trial k は masterSeed = SEED_BASE + k。OFF/ON が同一 masterSeed＝learner 乱数列を共有。
const seeds = Array.from({ length: N }, (_, k) => SEED_BASE + k);
const off = seeds.map(s => runOnce(false, s));
const on  = seeds.map(s => runOnce(true, s));
const row = (l, rs) => console.log(`${l}: mastered=${avg(rs.map(r => r.mastered)).toFixed(1)} 真に覚=${avg(rs.map(r => r.knownTotal)).toFixed(1)} 試験全=${avg(rs.map(r => r.examAll)).toFixed(4)} 試験mastered=${avg(rs.map(r => r.examMastered)).toFixed(4)} バイアス=${avg(rs.map(r => r.bias)).toFixed(4)}`);
row('播種OFF', off); row('播種ON ', on);

const keys = [['mastered', 1], ['knownTotal', 1], ['examAll', 4], ['examMastered', 4], ['bias', 4]];
const pairedSummary = Object.fromEntries(keys.map(([k, d]) => [k, paired(on, off, k, d)]));
console.log(`\n[CRN ペア] mastered ${pairedSummary.mastered.str} | 真に覚えてる語数 ${pairedSummary.knownTotal.str}`);
console.log(`[CRN ペア] 試験(全) ${pairedSummary.examAll.str} | 試験(mastered) ${pairedSummary.examMastered.str} | バイアス ${pairedSummary.bias.str}`);
console.log(`[独立参考] mastered ${dlt(on, off, 'mastered', 1)} | 真に覚えてる語数 ${dlt(on, off, 'knownTotal', 1)}`);
console.log(`\n判定: 「真に覚えてる語数」が mastered と同程度↑＝本物。mastered だけ↑・試験mastered↓・バイアス上方＝偽mastered。`);

// --- 再現・追試用に seed / config / commitSHA / 生データ / 集計を JSON 保存 ---
let commitSHA = 'unknown';
try { commitSHA = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(); } catch { /* git 不在時 */ }
const cfgSnapshot = { ...createConfig({ deltaTGain: true, dueSampling: false, sessionsPerDay: SPD,
  seedNoiseBase: BASE, seedNoiseExp: EXP, memoryCore: MEMORY_CORE }) };
delete cfgSnapshot.rng;   // 関数は JSON 化できない
const out = {
  script: 'verify_seed_noise',
  commitSHA,
  generatedAt: new Date().toISOString(),
  params: { LEARNER, DAYS, N, EXP, BASE, MEMORY_CORE, TRUE_MODEL, SEED_BASE, SPD },
  config: cfgSnapshot,
  seeds,
  trials: { off, on },
  pairedSummary,
};
const resultsDir = join(dirname(fileURLToPath(import.meta.url)), 'results');
const outPath = join(resultsDir, `seed_noise_${LEARNER}_${MEMORY_CORE}_${TRUE_MODEL}_seed${SEED_BASE}.json`);
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`\n結果を保存: ${outPath}`);
