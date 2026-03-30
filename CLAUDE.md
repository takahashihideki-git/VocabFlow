# VocabFlow — CLAUDE.md（実装継続ガイド）

## プロジェクト概要

TikTok式縦スワイプUIで英語語彙を学ぶSRSアプリ。詳細仕様は `spec.md`（v3）、単語データ仕様は `word-data-spec.md` を参照。

---

## 現在の実装状況

### Phase 1: core/ ✅ 完了（下記バグ修正が必要）

| ファイル | 状態 |
|---|---|
| `core/config.js` | ✅ spec v3 対応済み（hMin, hMax, retryGap, maxRetryPerCard 追加） |
| `core/models.js` | ✅ peakH フィールド追加済み |
| `core/srs-engine.js` | ✅ peakH 更新、cfg.hMin/hMax 使用 |
| `core/wave-manager.js` | ✅ peakH ベースの wave 解放判定 |
| `core/feed-generator.js` | ⚠️ spec v3 対応済みだが**バグあり（後述）** |
| `core/word-data.js` | ✅ Phase 0（1900語、pos/categoryId はヒューリスティック推定） |

### Phase 2: sim/ ⚠️ 実装済み・シミュレーターが動くが Wave 2 未解放

| ファイル | 状態 |
|---|---|
| `sim/sim-runner.js` | ✅ retryGap/maxRetryPerCard をコンフィグから参照 |
| `sim/virtual-learner.js` | ✅ |
| `sim/scenarios.js` | ✅ |
| `sim/charts.js` | ✅ |
| `sim/sim.html` | ✅ |
| `sim/sim.js` | ✅ |
| `sim/sim.css` | ✅ |

### Phase 3: app/ ❌ 未実装

---

## 🔴 最重要：未解決バグ（次セッションの最優先事項）

### 問題：新語導入が途中で止まる（28語で停止）

**症状**：
```
Day 10: 定着=4 学習済=28 waves=[1]  ← 28語で止まる
Day 60: 定着=4 学習済=28 waves=[1]  ← 60日後も同じ
```

**根本原因**：spec v3 のグリーディ割当方式 `feed-generator.js` で due pool が全スロットを占領し、新語 (new) にスロットが回らない。

```
greedy 順序: urgent → due → new → uncertain → filler
sessionSize = 20 かつ due.length = 28 の場合:
  urgentCount = 0
  dueCount = min(28, 20) = 20  ← 全スロット消費
  remaining = 0
  newCount = min(new.length, 0, 5) = 0  ← 新語が入れない！
```

セッション早期終了（urgent=due=new=0）は発動しないため（new > 0）、セッションは実行されるが新語がずっと導入されない。

**修正方針**（次セッションで実装）：

新語のスロットを事前に確保してから due を割り当てる。`generateSession` の slot 計算順を変更：

```javascript
// Step 1: 新語を先に確保
const newCount = Math.min(pools.new.length, cfg.maxNewPerSession);
let remaining = cfg.sessionSize - newCount;

// Step 2: Urgent
const selectedUrgent = this._pickSorted(pools.urgent, remaining, 'pRecall_asc', currentTime);
remaining -= selectedUrgent.length;

// Step 3: Due
const selectedDue = this._pickSorted(pools.due, remaining, 'pRecall_asc', currentTime);
remaining -= selectedDue.length;

// Step 4: Uncertain
// Step 5: Filler
```

これで新語が常に最大 maxNewPerSession スロットを確保でき、かつ urgent/due も残り枠で処理される。

---

## 実装済みの spec v3 変更（今セッションで適用済み）

### ✅ 適用済み

| 変更 | ファイル | 内容 |
|---|---|---|
| peakH の導入 | models.js, srs-engine.js, wave-manager.js | wave解放を最大到達h で判定 |
| hMin/hMax をコンフィグ化 | config.js, srs-engine.js | h0/2=0.5, 365日 |
| retryGap, maxRetryPerCard | config.js, sim-runner.js | 設定値化（4枚後、最大2回） |
| セッション早期終了 | feed-generator.js | urgent+due+new=0 → 空配列返却 |
| グリーディ割当 | feed-generator.js | 優先度順 urgent→due→new→uncertain→filler |
| ウェーブ即時トリガー | feed-generator.js（既存） | generateSession 冒頭で checkUnlock |
| セッション内リトライ | sim-runner.js（既存） | 不正解 → retryGap 枚後に再挿入 |

