# VocabFlow — CLAUDE.md（実装継続ガイド）

## プロジェクト概要

TikTok式縦スワイプUIで英語語彙を学ぶSRSアプリ。詳細仕様は `spec.md`（v3）、単語データ仕様は `word-data-spec.md` を参照。

**アプリ表示名: 「Word Wave」**（ロゴ・タイトル等のユーザー向け表示）
**開発コードネーム: 「VocabFlow」**（ファイル名・クラス名・localStorage キー等はそのまま）

---

## 現在の実装状況

### Phase 1: core/ ✅ 完了

| ファイル | 状態 |
|---|---|
| `core/config.js` | ✅ handwriteStuckThreshold: 3・recognitionThresholdH: 2.0・masteredThresholdH: 14.0 追加済み。`maxActiveWaves` 撤廃（wave 解放はSRSペースに委ねる） |
| `core/models.js` | ✅ WordState: stuckCount/needsHandwrite/skipped/excluded/passiveCursor 追加。Card: done/userAnswer/shuffledChoices/bgUrl/passiveSection 追加。LearnerState: handwriteModeEnabled・savedAt 追加 |
| `core/srs-engine.js` | ✅ Handwrite 停滞介入ロジック。昇格時のみ stuckCount リセット。handwrite はステージ遷移なし |
| `core/wave-manager.js` | ✅ Bug 5 修正済み。`maxActiveWaves` 上限撤廃（解放条件ゲートのみで制御） |
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
| `app/app.html` | ✅ PC用前後ナビボタン・Word Wave overlay。ヘッダーに Day N 表示。アプリ表示名「Word Wave」。`#toast` 要素追加。スタート画面タグラインを動的グリーティングに変更（3dot loading アニメーション付き）。wave全mastered達成オーバーレイ（`#overlay-wavecomplete`）追加。`#pc-nav-btns` を `#card-wrapper` 内に移動（カード右端近くに配置）。セッション完了画面: btn-primary（続ける）を time-controls の上に配置。**`#heatmap-section` を `#app` 外（body直下）に移動し常時表示**。`#card-area`・`#footer` は boot まで `display:none` |
| `app/app.js` | ✅ スキップ・戻りスワイプ・履歴ビュー。WordWaveRenderer 統合。passive-scroll とのスワイプ干渉修正済み。トースト通知・回答確定時SRS処理（`_onCardAnswered`）・カード遷移時TTS停止。スタート画面動的グリーティング。**実時間追跡**（`_boot()` で `savedAt` 差分を `currentTime` に加算）。**復習なし画面**を card-wrapper に直接注入（ヘッダ/フッタ維持・待機時間表示・更新ボタンを time-controls 上に配置）。**Intro/Passive を正解・不正解カウントから除外**。**wave全mastered達成オーバーレイ**（`_checkWaveComplete`・`_showWaveComplete`、Wave 1/中間/最終波でメッセージ分岐）。**Wave 表示**はセッション中 intro カードも考慮した最大 waveNumber。**wave トースト**は「そのwaveの最初の intro カードがセッションに登場した瞬間」に発火。**復習なし画面**で innerHTML 置換前に pc-nav-btns を退避・復元（時間早送り後の btn-next-card null エラー修正）。**`_initHeatmapEarly()`**: constructor で localStorage から state を早期ロードしヒートマップ・WordWaveRenderer を初期化（`requestAnimationFrame` で初回描画・スタート画面でも Waves 閲覧・除外操作が可能）。`_buildStartGreeting()` は `this.state` を再利用（localStorage 二重パース廃止） |
| `app/ui-cards.js` | ✅ 6種カードUI・TTS。全1900語の生成データを統合済み。**Passive カードは1回に1セクションをローテーション表示**（`WordState.passiveCursor` で管理、`Card.passiveSection` に確定値を保存して履歴ビューでも再現）。collocations チップは Google 検索リンク（`<a>`）。履歴ビュー完全再現（元 render メソッド流用・インタラクション無効化）。Intro/Recall に日本語訳トグル追加。Recognition 回答後に単語TTS・Recall 回答後に例文TTS。**Recall 回答後に `blankAnswer`（活用形）で例文を完成表示**（選択タップ時に差し替え・履歴ビューも対応） |
| `app/ui-heatmap.js` | ✅ excluded 語の色追加。ツールチップ h 表示を formatH・LABELS に統合 |
| `app/ui-wordwave.js` | ✅ Word Wave 全画面ビュー。単語除外・一括除外モード対応。ポップオーバーに pRecall・最終復習日追加。Wave 表示を学習済み最大波番号に統一 |
| `app/ui-background.js` | ✅ BackgroundManager（getUrl/preload）。CATEGORY_IMAGES からカテゴリ別ランダム画像URL取得 |
| `app/app.css` | ✅ 前後アニメーション・PC ナビボタン・Word Wave スタイル。タッチ環境ではカードをフルスクリーン表示（`body.no-touch` で 9:16 維持）。フォントサイズ引き上げ（choice-btn/passive-section-body: 16px、passive-section-title: 13px、collocation-chip: 16px）。`overscroll-behavior: none` で iOS バウンス無効化。Passive リッチUIスタイル。日本語訳トグルスタイル。トーストスタイル。nowork-card・wc-card・oc-sectionスタイル追加。`#pc-nav-btns` を `right: -14px` で card-wrapper 右端近くに配置。`.choice-btn:hover` を `body.no-touch` にスコープ限定（iOS でのホバー貼り付き防止）。`.collocation-chip` に `color: inherit; text-decoration: none`（`<a>` タグ対応）。**`body` を `flex-direction:column` に・`#app` を `flex:1` に変更**（heatmap 常時表示レイアウト対応）。**`#start-screen` / `.overlay` の `top` を `var(--heatmap-h)` に変更**してヒートマップを隠さないよう調整 |
| `app/style-mockup.html` | ✅ 6種カード・画面遷移（スタート/セッション完了/復習なし）・ヘッダ/フッタを静的表示するスタイル確認用モックアップ。復習なし画面はヘッダ+カード+フッタのフルレイアウト（`.mockup-phone-frame`）で表示。Passive カードは1セクション1カードのローテーション例を3カラムで表示 |

