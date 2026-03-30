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
| `core/wave-manager.js` | ✅ Bug 5 修正済み（unlock 判定を導入済み語のみ対象に） |
| `core/feed-generator.js` | ✅ Bug 1・4 修正済み |
| `core/word-data.js` | ✅ Phase 0（1900語） |

### Phase 2: sim/ ✅ 完了・シナリオ実行確認済み

| ファイル | 状態 |
|---|---|
| `sim/sim-runner.js` | ✅ リトライ新仕様・heatmapData スナップショット対応済み |
| `sim/virtual-learner.js` | ✅ |
| `sim/scenarios.js` | ✅ シナリオ A〜D 定義済み |
| `sim/charts.js` | ✅ 5チャート・Wave Heatmap スライダー・サマリーテーブル |
| `sim/sim.html` | ✅ |
| `sim/sim.js` | ✅ JSON エクスポートボタン実装済み |
| `sim/sim.css` | ✅ |

### Phase 3: app/ ❌ 未実装 ← **次セッションはここから**

---

## 次セッションの作業：Phase 3 インタラクティブプロトタイプ

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

## 修正済みバグ一覧（全セッション通算）

### Bug 1: recognition 復習カードの無音消失（前セッション）
`_arrangeCards` で intro とペアでない recognition 復習カードが全て捨てられていた。
`reviewRecognition` を recall と同列配置することで修正（`feed-generator.js`）。

### Bug 2: リトライ二重更新（前セッション）
リトライ正解時も `processResponse` を呼んで h が縮小していた。
新仕様: リトライ正解 = ダメージ回復（h 更新なし、stage 降格のみキャンセル）。

### Bug 3: `stageBeforeWrong` 保存タイミング誤り（前セッション）
`processResponse` 降格後の stage を保存していた。`processResponse` 呼び出し前に取得するよう修正。

### Bug 4: mastered 語レビュー漏れ（今セッション）
mastered 語が `p < targetRetention(0.85)` かつ `p >= 0.5` のとき due/urgent どちらにも入らず
最大40日間レビューされなかった。p < targetRetention なら `due` に追加して最適タイミングで維持するよう修正
（`feed-generator.js` `_buildCandidatePools`）。

### Bug 5: Wave unlock 分母誤り（今セッション）
`_meetsUnlockCondition` の分母が全語数（new 語含む）のため、review 過負荷で新語導入ができない
状況で Wave unlock が永遠に達成できなかった。導入済み語のみを母数にするよう修正
（`wave-manager.js`）。

---

## シミュレーション実績（Bug 4・5 修正後、デフォルト設定）

| Day | 定着語数 | 学習済み | avgH | Wave |
|-----|--------|--------|------|------|
| 30  | ~90-100 | ~135-145 | ~25日 | [2,3] |
| 60  | ~175-210 | ~230-250 | ~75-80日 | [5,6] |
| 90  | ~265-295 | ~305-330 | ~115-120日 | [7,8] |
| 180 | ~530-560 | ~565-590 | ~200日 | [11-13] |
| 363 | ~1000 | ~1030 | ~270日 | [21-22] |

正解率 75〜85%、Wave は順次解放、**1000語定着が Day 363 で到達**（修正前は未到達）。

### Scenario A 結果（maxNewPerSession, Day 90）
maxNew=5（デフォ）: 定着 286語 / avgH=117日 / 正解率 78%。
maxNew=5〜7 が最適バランス。

### Scenario B 結果（alpha, Day 90）
alpha=2.0（デフォ）: 定着 269語 / avgH=117日。
alpha が最重要パラメータ。alpha=1.5 では90日で定着 112語にとどまる。

### Scenario D 結果（waveSize × waveUnlockRatio, Day 180）
デフォルト(50/0.7): 定着 543語。waveSize/ratio の影響は小（±60語程度）。

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
- recognition 復習カードは `reviewRecognition` として recall と同列配置（Bug 1）
- mastered 語が `p < targetRetention` なら due プールに追加（Bug 4）

### wave-manager.js
- 解放条件: 導入済み語のうち `peakH >= waveUnlockH(2.0)` が 70%+（Bug 5）
- 卒業判定: `h >= graduationH(8.0)` が 90%+
- 即時トリガー: generateSession 冒頭で毎回 checkUnlock

### sim-runner.js（リトライ処理）
```
通常カード: processResponse 呼び出し（通常通り）
リトライ正解: word.stage = stageBeforeWrong（h 更新なし）
リトライ不正解: processResponse 呼び出し（さらにペナルティ）
stageBeforeWrong: processResponse 前の stageBeforeProcess を使用
```
スナップショットには10日ごとに `heatmapData`（全語のh値配列）を保存。

---

## バージョン管理

- ローカル git リポジトリ（`main` ブランチ）
- 直近コミット: `7020809` — JSON エクスポートボタン追加

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
│   ├── wave-manager.js   # WaveManager（導入済み語ベースのwave解放・卒業）
│   ├── feed-generator.js # FeedGenerator（グリーディ割当・mastered due修正済み）
│   └── word-data.js      # WORD_DATA(1900語), CATEGORIES
├── sim/
│   ├── sim-runner.js     # runSimulation(), runScenario()（heatmapData保存対応）
│   ├── virtual-learner.js# VirtualLearner
│   ├── scenarios.js      # SCENARIOS A〜D
│   ├── charts.js         # SimCharts（5チャート・Heatmapスライダー・サマリーテーブル）
│   ├── sim.html          # シミュレーターUI
│   ├── sim.js            # UI制御・JSONエクスポート
│   └── sim.css
└── app/                  # ← 次セッションで実装
```
