# VocabFlow — CLAUDE.md（実装継続ガイド）

## プロジェクト概要

TikTok式縦スワイプUIで英語語彙を学ぶSRSアプリ。詳細仕様は `spec.md`（v3）、単語データ仕様は `word-data-spec.md` を参照。

---

## 現在の実装状況

### Phase 1: core/ ✅ 完了

| ファイル | 状態 |
|---|---|
| `core/config.js` | ✅ handwriteStuckThreshold: 3 に変更済み（旧 handwriteThresholdH 廃止） |
| `core/models.js` | ✅ WordState: stuckCount/needsHandwrite/skipped/excluded 追加。Card: done 追加。LearnerState: handwriteModeEnabled 追加 |
| `core/srs-engine.js` | ✅ Handwrite 停滞介入ロジック。昇格時のみ stuckCount リセット。handwrite はステージ遷移なし |
| `core/wave-manager.js` | ✅ Bug 5 修正済み |
| `core/feed-generator.js` | ✅ skipped 最優先プール（stage='new' フィルタより先）。excluded 語を全プールから除外。_assignCardType に learnerState 渡し |
| `core/word-data.js` | ✅ Phase 0（1900語） |

### Phase 2: sim/ ✅ 完了

| ファイル | 状態 |
|---|---|
| `sim/sim-runner.js` | ✅ Handwrite リトライ正解は h ブーストあり（通常リトライと分岐） |
| `sim/virtual-learner.js` | ✅ |
| `sim/scenarios.js` | ✅ シナリオ A〜D |
| `sim/charts.js` | ✅ 5チャート・Wave Heatmap・サマリーテーブル |
| `sim/sim.html` | ✅ |
| `sim/sim.js` | ✅ JSON エクスポート |
| `sim/sim.css` | ✅ |

### Phase 3: app/ ✅ プロトタイプ完成

| ファイル | 状態 |
|---|---|
| `app/app.html` | ✅ PC用前後ナビボタン・Word Wave overlay 追加 |
| `app/app.js` | ✅ スキップ・戻りスワイプ・履歴ビュー。WordWaveRenderer 統合（ヘッダバークリックで開く） |
| `app/ui-cards.js` | ✅ renderHistoryView()・animateOutDown()・_animateInFromTop() 追加 |
| `app/ui-heatmap.js` | ✅ excluded 語の色追加 |
| `app/ui-wordwave.js` | ✅ Word Wave 全画面ビュー（wordwave-spec.md 準拠）。単語除外・一括除外モード対応 |
| `app/app.css` | ✅ 前後アニメーション・PC ナビボタン・Word Wave スタイル |

---

## 次セッションの残タスク

1. **実データ作成**（`core/word-data.js` の充実。phonetic・例文・JP意味などを含む本番データへ）
2. **#10** Passive カードの読み物化（`app/ui-cards.js` の UI のみ。spec §2 参照）

---

## 修正済みバグ一覧（全セッション通算）

### Bug 1: recognition 復習カードの無音消失
`_arrangeCards` で intro とペアでない recognition 復習カードが全て捨てられていた。
`reviewRecognition` を recall と同列配置することで修正（`feed-generator.js`）。

### Bug 2: リトライ二重更新
リトライ正解時も `processResponse` を呼んで h が縮小していた。
新仕様: リトライ正解 = ダメージ回復（h 更新なし、stage 降格のみキャンセル）。

### Bug 3: `stageBeforeWrong` 保存タイミング誤り
`processResponse` 降格後の stage を保存していた。`processResponse` 呼び出し前に取得するよう修正。

### Bug 4: mastered 語レビュー漏れ
mastered 語が `p < targetRetention(0.85)` かつ `p >= 0.5` のとき due/urgent どちらにも入らず
最大40日間レビューされなかった。p < targetRetention なら `due` に追加して最適タイミングで維持するよう修正
（`feed-generator.js` `_buildCandidatePools`）。

### Bug 5: Wave unlock 分母誤り
`_meetsUnlockCondition` の分母が全語数（new 語含む）のため、review 過負荷で新語導入ができない
状況で Wave unlock が永遠に達成できなかった。導入済み語のみを母数にするよう修正
（`wave-manager.js`）。

### Bug 6: Intro-Recognition 間隔ゼロ（今セッション）
`_interleaveIntroRecognition` でフィラーが足りない場合（初回セッション等）、
Intro の直後に Recognition が連続し、短期記憶で正解できてしまっていた。
キュー方式（`readyAt = 現位置 + MIN_GAP`）に書き直し、フィラー不足時は後続 Intro 自身を
スペーサーとして活用することで最低 gap=2 を保証（デフォルト5新語時は gap≥4）。
（`feed-generator.js` `_interleaveIntroRecognition`）。

---

## シミュレーション実績（Bug 4・5 修正後、デフォルト設定）