---

## 次セッションの残タスク

特になし。随時発生する改善・バグ修正を対応する。

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

### Bug 7: Recall 回答後も例文に原形が表示される
選択肢は原形（`publish`）で統一しているが、回答後の例文も原形のままで文法的に不自然だった。
回答タップ時に `.word-example` を `example.full`（`blankAnswer` をハイライトした完成文）に差し替え。
履歴ビューでは `card.userAnswer` が既存の場合に初期描画から完成文を表示。
（`app/ui-cards.js` `_renderRecall`）。

### Bug 9: 復習なし画面で時間早送りボタンを押すと btn-next-card null エラー
`_showNoWork()` が `card-wrapper.innerHTML` を丸ごと置換するため、その中にある
`#pc-nav-btns`（`btn-next-card`/`btn-prev-card`）が消滅。直後に `_startSession` →
`_showCard` で `getElementById('btn-next-card')` が null になりクラッシュ。
`innerHTML` 置換前に `pc-nav-btns` DOM ノードを変数に退避し、置換後に `appendChild`
で復元することで修正（元のイベントリスナーも維持）。
（`app/app.js` `_showNoWork`）。

### Bug 10: wave 解放トーストが出ない・wave 表示が遅れる
wave トーストを `waveUnlockEvents` 差分（checkUnlock 呼び出し時）で発火していたため、
wave が解放済みでも最初の単語がセッションに登場した際に通知されなかった。
また `_updateStats` の wave 番号計算が `state.words` の stage のみを参照するため、
セッション開始直後（intro カードがまだ stage='new'）は正しい波番号が表示されなかった。
対策: セッション開始前の `maxStudiedWaveBefore` と生成カードの intro 比較でトーストを発火。
`_updateStats` でセッション中の intro カード（stage='new'）の waveNumber も加算。
（`app/app.js` `_startSession` / `_updateStats`）。

