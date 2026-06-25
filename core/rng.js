// core/rng.js — 決定的擬似乱数（再現可能なシミュレーション用）
//
// 目的:
//  1. 再現性 — sim / 検証スクリプトを「同じコミット・同じ設定・同じ seed → 完全に同じ結果」に
//     する。`Math.random()` 直書きでは同じコミット・同じ設定でも再生成できなかった（GPT レビュー
//     重大1）。core のノイズ系（seedNoise / effectiveH / feed-gen のランダム選出）と仮想学習者の
//     乱数を config.rng / learner.rng として注入可能にする。
//  2. CRN (Common Random Numbers) — 機構 ON/OFF のペア比較で「環境」の乱数列を共有し、run 間
//     分散を相殺して小さい N で Δ を検出する。VocabFlow の過去の痛み（dueSampling 検証で N を
//     増やすまで符号が二転三転した）は、ON/OFF が独立に乱数を引いていたのが一因。
//
// 本番アプリは config.rng / learner.rng を未指定（既定 Math.random）のままで挙動不変。
// app/ の UI 乱数（選択肢シャッフル・背景画像選択）は研究再現性と無関係なので対象外。

// mulberry32: 32bit seed の高速 PRNG。周期 2^32・統計的性質は sim 用途に十分。
// 参考実装（public domain・bryc）。状態は 1 ワードのみ。
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 任意の seed（文字列/数値）→ 32bit 整数（xmur3 ハッシュ）。
// 複数の独立ストリームを 1 つのマスター seed から導出するのに使う。
export function hashSeed(seed) {
  const str = String(seed);
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

// マスター seed から名前付きの独立ストリームを導出する。
// 例: deriveRng(masterSeed, 'learner') と deriveRng(masterSeed, 'policy') を別系統にすると、
// 機構 ON/OFF で policy ストリームの消費量が変わっても learner ストリームがずれない（CRN の主レバー）。
//   - 'learner' = 仮想学習者の正誤コイン投げ等（最大の分散源・ペアで共有して相殺）
//   - 'policy'  = core のノイズ系 + feed-gen のタイブレーク（機構が消費する側）
export function deriveRng(masterSeed, label) {
  return mulberry32(hashSeed(`${masterSeed}::${label}`));
}
