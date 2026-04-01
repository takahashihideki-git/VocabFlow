# VocabFlow — CLAUDE.md（実装継続ガイド）

## プロジェクト概要

TikTok式縦スワイプUIで英語語彙を学ぶSRSアプリ。詳細仕様は `spec.md`（v3）、単語データ仕様は `word-data-spec.md` を参照。

---

## 現在の実装状況

### Phase 1: core/ ✅ 完了

| ファイル | 状態 |
|---|---|
| `core/config.js` | ✅ handwriteStuckThreshold: 3・recognitionThresholdH: 2.0・masteredThresholdH: 14.0 追加済み |
| `core/models.js` | ✅ WordState: stuckCount/needsHandwrite/skipped/excluded 追加。Card: done 追加。LearnerState: handwriteModeEnabled 追加 |
| `core/srs-engine.js` | ✅ Handwrite 停滞介入ロジック。昇格時のみ stuckCount リセット。handwrite はステージ遷移なし |
| `core/wave-manager.js` | ✅ Bug 5 修正済み |
| `core/feed-generator.js` | ✅ skipped 最優先プール（stage='new' フィルタより先）。excluded 語を全プールから除外。_assignCardType に learnerState 渡し |
| `core/word-data.js` | ✅ 全1900語フルデータ（meanings/examples/passive等）。`scripts/build_word_data_js.py` でビルド済み |
| `core/labels.js` | ✅ LABELS定数・formatH/formatPRecall/sigmaToConfidence。app/ 全体で使用 |
| `core/category-images.js` | ✅ Unsplash 画像URL（scripts/fetch_category_images.js で自動生成、19カテゴリ×10枚） |

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
| `app/app.html` | ✅ PC用前後ナビボタン・Word Wave overlay。ヘッダーに Day N 表示 |
| `app/app.js` | ✅ スキップ・戻りスワイプ・履歴ビュー。WordWaveRenderer 統合。passive-scroll とのスワイプ干渉修正済み |
| `app/ui-cards.js` | ✅ 6種カードUI・TTS。全1900語の生成データを統合済み（getMeaning/getExample → WORD_DATA参照）。Passive カードはリッチUI（語源・コツ・コロケーション・豆知識）。戻り時もリッチビューを再表示 |
| `app/ui-heatmap.js` | ✅ excluded 語の色追加。ツールチップ h 表示を formatH・LABELS に統合 |
| `app/ui-wordwave.js` | ✅ Word Wave 全画面ビュー。単語除外・一括除外モード対応。ポップオーバーに pRecall・最終復習日追加 |
| `app/ui-background.js` | ✅ BackgroundManager（getUrl/preload）。CATEGORY_IMAGES からカテゴリ別ランダム画像URL取得 |
| `app/app.css` | ✅ 前後アニメーション・PC ナビボタン・Word Wave スタイル。カード 9:16 aspect-ratio・Passive リッチUIスタイル（passive-scroll / passive-section / collocation-chip） |

---

## 次セッションの残タスク

### 🔴 優先: スタイルチューニング（可読性向上）

主にフォントサイズまわりを中心に、全カード種別の可読性を高める。

#### 作業方針
1. **スタイル確認用モックアップ HTML を作成**（`app/style-mockup.html`）
   - 6種カード（intro / recognition / recall / dictation / handwrite / passive）を1ページに並べて静的表示
   - ローカルサーバー不要・`app.css` を直接 link して即確認できる
   - CSS 変更のフィードバックループを短縮するのが目的

2. **`app/app.css` のフォントサイズ調整**
   - チューニング対象の主要クラス:
     - `.word-main` — 単語（現 `clamp(32px, 8vw, 52px)`）
     - `.word-meaning` — 日本語意味（現 `18px`）
     - `.word-example` — 例文（現 `14px`）
     - `.choice-btn` — 選択肢ボタン（現 `14px`）
     - `.passive-section-body` — passive 本文（現 `13px`）
     - `.passive-section-title` — passive セクション見出し（現 `10px`）
   - モックアップで確認しながら調整する

---

## 教材データ生成（✅ 完了）

全95バッチ（1900語）の生成・検証・ビルドが完了。

```bash
# 再ビルドが必要な場合
python3 scripts/fix_distractors.py       # distractors を実単語意味で差し替え
python3 scripts/validate_word_data.py scripts/results/word_data_fixed.json
python3 scripts/build_word_data_js.py    # core/word-data.js ビルド
```

中間ファイル:
- `scripts/results/word_data/batch_001〜095.json` — バッチ別生成データ
- `scripts/results/word_data_raw.json` — 全バッチ統合（生データ）
- `scripts/results/word_data_fixed.json` — distractors差し替え・sanitize済み

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

### Bug 6: Intro-Recognition 間隔ゼロ
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
- recognition → recall: h ≥ recognitionThresholdH (2.0日)
- recall → dictation: h ≥ dictationThresholdH (4.0日)
- 定着済み: dictation クリア かつ h ≥ masteredThresholdH (14.0日)
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