### ⚠️ 未適用・次セッションで対処

1. **新語優先確保**（最優先）：上記バグの修正。spec v3 §4.2 の意図に合う形に。

---

## コアモジュール設計のポイント（spec v3 準拠）

### srs-engine.js
- passive: h 更新しない
- intro: h = h0, stage = recognition
- recognition → recall: 正解したら即昇格（h条件なし）
- h範囲: `[cfg.hMin, cfg.hMax]` = `[0.5, 365]`
- h更新後に `peakH = max(peakH, h)` を記録

### feed-generator.js（グリーディ方式）
```
urgent（pRecall昇順） → due（pRecall昇順） → new（先着順） → uncertain（sigma降順） → filler（ランダム）
早期終了: urgent=due=new=0 なら [] を返す
```
※ 現状バグあり。new を先に確保する修正が必要。

### wave-manager.js
- 解放条件: `peakH >= waveUnlockH(2.0)` の語が 70%+
- 卒業判定: `h >= graduationH(8.0)` が 90%+
- 即時トリガー: generateSession 冒頭で毎回 checkUnlock

---

## 動作確認コマンド

```bash
# シミュレーター実行テスト（UI なし）
node --input-type=module << 'EOF'
import { runSimulation } from '/home/takahashihideki/dev/VocabFlow/sim/sim-runner.js';
const result = runSimulation({}, 90, (day, _, snap) => {
  if (day % 10 === 0) console.log(`Day ${day}: 定着=${snap.masteredCount} 学習済=${snap.learnedCount} waves=${JSON.stringify(snap.activeWaves)} avgH=${snap.avgH.toFixed(1)}`);
});
EOF

# ブラウザで sim を開く（要ローカルサーバー）
# cd /home/takahashihideki/dev/VocabFlow && python3 -m http.server 8080
# → http://localhost:8080/sim/sim.html
```

---

## Phase 3: app/ 実装予定（Phase 2 安定化後）

実装すべきファイル：
- `app/app.html`
- `app/app.js` — セッション管理、時間早送りUI、localStorage永続化
- `app/ui-cards.js` — 6種カードのUI（Intro/Recognition/Recall/Dictation/Handwrite/Passive）
- `app/ui-heatmap.js` — Wave Heatmap リアルタイム描画
- `app/app.css`

重要な UI 仕様（spec §7.3）：
- 縦スワイプ（CSS scroll-snap）
- Web Speech API で TTS（Intro/Dictation）
- 「次のセッションへ」「翌日へ」「1週間後へ」ボタンで時間早送り
- localStorage に LearnerState をシリアライズ保存
- Wave Heatmap をリアルタイム更新

---

## ファイル構成

```
VocabFlow/
├── spec.md               # SRS仕様書 v3（必読）
├── spec.md.bk20260330    # v2 バックアップ
├── word-data-spec.md     # 単語データ仕様
├── 1900_words_list.md    # 1900語リスト（語順=wave順）
├── package.json          # "type": "module"
├── core/
│   ├── config.js         # DEFAULT_CONFIG, createConfig()
│   ├── models.js         # WordState（peakH含む）, Card, Session, LearnerState
│   ├── srs-engine.js     # SRSEngine（h更新・peakH・ステージ遷移・判定）
│   ├── wave-manager.js   # WaveManager（peakHベースwave解放・卒業）
│   ├── feed-generator.js # FeedGenerator（グリーディ割当・早期終了）← バグあり
│   └── word-data.js      # WORD_DATA(1900語), CATEGORIES
├── sim/
│   ├── sim-runner.js     # runSimulation(), runScenario()
│   ├── virtual-learner.js# VirtualLearner
│   ├── scenarios.js      # SCENARIOS A〜D
│   ├── charts.js         # SimCharts（Canvas描画）
│   ├── sim.html          # シミュレーターUI
│   ├── sim.js            # UI制御
│   └── sim.css
└── app/                  # 未実装
```
