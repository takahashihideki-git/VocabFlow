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
| `core/word-data.js` | ✅ 1900語・18カテゴリ分類済み（categoryId 全語確定） |
| `core/labels.js` | ✅ LABELS定数・formatH/formatPRecall/sigmaToConfidence。app/ 全体で使用 |

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
| `app/app.js` | ✅ スキップ・戻りスワイプ・履歴ビュー。WordWaveRenderer 統合。時間進行ボタンラベルを LABELS.session から設定 |
| `app/ui-cards.js` | ✅ renderHistoryView()・animateOutDown()・_animateInFromTop() 追加。_typeName() を LABELS.cardTypes に統合 |
| `app/ui-heatmap.js` | ✅ excluded 語の色追加。ツールチップ h 表示を formatH・LABELS に統合 |
| `app/ui-wordwave.js` | ✅ Word Wave 全画面ビュー。単語除外・一括除外モード対応。ポップオーバー行ラベルを LABELS.params・formatH に統合 |
| `app/app.css` | ✅ 前後アニメーション・PC ナビボタン・Word Wave スタイル |

---

## 次セッションの残タスク

### 🔴 最優先: 教材データ生成（バッチ作業、継続中）

**進捗: バッチ 1〜2 完了（id 1〜40）/ 残り バッチ 3〜95（id 41〜1900）**

#### 作業方法（会話内で直接生成）

Claude Code のコンテキスト内で JSON を直接生成し、スクリプトで保存・検証する方式。
API キー不要。1セッションで約 2〜3 バッチ（40〜60語）処理できる。

**次回セッションで最初に言うこと:**
> 「CLAUDE.md を確認して、教材データ生成の続きをお願いします。バッチ3（id 41〜60）から」

#### バッチ進捗表

| バッチ | id 範囲 | 状態 | ファイル |
|---|---|---|---|
| 001 | 1〜20 | ✅ 完了 | `scripts/results/word_data/batch_001.json` |
| 002 | 21〜40 | ✅ 完了 | `scripts/results/word_data/batch_002.json` |
| 003 | 41〜60 | ✅ 完了 | `scripts/results/word_data/batch_003.json` |
| 004 | 61〜80 | ✅ 完了 | `scripts/results/word_data/batch_004.json` |
| … | … | ⬜ | — |
| 095 | 1881〜1900 | ⬜ 未着手 | — |

#### バッチ生成手順（Claude への指示）

1. `scripts/results/all_results.json` から対象バッチの単語（20語）と `categoryId` を読む
2. `word-data-spec.md` §2.1 の完全スキーマ（全フィールド）で JSON 配列を生成する
   - `passive` フィールド（etymology/tips/confusables/collocations/trivia）を必ず含める
   - `distractors` は同カテゴリの他単語の意味から選ぶ（後で `fix_distractors.py` で差し替え）
3. `scripts/results/word_data/batch_NNN.json` に保存
4. `python3 scripts/validate_word_data.py scripts/results/word_data/batch_NNN.json` で検証

#### 全バッチ完了後の仕上げ手順

```bash
python3 scripts/fix_distractors.py       # distractors を実単語意味で差し替え
python3 scripts/validate_word_data.py    # 全体バリデーション
python3 scripts/build_word_data_js.py    # core/word-data.js ビルド
```

---

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

### core/labels.js（UIラベル一元管理）
- `LABELS`: params / pools / cardTypes / stages / session / wordwave / heatmap の定数オブジェクト
- `formatH(h)`: h（日）→ 人間可読文字列（例: 12.3日、3.1ヶ月、1.2年）
- `formatPRecall(p)`: 0〜1 → パーセント文字列
- `sigmaToConfidence(sigma)`: σ → 高/中/低
- 仕様書: `ui-labels-spec.md`

### app/ インタラクティブプロトタイプ
- スワイプジェスチャー: タッチ（40px上下スワイプ）・ホイール・キーボード（↑↓/Space）
- PC環境（タッチ非対応）: ↑↓ 円形ボタンを右下に表示（pc-nav-btns.visible）。body.no-touch でスワイプヒント非表示
- スキップ: 未回答状態でスワイプアップ → word.skipped=true。次セッションで最優先
- 戻りスワイプ: スキップ済み未回答カードは再表示（done/skippedをリセットして再出題）。回答済みは履歴ビュー（読み取り専用）
- カードが回答済みになると `onReady(result)` が呼ばれ、スワイプ可能化（次ボタンは常時クリック可）
- 時間早送り: 次のセッション(1/3日)・翌日・1週間後。ボタンラベルは `LABELS.session.timeForward1/2/3`
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
- 直近コミット: UIラベル一元管理 core/labels.js 追加・app/ 統合

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
├── classification-spec.md# カテゴリ分類作業仕様書（18カテゴリ体系・作業フロー）
├── .gitignore
├── scripts/              # 分類作業スクリプト群
│   ├── batch_extract.py  # 1900語→20語×95バッチ分割
│   ├── classify_all.py   # 全1900語のcategoryId定義（AI判定済み）
│   ├── merge_validate.py # 分類結果の検証・レポート
│   ├── integrate.py      # 分類結果→word-data.js 統合
│   ├── generate_report.py# カテゴリ別単語一覧レポート生成
│   ├── results/
│   │   └── all_results.json  # 全1900語の分類結果（中間成果物）
│   └── category_report.md    # カテゴリ別単語一覧（人手確認用）
├── core/
│   ├── config.js         # DEFAULT_CONFIG, createConfig()
│   ├── models.js         # WordState（peakH含む）, Card（isRetry/stageBeforeWrong）, LearnerState
│   ├── srs-engine.js     # SRSEngine（h更新・peakH・ステージ遷移・判定）
│   ├── wave-manager.js   # WaveManager（導入済み語ベースのwave解放・卒業）
│   ├── feed-generator.js # FeedGenerator（グリーディ割当・Intro-Recog gap保証済み）
│   ├── word-data.js      # WORD_DATA(1900語), CATEGORIES
│   └── labels.js         # LABELS定数・formatH/formatPRecall/sigmaToConfidence（ui-labels-spec.md準拠）
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