| Day | 定着語数 | 学習済み | avgH | Wave |
|-----|--------|--------|------|------|
| 30  | ~90-100 | ~135-145 | ~25日 | [2,3] |
| 60  | ~175-210 | ~230-250 | ~75-80日 | [5,6] |
| 90  | ~265-295 | ~305-330 | ~115-120日 | [7,8] |
| 180 | ~530-560 | ~565-590 | ~200日 | [11-13] |
| 363 | ~1000 | ~1030 | ~270日 | [21-22] |

正解率 75〜85%、Wave は順次解放、**1000語定着が Day 363 で到達**。

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
skipped（最優先） → urgent（pRecall昇順） → due（pRecall昇順） → new（先着順） → uncertain（sigma降順） → filler（ランダム）
早期終了: skipped=urgent=due=new=0 なら [] を返す
```
- skipped 語は stage='new' フィルタより先に評価（逃げ切り不可）
- excluded 語は new プール含む全プールから除外（`w.excluded` チェック）
- recognition 復習カードは `reviewRecognition` として recall と同列配置（Bug 1）
- mastered 語が `p < targetRetention` なら due プールに追加（Bug 4）
- `_interleaveIntroRecognition`: キュー方式で Intro→Recognition 間 MIN_GAP=2 を保証（Bug 6）

### wave-manager.js
- 解放条件: 導入済み語のうち `peakH >= waveUnlockH(2.0)` が 70%+（Bug 5）
- 卒業判定: `h >= graduationH(8.0)` が 90%+
- 即時トリガー: generateSession 冒頭で毎回 checkUnlock

### app/ インタラクティブプロトタイプ
- スワイプジェスチャー: タッチ（40px上下スワイプ）・ホイール・キーボード（↑↓/Space）
- PC環境（タッチ非対応）: ↑↓ 円形ボタンを右下に表示（pc-nav-btns.visible）。body.no-touch でスワイプヒント非表示
- スキップ: 未回答状態でスワイプアップ → word.skipped=true。次セッションで最優先
- 戻りスワイプ: スキップ済み未回答カードは再表示（done/skippedをリセットして再出題）。回答済みは履歴ビュー（読み取り専用）
- カードが回答済みになると `onReady(result)` が呼ばれ、スワイプ可能化（次ボタンは常時クリック可）
- 時間早送り: 次のセッション(1/3日)・翌日・1週間後
- localStorage キー: `vocabflow_state_v1`
- 日本語意味辞書: `app/ui-cards.js` の `JP_MEANINGS`（Wave 1〜2 約100語）。Wave 3以降はフォールバック表示。
- Word Wave: `app/ui-wordwave.js`。ヘッダバークリックで全画面表示。単語タップでポップオーバー（除外ボタン付き）。一括除外モード（🗑️）対応。

### sim-runner.js（リトライ処理）
```
通常カード: processResponse 呼び出し（通常通り）
リトライ正解（handwrite以外）: word.stage = stageBeforeWrong（h 更新なし）
リトライ正解（handwrite）: processResponse 呼び出し（h ブーストあり・停滞突破）
リトライ不正解: processResponse 呼び出し（さらにペナルティ）
stageBeforeWrong: processResponse 前の stageBeforeProcess を使用
```
スナップショットには10日ごとに `heatmapData`（全語のh値配列）を保存。

---

## バージョン管理

- ローカル git リポジトリ（`main` ブランチ）
- 直近コミット: Word Wave 全画面ビュー実装（`01ad588`）

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

# ブラウザで開く（要ローカルサーバー）
# cd /home/takahashihideki/dev/VocabFlow && python3 -m http.server 8080
# → http://localhost:8080/sim/sim.html   （シミュレーター）
# → http://localhost:8080/app/app.html   （インタラクティブプロトタイプ）
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
│   ├── feed-generator.js # FeedGenerator（グリーディ割当・Intro-Recog gap保証済み）
│   └── word-data.js      # WORD_DATA(1900語), CATEGORIES
├── sim/
│   ├── sim-runner.js     # runSimulation(), runScenario()（heatmapData保存対応）
│   ├── virtual-learner.js# VirtualLearner
│   ├── scenarios.js      # SCENARIOS A〜D
│   ├── charts.js         # SimCharts（5チャート・Heatmapスライダー・サマリーテーブル）
│   ├── sim.html          # シミュレーターUI
│   ├── sim.js            # UI制御・JSONエクスポート
│   └── sim.css
└── app/
    ├── app.html          # エントリーポイント
    ├── app.js            # セッション管理・スワイプ・時間早送り・localStorage
    ├── ui-cards.js       # 6種カードUI・TTS・JP意味辞書（Wave1-2）
    ├── ui-heatmap.js     # Wave Heatmap Canvas描画
    ├── ui-wordwave.js    # Word Wave 全画面ビュー（除外・一括除外）
    └── app.css           # ダークテーマ・アニメーション・Word Wave スタイル
```