### Bug 11: ヒートマップがページロード時に表示されない・Wavesリンクが機能しない
`#heatmap-section` を `#app` 外に移動して常時表示にした際の2つの問題。
① `HeatmapRenderer` を constructor 内で初期化すると canvas の `offsetWidth` が 0 のため描画がスキップされ、ウィンドウリサイズ後に初めて表示されていた。`requestAnimationFrame` でレイアウト確定後に初回 `render()` を呼ぶことで修正。
② `this.wordWave` が `_boot()` まで null のため、スタート画面でのヒートマップクリックが no-op だった。`_initHeatmapEarly()` で localStorage から state を早期ロードし `WordWaveRenderer` も同時初期化することで修正。除外操作は `_saveState()` で即保存されるため `_boot()` 時の state にも反映される。
（`app/app.js` `_initHeatmapEarly` / `app/app.html` / `app/app.css`）。

### Bug 8: 復習なし画面の待機時間が減らないように見える
`_calcWaitHours()` が `Math.round` で時間単位に丸めるため、1.4h も 0.5h も「約1時間後」と表示され、
ユーザーが待機してリロードしても表示が変わらないケースがあった。
`_calcWaitDisplay()` に改名し、60分未満は分単位・以上は時間単位で表示するよう変更。
あわせて復習なし画面に「更新」ボタンを追加（押下時に経過時間を反映して `_startSession()` を再呼び出し）。
（`app/app.js` `_calcWaitDisplay` / `_showNoWork`）。

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
- **`maxActiveWaves` 撤廃**: 解放条件ゲートのみで制御。学習者のペースに委ねる設計

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
- カードはタッチ環境でフルスクリーン表示（`body.no-touch` のみ 9:16 aspect-ratio）。`width: min(100%, 高さ×9/16)` で PC では画面に収まる

