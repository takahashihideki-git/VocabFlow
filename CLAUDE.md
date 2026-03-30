# VocabFlow — CLAUDE.md（実装継続ガイド）

## プロジェクト概要

TikTok式縦スワイプUIで英語語彙を学ぶSRSアプリ。詳細仕様は `spec.md`（v3）、単語データ仕様は `word-data-spec.md` を参照。

---

## 現在の実装状況

### Phase 1: core/ ✅ 完了

| ファイル | 状態 |
|---|---|
| `core/config.js` | ✅ spec v3 対応済み |
| `core/models.js` | ✅ peakH, Card.isRetry, Card.stageBeforeWrong 追加済み |
| `core/srs-engine.js` | ✅ peakH 更新、hMin/hMax 使用 |
| `core/wave-manager.js` | ✅ peakH ベースの wave 解放判定 |
| `core/feed-generator.js` | ✅ バグ修正済み（後述） |
| `core/word-data.js` | ✅ Phase 0（1900語） |

### Phase 2: sim/ ✅ 実装完了・動作確認済み

| ファイル | 状態 |
|---|---|
| `sim/sim-runner.js` | ✅ リトライ新仕様対応済み |
| `sim/virtual-learner.js` | ✅ |
| `sim/scenarios.js` | ✅ シナリオ A〜D 定義済み |
| `sim/charts.js` | ✅ |
| `sim/sim.html` | ✅ |
| `sim/sim.js` | ✅ |
| `sim/sim.css` | ✅ |

### Phase 3: app/ ❌ 未実装

---

## 次セッションの作業：シナリオ実行と可視化

### 次にやること
1. **シナリオ A〜D をブラウザで実行・確認**
   - `python3 -m http.server 8080` を起動して `http://localhost:8080/sim/sim.html` で動作確認
   - 各シナリオの数値を記録・評価
2. **Phase 3: app/ の実装**（シミュレーション確認後）

---

## 今セッションで修正したバグ（重要）

### Bug 1: `_arrangeCards` による recognition 復習カードの無音消失【根本原因】

`feed-generator.js` の `_arrangeCards` で、`stage='recognition'` の復習カード（urgent/due プールから来る）が `cardType='recognition'` として生成されるが、`_interleaveIntroRecognition` は **intro とペアになった recognition だけを result に追加**し、単独の recognition 復習カードを**全て捨てていた**。

結果: 学習済み語の大半が recognition ステージに留まる状況でセッションが空になり、シミュレーションが完全停止。

**修正**（`feed-generator.js` L174付近）:
```javascript
// intro とペアでない recognition カード（復習）は recall と同列に配置
const introWordIds = new Set(intro.map(c => c.word.wordId));
const pairedRecognition = recognition.filter(c =>  introWordIds.has(c.word.wordId));
const reviewRecognition = recognition.filter(c => !introWordIds.has(c.word.wordId));
result.push(...urgentRecall);
this._interleaveIntroRecognition(result, intro, pairedRecognition, [...nonUrgentRecall, ...reviewRecognition]);
```

### Bug 2: リトライ二重更新（spec §4.5 改定）

**旧仕様**（バグ）: リトライ正解 → `h × β × α × cardWeight`（recall なら h × 0.6 と h が縮む）

**新仕様**: リトライ正解は「ダメージ回復」であって「成長」ではない
- 不正解 → `h × β`（ペナルティ確定）+ stage 降格
- リトライ正解 → h 更新なし・stage 降格をキャンセル
- 次の due セッションで正解したとき初めて h が伸びる

**修正**（`sim-runner.js` L29〜）:
- `processResponse` 前に `stageBeforeProcess = card.word.stage` を保存
- `card.isRetry && result !== 'wrong'` のとき `processResponse` をスキップし `word.stage = stageBeforeWrong` に復元
- リトライカードの `stageBeforeWrong` には降格前の stage（`stageBeforeProcess`）を設定

**spec.md §4.5 も更新済み**（「リトライの意味論」セクション追加）

### Bug 3: `stageBeforeWrong` 保存タイミング誤り

`processResponse`（降格後）の stage を保存していたため復元が無効だった。`stageBeforeProcess` を `processResponse` 呼び出し前に取得するよう修正。

---

## 修正後のシミュレーション実績（デフォルト設定）

| Day | 定着語数 | 学習済み | avgH | Wave |
|-----|--------|--------|------|------|
| 10  | ~20-24 | ~65-70 | ~11-13日 | [1,2] |
| 30  | ~96-102 | ~142-150 | ~23-27日 | [2-4] |
| 60  | ~170-190 | ~235-267 | ~31-36日 | [4-6] |
| 90  | ~205-271 | ~290-321 | ~34-47日 | [6-7] |

正解率 70〜80%、Wave は順次解放、h は継続的に成長。**新語保証スロットは不要**（due 飽和問題は Bug 1 の修正で解消）。

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
recognition 復習カードは `reviewRecognition` として recall と同列に配置（Bug 1 修正済み）。

### sim-runner.js（リトライ処理）
```
通常カード: processResponse 呼び出し（通常通り）
リトライ正解: word.stage = stageBeforeWrong（h 更新なし）
リトライ不正解: processResponse 呼び出し（さらにペナルティ）
stageBeforeWrong: processResponse 前の stageBeforeProcess を使用
```

### wave-manager.js
- 解放条件: `peakH >= waveUnlockH(2.0)` の語が 70%+
- 卒業判定: `h >= graduationH(8.0)` が 90%+
- 即時トリガー: generateSession 冒頭で毎回 checkUnlock

---

## バージョン管理

- ローカル git リポジトリ（`main` ブランチ）
- 初回コミット: `c983cf1` — Phase 1 & 2 全ファイル + 今セッションのバグ修正込み

---

## 動作確認コマンド

```bash
# シミュレーター実行テスト（UI なし）
cd /home/takahashihideki/dev/VocabFlow
node --input-type=module << 'EOF'
import { runSimulation } from './sim/sim-runner.js';
runSimulation({}, 90, (day, _, snap) => {
  if (day % 10 === 0) console.log(`Day ${day}: 定着=${snap.masteredCount} 学習済=${snap.learnedCount} waves=${JSON.stringify(snap.activeWaves)} avgH=${snap.avgH.toFixed(1)}`);
});
EOF

# ブラウザで sim を開く（要ローカルサーバー）
# cd /home/takahashihideki/dev/VocabFlow && python3 -m http.server 8080
# → http://localhost:8080/sim/sim.html
```

---

## Phase 3: app/ 実装予定（シミュレーション確認後）

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
├── .gitignore
├── core/
│   ├── config.js         # DEFAULT_CONFIG, createConfig()
│   ├── models.js         # WordState（peakH含む）, Card（isRetry/stageBeforeWrong）, LearnerState
│   ├── srs-engine.js     # SRSEngine（h更新・peakH・ステージ遷移・判定）
│   ├── wave-manager.js   # WaveManager（peakHベースwave解放・卒業）
│   ├── feed-generator.js # FeedGenerator（グリーディ割当・recognition復習修正済み）
│   └── word-data.js      # WORD_DATA(1900語), CATEGORIES
├── sim/
│   ├── sim-runner.js     # runSimulation(), runScenario()（リトライ新仕様）
│   ├── virtual-learner.js# VirtualLearner
│   ├── scenarios.js      # SCENARIOS A〜D
│   ├── charts.js         # SimCharts（Canvas描画）
│   ├── sim.html          # シミュレーターUI
│   ├── sim.js            # UI制御
│   └── sim.css
└── app/                  # 未実装
```