### カード背景画像（Unsplash）
- `core/category-images.js`: 19カテゴリ × 10枚の画像URL定数（Unsplash License）
- 再取得: `node scripts/fetch_category_images.js YOUR_ACCESS_KEY`（19リクエスト、Demo枠50req/h内）
- `app/ui-background.js`: `BackgroundManager` — `getUrl(categoryId)` でランダムURL取得、`preload(ids)` でセッション開始時プリフェッチ
- カード表示: `.card-bg` div（`z-index:-1`）に `background-image` 設定 + `::after` 疑似要素で暗幕（rgba 8,8,18,0.72）
- カードは 9:16 aspect-ratio（縦動画を意識）。`width: min(100%, 高さ×9/16)` で画面に収まる

### app/ インタラクティブプロトタイプ
- スワイプジェスチャー: タッチ（40px上下スワイプ）・ホイール・キーボード（↑↓/Space）
- PC環境（タッチ非対応）: ↑↓ 円形ボタンを右下に表示（pc-nav-btns.visible）。body.no-touch でスワイプヒント非表示
- スキップ: 未回答状態でスワイプアップ → word.skipped=true。次セッションで最優先
- 戻りスワイプ: スキップ済み未回答カードは再表示（done/skippedをリセットして再出題）。回答済みは履歴ビュー（読み取り専用）
- カードが回答済みになると `onReady(result)` が呼ばれ、スワイプ可能化（次ボタンは常時クリック可）
- 時間早送り: 次のセッション(1/3日)・翌日・1週間後。ボタンラベルは `LABELS.session.timeForward1/2/3`
- localStorage キー: `vocabflow_state_v1`
- Word Wave: `app/ui-wordwave.js`。ヘッダバークリックで全画面表示。単語タップでポップオーバー（pRecall・最終復習日・除外ボタン付き）。一括除外モード（🗑️）対応。
- Handwrite カード: 音声を聞いて紙に手書き10回 → カメラ/ギャラリーで写真送信 → AI OCRモック（文字スキャン風に表示）→ 常に perfect 判定で h ブースト

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
- 直近コミット: 全1900語の生成データをプロトタイプに統合・Passive カードをリッチUI化（ceb24f5）

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
├── scripts/              # 各種スクリプト群
│   ├── batch_extract.py         # 1900語→20語×95バッチ分割
│   ├── classify_all.py          # 全1900語のcategoryId定義（AI判定済み）
│   ├── generate_word_data.py    # Claude API で教材データ一括生成（✅ 全95バッチ完了）
│   ├── fix_distractors.py       # distractors を実単語意味で差し替え
│   ├── validate_word_data.py    # バリデーション
│   ├── build_word_data_js.py    # core/word-data.js ビルド
│   ├── fetch_category_images.js # Unsplash API から画像URL取得→category-images.js生成
│   ├── results/
│   │   ├── all_results.json         # 全1900語の分類結果
│   │   ├── word_data/batch_001〜095.json  # バッチ別生成データ
│   │   ├── word_data_raw.json       # 全バッチ統合（生データ）
│   │   └── word_data_fixed.json     # distractors差し替え・sanitize済み
│   └── category_report.md       # カテゴリ別単語一覧（人手確認用）
├── core/
│   ├── config.js            # DEFAULT_CONFIG, createConfig()
│   ├── models.js            # WordState（peakH含む）, Card（isRetry/stageBeforeWrong）, LearnerState
│   ├── srs-engine.js        # SRSEngine（h更新・peakH・ステージ遷移・判定）
│   ├── wave-manager.js      # WaveManager（導入済み語ベースのwave解放・卒業）
│   ├── feed-generator.js    # FeedGenerator（グリーディ割当・Intro-Recog gap保証済み）
│   ├── word-data.js         # WORD_DATA(1900語フルデータ), CATEGORIES（build_word_data_js.pyで生成）
│   ├── labels.js            # LABELS定数・formatH/formatPRecall/sigmaToConfidence（ui-labels-spec.md準拠）
│   └── category-images.js   # Unsplash画像URL（fetch_category_images.jsで自動生成）
├── sim/
│   ├── sim-runner.js     # runSimulation(), runScenario()（heatmapData保存対応）
│   ├── virtual-learner.js# VirtualLearner
│   ├── scenarios.js      # SCENARIOS A〜D
│   ├── charts.js         # SimCharts（5チャート・Heatmapスライダー・サマリーテーブル）
│   ├── sim.html          # シミュレーターUI
│   ├── sim.js            # UI制御・JSONエクスポート
│   └── sim.css
└── app/
    ├── app.html          # エントリーポイント（Word Wave Day N 表示）
    ├── app.js            # セッション管理・スワイプ・時間早送り・localStorage
    ├── ui-cards.js       # 6種カードUI・TTS・Handwrite写真送信＋AI OCRモック。全1900語の生成データ統合済み
    ├── ui-heatmap.js     # Wave Heatmap Canvas描画
    ├── ui-wordwave.js    # Word Wave 全画面ビュー（pRecall・最終復習日・除外・一括除外）
    ├── ui-background.js  # BackgroundManager（カテゴリ別Unsplash背景画像）
    ├── app.css           # ダークテーマ・アニメーション・Word Wave・9:16カード・Passive リッチUI
    └── style-mockup.html # （次セッションで作成）スタイル確認用モックアップ（6種カードを静的表示）
```