### app/ インタラクティブプロトタイプ
- スワイプジェスチャー: タッチ（40px上下スワイプ）・ホイール・キーボード（↑↓/Space）
- PC環境（タッチ非対応）: ↑↓ 円形ボタンを右下に表示（pc-nav-btns.visible）。body.no-touch でスワイプヒント非表示
- スキップ: 未回答状態でスワイプアップ → word.skipped=true。次セッションで最優先
- 戻りスワイプ: スキップ済み未回答カードは再表示（done/skippedをリセットして再出題）。回答済みは履歴ビュー
- 履歴ビュー: 元の `_renderXxx` を流用して表示を完全再現。`onReady` を一時 no-op に差し替えてSRS副作用を抑制。選択肢ボタン・入力欄・送信を disabled 化。ユーザーの回答（recognition/recall: 選択したボタンをハイライト・dictation: 入力値とフィードバック復元・handwrite: OCR結果復元）を再表示
- 選択肢の並び順は `card.shuffledChoices` に保存し履歴で再現。背景画像URLは `card.bgUrl` に保存し履歴で再利用
- カードが回答済みになると `onReady(result)` が呼ばれ、スワイプ可能化（次ボタンは常時クリック可）
- **SRS処理タイミング**: recognition/recall/dictation/handwrite は `onReady`（回答タップ直後）に `_onCardAnswered` を呼び出してSRS処理・ヒートマップ更新・トースト表示。`card._srsProcessed = true` をセットし、`_processAnswer`（スワイプ後）での二重処理を防ぐ。Intro/Passive はスワイプ後に `_processAnswer` 内で処理
- **正解・不正解カウント**: Intro/Passive は `countable = false` として `sessionCorrect`/`sessionWrong` をカウントしない
- **トースト通知**: `showToast(message)` + キュー管理。wave 解放時「🌊 第N波の単語が届きました」（初回セッションは activeWaves から通知、以降は waveUnlockEvents 差分）。mastered 到達時「⭐ xxxx がマスターされました」（`word.stage` が `'mastered'` に変わった瞬間のみ発火）
- **wave全mastered達成オーバーレイ**: mastered 遷移直後に `_checkWaveComplete(waveNumber)` を呼び出し。wave内全語が mastered なら `_showWaveComplete()` を発火。Wave 1 は「覚えたではない・記憶強度」の哲学メッセージ、中間波は軽量メッセージ、最終波（`maxWave`）は「記憶は生き物」のメッセージ。`_notifiedWaveComplete` Set で重複防止（`_boot()` 時に既完了 wave を登録）
- **実時間追跡**: `LearnerState.savedAt`（`Date.now()`）を保存・復元。`_boot()` 冒頭で `(Date.now() - savedAt) / 86400000` を `currentTime` に加算し、即 `_saveState()` で二重カウントを防止
- **復習なし画面**: `_showNoWork()` が card-wrapper にインライン HTML を注入（overlay ではなくカード領域に表示）。ヘッダ（ヒートマップ・統計）とフッタは常時表示。`_calcWaitDisplay()` で次のdue時刻を計算して待機時間を表示（60分未満は分単位・以上は時間単位）。「更新」ボタン押下時に経過時間を `currentTime` に加算して `_startSession()` を呼び直し、開始可能なら即セッション開始。`_updateStats()` を呼んでヒートマップを描画
- **TTS**: Recognition 回答後に単語を読み上げ、Recall 回答後に例文（HTMLタグ除去済み）を読み上げ。カード遷移時（`_showCard` 冒頭）に `speechSynthesis.cancel()` で停止
- 時間早送り: 次のセッション(1/3日)・翌日・1週間後。ボタンラベルは `LABELS.session.timeForward1/2/3`
- localStorage キー: `vocabflow_state_v1`
- Word Wave: `app/ui-wordwave.js`。ヘッダバークリックで全画面表示。単語タップでポップオーバー（pRecall・最終復習日・除外ボタン付き）。一括除外モード（🗑️）対応。
- Handwrite カード: 音声を聞いて紙に手書き10回 → カメラ/ギャラリーで写真送信 → AI OCRモック（文字スキャン風に表示）→ 常に perfect 判定で h ブースト
- 日本語訳トグル: Intro は常時表示。Recall は回答後にアクティブ化（回答前は disabled でグレーアウト表示）
- **Passive カード 1セクション表示**: `WordState.passiveCursor` で etymology/tips/confusables/collocations/trivia をローテーション。`Card.passiveSection` に確定値を保存し履歴ビューで同じセクションを再現。collocations チップはタップで Google 検索（`https://www.google.com/search?q=フレーズ`）
- **Wave 表示**: `stage !== 'new'` の最大 `waveNumber`（学習が始まった最大波番号）。解放済みでも未学習の wave はカウントしない

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
- 直近コミット: ヒートマップ・Wavesリンクをスタート画面・オーバーレイでも常時表示（9086550）
- 本番デプロイ先: `USER@HOST:/path/to/wordwave`
  - デプロイコマンド: `bash scripts/deploy.sh`（`app/` + `core/` のみ転送）

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
│   ├── deploy.sh                # 本番サーバーへ rsync デプロイ（app/ + core/ のみ）
│   ├── results/
│   │   ├── all_results.json         # 全1900語の分類結果
│   │   ├── word_data/batch_001〜095.json  # バッチ別生成データ
│   │   ├── word_data_raw.json       # 全バッチ統合（生データ）
│   │   └── word_data_fixed.json     # distractors差し替え・sanitize済み
│   └── category_report.md       # カテゴリ別単語一覧（人手確認用）
├── core/
│   ├── config.js            # DEFAULT_CONFIG, createConfig()
│   ├── models.js            # WordState（peakH含む）, Card（isRetry/stageBeforeWrong/userAnswer/shuffledChoices/bgUrl）, LearnerState
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
    ├── ui-cards.js       # 6種カードUI・TTS・Handwrite写真送信＋AI OCRモック。履歴ビュー完全再現。日本語訳トグル
    ├── ui-heatmap.js     # Wave Heatmap Canvas描画
    ├── ui-wordwave.js    # Word Wave 全画面ビュー（pRecall・最終復習日・除外・一括除外）
    ├── ui-background.js  # BackgroundManager（カテゴリ別Unsplash背景画像）
    ├── app.css           # ダークテーマ・アニメーション・Word Wave・9:16カード・Passive リッチUI・日本語訳トグル
    └── style-mockup.html # スタイル確認用モックアップ（6種カード・画面遷移・ヘッダ/フッタを静的表示）
```
