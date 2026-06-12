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
| `core/config.js` | ✅ handwriteStuckThreshold: 3・recognitionThresholdH: 2.0・masteredThresholdH: 14.0 追加済み。`maxActiveWaves` 撤廃（wave 解放はSRSペースに委ねる）。**waveSize: 100**（朝集中学習者の復習なし解消のため 50→100 に変更済み）。**`deltaTGain: true`**（review #1・ratio 正規化で校正済み・2026-06-11）。**`seedNoise: true`（base0.5/exp2.5）・`dueSampling: false`**（位相同期の分散を播種ノイズに置換・2026-06-11） |
| `core/models.js` | ✅ WordState: stuckCount/needsHandwrite/skipped/excluded/passiveCursor 追加。Card: done/userAnswer/shuffledChoices/bgUrl/passiveSection 追加。LearnerState: handwriteModeEnabled・savedAt 追加。**`stageBeforeWrong` フィールド削除**（2026-04-21: リトライ設計変更により不要に）。**`LearnerState.everClearedWaves` 追加**（2026-05-28: 過去にクリアした wave 番号を localStorage 永続化、Wave クリア overlay の重複発火を防止） |
| `core/srs-engine.js` | ✅ Handwrite 停滞介入ロジック。昇格時のみ stuckCount リセット。handwrite はステージ遷移なし |
| `core/wave-manager.js` | ✅ Bug 5 修正済み。`maxActiveWaves` 上限撤廃（解放条件ゲートのみで制御）。`checkUnlock` で `getWordsInWave(nextWave).length === 0` の wave は activeWaves に push しない防御追加。**`_meetsUnlockCondition` を供給ベースに変更**（2026-04-30）: 旧 peakH ベース条件を廃止し、アクティブ wave 全体の `new` 語が `maxNewPerSession` 未満になったら次 wave を解放 |
| `core/feed-generator.js` | ✅ skipped 最優先プール（stage='new' フィルタより先）。excluded 語を全プールから除外。_assignCardType に learnerState 渡し。**Spec §4.3 配置ルール更新（2026-04-20）**: `_enforceMaxConsecutive()` 追加（同種最大2連続 best effort）。dictation/handwrite を後半固定から解放し review pool に統合 |
| `core/word-data.js` | ✅ 全1900語フルデータ（meanings/examples/passive等）。`scripts/build_word_data_js.py` でビルド済み。**品質監査（2026-04-09）で全Phase修正適用済み**（詳細は下記「word-data.js 品質監査ログ」参照）。**choiceLabel 200件反映済み**（2026-04-15: ビルドスクリプト漏れ修正 → 144件。2026-04-21: audioHint表記ゆれ取りこぼし修正 → 56件追加） |
| `core/labels.js` | ✅ LABELS定数・formatH/formatPRecall。app/ 全体で使用（`sigmaToConfidence` は review #5 ステップ1で削除） |
| `core/category-images.js` | ✅ Unsplash 画像URL（scripts/fetch_category_images.js で自動生成、19カテゴリ×10枚） |

### Phase 2: sim/ ✅ 完了

| ファイル | 状態 |
|---|---|
| `sim/sim-runner.js` | ✅ **リトライカードを降格後 stage の種別で挿入・正解時も processResponse を呼ぶよう変更**（2026-04-21） |
| `sim/virtual-learner.js` | ✅ **間隔効果ありの独立した真の記憶モデルに刷新**（2026-06-11・review #1 検証用）。システムの h とは独立した `_trueH` を保持し、成功時 `(1−R)` 正規化の spacing で成長（massed は durH に効かない）。`truePRecall` 公開・`srsConfig` 受け取り |
| `sim/scenarios.js` | ✅ シナリオ A〜D |
| `sim/charts.js` | ✅ 5チャート・Wave Heatmap・サマリーテーブル |
| `sim/sim.html` | ✅ |
| `sim/sim.js` | ✅ JSON エクスポート |
| `sim/sim.css` | ✅ |

### Phase 3: app/ ✅ プロトタイプ完成

| ファイル | 状態 |
|---|---|
| `app/app.html` | ✅ PC用前後ナビボタン・Word Wave overlay。ヘッダーに Day N 表示。アプリ表示名「Word Wave」。`#toast` 要素追加。スタート画面タグラインを動的グリーティングに変更（3dot loading アニメーション付き）。wave全mastered達成オーバーレイ（`#overlay-wavecomplete`）追加。`#pc-nav-btns` を `#card-wrapper` 内に移動（カード右端近くに配置）。セッション完了画面: btn-primary（続ける）を time-controls の上に配置。**`#heatmap-section` を `#app` 外（body直下）に移動し常時表示**。`#card-area`・`#footer` は boot まで `display:none`。**セッション完了画面・復習なし画面のリセットボタンを削除**（スタート画面のみに集約）。**セッション完了タイトル（`#oc-title`）を動的メッセージに変更**（`_getSessionTitle()` で設定）。**`#ww-pace-section` を `#wordwave-body` と `#wordwave-footer` の間に追加**（Word Wave 固定フッタバー） |
| `app/app.js` | ✅ スキップ・戻りスワイプ・履歴ビュー。WordWaveRenderer 統合。passive-scroll とのスワイプ干渉修正済み。トースト通知・回答確定時SRS処理（`_onCardAnswered`）・カード遷移時TTS停止。スタート画面動的グリーティング。**実時間追跡**（`_boot()` で `savedAt` 差分を `currentTime` に加算）。**復習なし画面**を card-wrapper に直接注入（ヘッダ/フッタ維持・待機時間表示・更新ボタンを time-controls 上に配置）。**Intro/Passive を正解・不正解カウントから除外**。**wave全mastered達成オーバーレイ**（`_checkWaveComplete`・`_showWaveComplete`）: 各波クリアは「Wave N クリア！」、全非除外語が mastered になった瞬間のみ「全波制覇」で置き換え。**Wave 表示**はセッション中 intro カードも考慮した最大 waveNumber。**wave トースト**は「そのwaveの最初の intro カードがセッションに登場した瞬間」に発火。**復習なし画面**で innerHTML 置換前に pc-nav-btns を退避・復元（時間早送り後の btn-next-card null エラー修正）。**`_initHeatmapEarly()`**: constructor で localStorage から state を早期ロードしヒートマップ・WordWaveRenderer を初期化（`requestAnimationFrame` で初回描画・スタート画面でも Waves 閲覧・除外操作が可能）。`_buildStartGreeting()` は `this.state` を再利用（localStorage 二重パース廃止）。**スタート画面「リセットして再開」に `confirm()` ダイアログ追加**（誤操作防止）。**`_getSessionTitle()`**: セッション完了タイトルをパフォーマンス連動で動的生成（久しぶり復帰・全問正解・正解率別に各複数バリエーションからランダム選択）。`_elapsedAtBoot` で前回 save からの経過日数を保持し久しぶり検出に使用（正解率 50%以上のときのみ「おかえり。」等を表示）。**Bug 14 修正**: `_boot()` で `#wordwave-body` をクリアしてから新 WordWaveRenderer を生成（スタート画面で一度開いた後の重複表示を防止）。**Dictation near_miss 対応**: `_onCardAnswered` で `card._dictationNearMiss` フラグ時はリトライカード挿入をスキップ、`card._dictationNearMissOverwrite` フラグ時は `sessionWrong--` で統計を補正。**DEV_CONFIG に `totalWords: DEV_WORD_COUNT` 追加**（dev モードで Wave 4 以降が activeWaves に混入しないよう修正）。**リトライ設計変更（2026-04-21）**: `_insertRetry` が `feedGen._assignCardType` で降格後 stage のカード種別を決定。リトライ正解も全種別 `processResponse` 経由（`stageBeforeWrong` 廃止）。**`_buildStartGreeting()` の wave 番号を修正**（2026-04-30）: `Math.max(...activeWaves)` から `stage !== 'new' && !excluded` 語の最大 waveNumber に変更し、解放済みだが未学習の wave が「到達中」と誤表示される問題を修正。**Wave クリア状態管理を再設計**（2026-05-28）: `_notifiedWaveComplete` を `_clearedWaves`（現在クリア中）+ `_everClearedWaves`（過去履歴・永続化）に分離。`_computeWaveCleared` + `_handleWaveStateChange` で初回クリア=overlay/再クリア=無音/クリア解除=トーストを出し分け |
| `app/ui-cards.js` | ✅ 6種カードUI・TTS。全1900語の生成データを統合済み。**Passive カードは1回に1セクションをローテーション表示**（`WordState.passiveCursor` で管理、`Card.passiveSection` に確定値を保存して履歴ビューでも再現）。collocations チップは Google 検索リンク（`<a>`）。履歴ビュー完全再現（元 render メソッド流用・インタラクション無効化）。Intro/Recall に日本語訳トグル追加。Recognition 回答後に単語TTS・Recall 回答後に例文TTS。**Recall 回答後に `blankAnswer`（活用形）で例文を完成表示**（選択タップ時に差し替え・履歴ビューも対応）。**`getChoiceText()`**: Recognition 四択の正解ラベルに `choiceLabel ?? meanings[0].meaning` の fallback を実装（カタカナ推測防止）。履歴ビューの正解ボタンハイライトも同ロジックで統一。**Dictation near_miss / phonetic を不正解扱いに変更**: 入力時に word 状態をスナップショット保存 → `_markReady('wrong')` で即座に SRS 不正解登録 → 再入力可。再入力で perfect が出たらスナップショット復元 → `_srsProcessed = false` → `_markReady('perfect')` で正解上書き。フィードバックは「惜しい、もう一度 \| ギブアップ」（正解を見せない）。**ギブアップ押下で input を緑（correct）強調表示・フィードバックを dismissed（opacity 0.3）でグレーアウト**（2026-04-20） |
| `app/ui-heatmap.js` | ✅ excluded 語の色追加。ツールチップ h 表示を formatH・LABELS に統合 |
| `app/ui-wordwave.js` | ✅ Word Wave 全画面ビュー。単語除外・一括除外モード対応。ポップオーバーに pRecall・最終復習日追加。Wave 表示を学習済み最大波番号に統一。**`#ww-pace-section`**: `_updateStats()` で定着ペースを計算し「全Wave制覇は約N日後です。（Day Y頃）」を固定フッタバーに表示（定着語 10 語未満は非表示）。**mastered/クリアの視覚表現**（2026-05-28）: `_applyColor()` で `stage === 'mastered'` の語に `.mastered` class を toggle（`::before` の `●` を金色点灯）。`_isWaveCleared()`・`_updateWaveCleared()`・`_refreshAllWavesCleared()` 追加で全 mastered な wave の `.ww-wave-label` に `.cleared` class を toggle（金色背景）。**階層別配色クラスへのリファクタ**（2026-05-28）: 旧 `getColorForWord()`（インラインスタイル返却）を `getTierClass()` に置き換え。`_applyColor()` は `.ww-word--{excluded,new,t0..t5}` のクラス操作のみで、配色は app.css で定義 |
| `app/ui-background.js` | ✅ BackgroundManager（getUrl/preload）。CATEGORY_IMAGES からカテゴリ別ランダム画像URL取得 |
| `app/app.css` | ✅ 前後アニメーション・PC ナビボタン・Word Wave スタイル。タッチ環境ではカードをフルスクリーン表示（`body.no-touch` で 9:16 維持）。フォントサイズ引き上げ（choice-btn/passive-section-body: 16px、passive-section-title: 13px、collocation-chip: 16px）。`overscroll-behavior: none` で iOS バウンス無効化。Passive リッチUIスタイル。日本語訳トグルスタイル。トーストスタイル。nowork-card・wc-card・oc-sectionスタイル追加。`#pc-nav-btns` を `right: -14px` で card-wrapper 右端近くに配置。`.choice-btn:hover` を `body.no-touch` にスコープ限定（iOS でのホバー貼り付き防止）。`.collocation-chip` に `color: inherit; text-decoration: none`（`<a>` タグ対応）。**`body` を `flex-direction:column` に・`#app` を `flex:1` に変更**（heatmap 常時表示レイアウト対応）。**`#start-screen` / `.overlay` の `top` を `var(--heatmap-h)` に変更**してヒートマップを隠さないよう調整。**`--text-example: #ccc` 変数追加**。`.card-intro .word-example` を font-size: 20px・color: var(--text-example) に変更。`.card-recall .word-example`・`.example-ja` も color: var(--text-example) に統一。**`#wordwave-stats` に `margin-top: 0.8rem; line-height: 0.8` 追加**。**`.word-input.near`・`.giveup-btn` スタイル追加**（Dictation near_miss UI用）。**`.word-input.correct:disabled { opacity: 1 }` 追加**（disabled でもグレーアウトしない）。**`.answer-feedback.dismissed { opacity: 0.3 }` 追加**（ギブアップ後の非活性化表示）。**`.card-recall .choice-btn { text-transform: lowercase }` 追加**（`Arctic`/`Muslim` 等の大文字始まり語で正解がバレるのを防ぐ）。**`#ww-pace-section` スタイル追加**（Word Wave 固定フッタバー）。**`#wordwave-body` の `padding-bottom: 48px`**（pace section と重ならないよう対応）。**`.ww-word::before`・`.ww-word.mastered::before`・`.ww-wave-label.cleared` 追加**（2026-05-28: 全単語に `●` ドット、mastered は金色 `#f7d774` で点灯、クリア wave は金色グラデ背景）。**階層別配色クラス `.ww-word--{excluded,new,t0..t5}` を追加**（2026-05-28: 旧インラインスタイルを CSS クラスに移行。各階層の `::before` 色も背景に合わせて個別指定）。**`.ww-wave-label:not(:first-child) { margin-left: 6px }` 追加**（2026-05-28: Wave 2 以降のラベル左マージン） |
| `app/style-mockup.html` | ✅ 6種カード・画面遷移（スタート/セッション完了/復習なし）・ヘッダ/フッタを静的表示するスタイル確認用モックアップ。復習なし画面はヘッダ+カード+フッタのフルレイアウト（`.mockup-phone-frame`）で表示。Passive カードは1セクション1カードのローテーション例を3カラムで表示 |

---

## 次セッションの残タスク

**`review.md`（SRS エンジンのコードレビュー）への対応を順次進めている。** 指摘は重要度順に #1〜#6。

| # | 指摘 | 状態 |
|---|---|---|
| #2 | near_miss/phonetic のポリシーが sim と app で乖離 | ✅ 完了（2026-06-10。下記修正ログ参照） |
| #3 | mastered の二重定義（`masteredCount` は h≥14 / Wave クリア判定は stage==='mastered'）。降格して stage=dictation だが h=24 の語で不整合（opportunity 事件と同根） | ✅ 完了（2026-06-11。下記修正ログ参照） |
| #4 | Wave 卒業判定の穴 2 つ（①未導入 new 語の孤児化で全Waveクリア不能化 ②excluded 語が分母に残り卒業不能）。分母から excluded を外す・非除外 new が残る間は卒業させない。防御 2 行で塞げる | ✅ 完了（2026-06-11。下記修正ログ参照） |
| #5 | ベイズ層（μ/σ）が形骸化（μ は死にフィールド・σ は不正解でも減少・uncertain プールほぼデッドコード）。削除して簡素化 or 活用 | ✅ **ステップ1・2完了**（2026-06-11。ステップ1=死んだ μ/σ/uncertain 削除 + 仮想学習者 ±30% 個体差。ステップ2=uncertaintyWidth 導出 + due の effectiveH トンプソンサンプリング。下記修正ログ参照）。残りは提案 Phase 2/3（任意・トリアージ/UI/確認モード） |
| #1 | h 更新が実経過時間（deltaT）を無視。`alpha_eff = 1 + (alpha−1)×min(1, deltaT/h)` 等で減衰させる案。挙動が変わるため sim 検証必須・最も価値が高い | ✅ **完了・既定 true**（2026-06-11。`deltaTGain` を ratio 正規化で校正 → 間隔効果あり learner で OFF 比 校正MAE 約半減を確認。下記修正ログ参照） |
| #6 | 小さい指摘（spellingFlag が write-only / `_isPhoneticMatch` の判定が広すぎ＋replace が1箇所のみ / Handwrite 常時 perfect / peakH コメントが古い） | ✅ 完了（2026-06-11。下記修正ログ参照） |

**再開のしかた**: **#1〜#6 すべて完了**。`bayesian-srs-proposal.md` の進行順も Phase 1 まで完了:

1. ✅ **共有土台（2026-06-11 完了）**: 仮想学習者に語ごと真 h の ±30% 個体差を導入＋ 死んだ μ/σ/uncertain プールの削除
2. 🟡 **提案 Phase 1（実装完了・効果は立証できず）**: `uncertaintyWidth` 導出関数 + due 判定の `effectiveH` トンプソンサンプリング。新パラメータ `uncertaintyBase`(0.5)・`uncertaintyFloor`(0.05)・`staleGrowth`(0.05)・`dueSampling`(true)。当初「定着 +7%」としたが**旧 learner のアーティファクト**で、#1 後の間隔効果あり learner + N=24 では **Δ定着が初学者 +0.2(SE±1.7)・既習 +1.3(SE±2.2) で有意差なし**。理論的に健全＋無害だが効果は sim で立証できず、`dueSampling` 既定 true 維持の是非は要判断（下記修正ログ参照）
3. ✅ **#1: 校正＋検証完了・既定 true（2026-06-11）**: `deltaTGain` を ratio 正規化 `min(1, deltaT/(h×retentionFactor))` で校正（予定どおり復習＝full gain）。検証には virtual-learner を**間隔効果ありの独立した真の記憶モデル**に刷新（旧 `trueH = h×個体差` では massed≠定着を表現できず #1 の真価を測れないため）。間隔効果ありの sim で OFF 比 校正MAE 約半減（標準 0.173→0.013・朝集中 0.139→0.005）＋ ON が定着でも上回る（OFF の h 過大評価が遅すぎる復習を招く）ことを確認。下記修正ログ参照
4. **残り（任意）**: 提案 Phase 2/3（urgent 多次元トリアージ・UI 信頼性表示・確認モード）。review.md は全消化。

判定変更時は memory `feedback_srs_policy_single_source.md`（SRS ポリシーは core 一元化・app/sim は同じ経路）の原則に従い、各ステップで sim before/after を回すこと。

- review.md 由来以外で未解決のバグはなし。

---

## 2026-06-12 修正ログ

### Word Wave に信頼度ゲート（青「出会ったばかり」ティア）を追加 — ripple の揺らぎを実力差として見せない

ドッグフーディングで「同じ日に入った新語が ripple 播種ノイズのせいで h=0.8 と h=1.3 に散り、まだ1〜2回しか観測していないのに Word Wave の色が違って見える」報告。ripple の ε は「不確実だから散らしている」ノイズであって「この語はあの語より覚えている」というシグナルではない。それを色という一覧性チャネルで見せるのは**ノイズを実力差として見せる嘘**（「表示と挙動の乖離は嘘」の裏返し）。

Word Wave の色の意味論を **「色 = h の値」→「色 = 確認された記憶強度」** に変更。三段階の色文法: **グレー（未学習）→ 青（出会ったばかり・まだ分からない）→ 暖色グラデ（測定済み）**。「まだ分からない」に専用の一色を与える＝ベイジアン不確実性の可視化そのもの（提案書「活用先3＝信頼性フィードバック」が確信度ラベルではなく色の文法として実装された形）。

**変更（`app/ui-wordwave.js` `getTierClass`）**:
- `stage !== 'new'` かつ `reviewCount < WW_CONFIDENCE_MIN_REVIEWS(3)` の語に `ww-word--young` を返す（h ティア t0..t5 より先に判定）
- 閾値は **`reviewCount ≥ 3`**（intro + 2回の採点復習で卒業）。ripple 播種は rc=1 の一撃に集中し rc≥2 で実質ゼロのため、rc=3 時点の h はもう播種ノイズではなく実観測を反映
- **`uncertaintyWidth` を採らない理由**: その `staleFactor`（経過時間で幅が広がる）が長期放置された熟知語（t4/t5）を青に再降格させてしまい「確認された記憶強度」の意味と矛盾する。`reviewCount` は単調増加で「十分観測したか」だけを語るのでこの用途に純粋
- h の数値自体はポップオーバーで常に閲覧可能（色という一覧性チャネルでのみ確認された差だけを語る）

**変更（`app/app.css`）**: `.ww-word--young { background-color: #3D6CCC; color: #fff; }` + `::before` ドット色を追加。`ww-word--new`（未導入グレー #2A2A3D）とは別の青。

**スコープ**: Word Wave 単語一覧＋ Wave Heatmap 俯瞰バー（`ui-heatmap.js` `hColor` も同じ青ゲートを追加。当初 Word Wave のみだったが、同じ語が俯瞰バーで赤く見える不整合をドッグフーディングで確認し追従）。閾値定数 `CONFIDENCE_MIN_REVIEWS(3)` は `core/labels.js` に一元化し両ファイルが import（マジックナンバーのドリフト防止）。青 #3D6CCC は app.css（Word Wave）と ui-heatmap.js（canvas fill リテラル）に持つ＝既存の h ティア色と同じ二重持ちパターン。SRS ロジックは一切不変（表示の意味論のみ）。`spec.md` §5.2「信頼度ゲート」・`ui-labels-spec.md` §6 に追記済み。

---

## 命名体系（2026-06-12 確定）— 海のメタファー三層

設計対話で SRS 方式の命名を整理。製品名 **Word Wave**／アルゴリズム名 **SRSウェーブ方式**の下に、水文学の三層スケールで機構を呼び分ける:

- **Ripple（さざ波）**: 個々の語の h に播かれた揺らぎ（`seedNoise`・`base/rc^2.5`）。秒〜時間スケール。同じ波で入った語を少しずつ違うタイミングで岸に返す
- **Wave（波）**: 新語投入のゲート（100語＝1波）。数日〜週スケール
- **Tide（潮）**: コホート全体が一斉に満ちて一斉に引く周期＝**位相同期の正体**。`_computeTide` で満ち/引き/凪として可視化

今回の `deltaTGain`＋`seedNoise` の手入れは「**tide を弱める**」作業だった（消すのではなく振幅を下げる。新語の波→定着の凪のリズム自体は学習の自然な呼吸）。外向き一言は「**SRSウェーブ方式（with Ripple Seeding）**」。

**この方式の正確な性質**: 教科書的ベイジアン SRS では**ない**（h は点推定・分布を持たない／正誤は α/β ルールベース乗算でベイズ更新ではない／`uncertaintyWidth` は観測から学習した事後分散ではなくヒューリスティック導出／rc² 播種は事後分布ではなく導出した幅からの一回サンプリング＝トンプソンサンプリングの「形」を借りたもの）。正確には**「ベイジアンに着想を得た、不確実性連動の播種ノイズを持つ HLR」**。価値はベイズの機械の実装ではなく**不確実性を行動に変換すること**で、それを最小の機構（rc² 勾配ひとつ）で達成した。「rc² 播種 vs 真正ベイズ」の対決は検証フレーム（CV・ピーク・MAE・N≥30）がそのまま使えるので将来可能だが、観測が正誤の二値だけのため事後分布維持の旨味は薄い見込み。

---

## 2026-06-11 修正ログ

### 位相同期の分散: 播種ノイズ（seed noise）を実装 — core 採用・検証済み

提案書 §3 の dueSampling（位相同期の分散）を新 learner で再検証したら throughput 効果が立証できず（N=24 で Δ≈0）、そこから「別解」を探索して **core 実装まで到達**した記録。**全文と数表は `seed-noise-findings.md`**。要点:

- **再フレーム（h は seed）**: h は真の記憶の測定値ではなく SRS を回す制御変数。機構は校正 MAE の純度ではなく**アウトカム（学習者が実際に覚えているか）**で測る。MAE はバイアス（#1 が直した・害あり）と分散（ノイズ＝機構そのもの・害なし）を混ぜている。
- **別解＝h 更新への信頼度連動ノイズ（保存型）**: `w = base/rc^exp`。**鍵は勾配**——`√rc`（緩い）は成熟語まで複利蓄積して h を汚すが、`rc^2.5`（急）は rc=1 の一撃に播種を集中させ rc≥2 で実質ゼロ＝「導入時の一回播種」で複利が止まる。
- **決定打＝ラチェット反証**: throughput 増が偽 mastered（sticky stage に運良く居座る水増し）でないかを、mastered 数だけでなく「真に覚えてる語数・mastered 語の真の保持率・符号付きバイアス」で検証。**朝バースト 120日 N=30 で真に覚えてる語数 +14.6（4.9σ・本物・持続）、mastered真p 不変・バイアス下降＝genuine**。分散学習者は完全中立（下振れなし）。
- **結論**: 播種 `base/rc^2.5` は過負荷学習者（位相同期局面）で +約5% genuine な学習改善、余裕ある学習者には無害＝常時適用で安全。
- **実装（core 採用・2026-06-11）**: `config.js` に `seedNoise: true`・`seedNoiseBase: 0.5`・`seedNoiseExp: 2.5`。`srs-engine.js` `_applySeedNoise(word)` を正解時の h 更新後（intro・handwrite正解・通常正解は昇格判定の後）に適用。app/sim 両方が `processResponse` 経由。**`dueSampling` は既定 false に**（seedNoise がより強力・outcome 検証済みで両者は冗長な desync 機構・組み合わせ未検証のため。effectiveH 機構は残置・再有効化可能）。core 実コードパスを burst 120日 N=30 で再検証＝真に覚えてる語数 +12.5（4.5σ・genuine）。**標準 3/日 sim baseline は不変**（D90 264・D180 ~472。seedNoise は spread で中立・dueSampling off も throughput 中立）。
- **教訓**: ① タイミング系 throughput は run 間 std≫真値で N≥30+標準誤差必須（3回→5回→別5回で二転三転した）。② throughput は多指標で（mastered 単独は偽 mastered に騙される）。検証 `scripts/verify_seed_noise.js`・`scripts/verify_due_sampling.js`。

### review.md #1: deltaT 連動の h ゲインを ratio 正規化で校正 → 既定 true 化（間隔効果あり sim で検証）

`review.md` の指摘 #1（h 更新が実経過時間 deltaT を無視）に対応。正解時のゲインを前回復習からの経過時間で減衰させる式を **ratio 正規化で校正**し、間隔効果ありの sim で検証して**既定 true** に倒した。

**校正式（`core/srs-engine.js` `_updateHalfLife`）**:
```
ratio = min(1, deltaT / (h × retentionFactor))    retentionFactor = log₂(1/targetRetention) ≈ 0.234
gain  = 1 + (alpha − 1) × cardWeight × ratio
h_new = h × gain
```
- 予定どおりの復習（`deltaT ≈ h × retentionFactor`）→ ratio≈1 → full gain（旧 `h×α×weight` 相当）
- クラミング/リトライ/filler（`deltaT ≪ 予定間隔`）→ ratio<1 → 成長抑制（間隔反復の本質）
- cardWeight はボーナス項に掛ける（正解で h が縮まない不変条件）。`deltaTGain=false` で旧挙動を再現可能

**校正の経緯**: 素の `min(1, deltaT/h)` は target-retention スケジューリングと構造的に噛み合わなかった。スケジューラは `deltaT ≈ h × 0.234` で復習するため `deltaT/h` が常に ~0.234 で頭打ち → `gain ~1.2` 止まりで定着が ~20倍遅延（D90 19-28 vs 旧 484）。**予定復習間隔 `h × retentionFactor` で正規化**することで、予定どおりの復習を ratio=1（full gain）に校正して解消した。

**検証の前提（virtual-learner の刷新が必須だった）**: 旧 virtual-learner は `trueH = システムの h × 個体差` で、システムの h をそのまま真の記憶とみなしていた。この設計だと「massed（クラミング）で h は伸びたが実際には定着していない」状況を表現できず、#1 が補正する誤差（間隔起因）を測れない（±30% 個体差は #1 と直交した誤差源）。そこで **virtual-learner を間隔効果ありの独立した真の記憶モデルに刷新**（`sim/virtual-learner.js`）:
- システムの h とは独立した `_trueH` を語ごとに保持。成功時 `trueH × (1 + (α−1)×weight×spacing)`、`spacing = min(1, (1−R)/(1−targetRetention))`（最適復習点=full・massed≈0）、不正解時 `× β`
- 語ごと hFactor（±30%）を成長率に掛け、システム非観測の残差を作る
- `respond` は独立 trueH の保持率 R から正誤を引く。`truePRecall(word, t)` を公開（校正測定用）
- `sim-runner.js`・`scripts/verify_*.js` は `new VirtualLearner({..., srsConfig: cfg })` で SRS パラメータを渡す

**検証結果（`scripts/verify_deltat_calibration.js`・間隔効果あり learner・120日3回平均）**: 復習時の `|予測p − 真p|`（校正MAE）を OFF/ON で比較。
| 学習者 | OFF 定着 / MAE | ON 定着 / MAE |
|---|---|---|
| 標準（3回/日） | 131 / 0.173 | **334 / 0.013** |
| 朝集中（5回/朝） | 160 / 0.139 | **270 / 0.005** |

ON は校正 MAE が約 1/13〜1/30 に縮小。バイアスも +0.17→+0.007（システムの過大評価がほぼ解消）。**注目: ON は定着でも OFF を上回る** — OFF は h を過大評価 → 復習を遅すぎるタイミングでスケジュール（まだ強いと誤認）→ 学習者が失敗 → 降格 → 定着減。ON は h が正確 → 最適タイミングで復習 → 定着増。#1 は指標改善だけでなく実際の学習成果を改善する。

（注意: この校正優位は「真の記憶が deltaT-gain と同族の間隔則に従う」前提に依存する。模型非依存の頑健な主張は「OFF は間隔を完全に無視するため保持率を一貫して過大評価する」。優位の大きさは真の間隔則の形に依存。）

**sim 再ベースライン（既定 true・新 learner・3回平均）**: 旧（cram 膨張込み）から保守化:
| Day | 定着 | 学習済 | avgH | 正答率 |
|-----|------|--------|------|--------|
| 30 | ~99 | ~141 | ~31 | ~81% |
| 90 | ~264 | ~303 | ~87 | ~81% |
| 180 | ~463 | ~499 | ~164 | ~81% |
| 365 | ~800 | ~830 | — | ~81% |

1000語定着は 365日内に未到達（Day365 で ~800・wave9）。旧 ~Day223 から大幅減速だが、これは間隔効果（クラミング不可）＋ deltaT 連動の保守的成長による honest な値。app（実ユーザー）の体感は不変（上級ドッグフーダーは語を既知のため sim とは別ペース）。`spec.md` §1.2・§7.4・パラメータ表も更新済み。

---

### review.md #5 ステップ2: 提案 Phase 1（uncertaintyWidth 導出 + due 判定の effectiveH トンプソンサンプリング）

`bayesian-srs-proposal.md` §2/§3 の Phase 1 を実装。削除した σ 状態変数を「状態を持たない導出関数」として復活させ、due 判定のゆらぎに活用する。

**追加（導出関数・`core/models.js`）**:
- `WordState.uncertaintyWidth(currentTime, config)`: h 推定の不確実性の幅を観測から導出。`obsFactor = uncertaintyBase / sqrt(reviewCount)` ＋ `staleFactor = staleGrowth × log(1+deltaT)`。観測が少ない/古いほど広い。`[uncertaintyFloor, 0.9]` でクランプ（noise が負にならない防御）。旧 σ（状態変数・不正解でも単調減少という誤った更新則）の正しい置き換え
- `WordState.effectiveH(currentTime, config)`: 幅 w から `h × (1 ± w 一様乱数)` をサンプリング（トンプソンサンプリング）

**追加（スケジューラ・`core/feed-generator.js`）**:
- `_buildCandidatePools` の due 判定で、点推定 h ではなく `effectiveH` を使う（`cfg.dueSampling` で gate。false で旧挙動）。同日導入語の位相同期（同時 due → 同時復習 → 同時 due）を散らす。mastered の p ベース分岐は対象外（観測多数で幅が狭く同期問題が小さいため）

**新パラメータ（`core/config.js`）**: `dueSampling: true`・`uncertaintyBase: 0.5`・`uncertaintyFloor: 0.05`・`staleGrowth: 0.05`

**検証（`scripts/verify_due_sampling.js`・シナリオ E）**: 朝集中学習者（6分間隔×5/朝）×30日・5回平均で OFF/ON 比較。点推定 h 基準の復習需要を中立指標として測定。

> ⚠️ **当初の検証は旧 learner（trueH = h×静的個体差）下の値**だった（提案書 §8 が「不適切」と警告したモデル）。旧値: ピーク需要 max 75→67・backlog 23.9→21.0・定着 218→233（+7%）。#1 の検証で virtual-learner を間隔効果ありモデルに刷新した後、**新 learner で再検証**した結果が下記（旧値は履歴として残置）。

**再検証（2026-06-11・間隔効果あり learner・N=24 で統計的に判定）**: 当初の +7% は**旧 learner のアーティファクトで、新 learner では再現しない**。`verify_due_sampling.js` を初学者/既習の2プロファイルで併記するよう改修し、N=24 で Δ定着の標準誤差を取った結果:
- **初学者（ability=1.0・hVariation=0.3）**: Δ定着 = **+0.2（SE±1.7）→ 有意でない（ノイズ）**
- **既習（ability=1.5・hVariation=0.05・上級ドッグフーダー相当）**: Δ定着 = **+1.3（SE±2.2）→ 有意でない（ノイズ域）**
- 需要 CV は dueSampling で**再現的に ~0.02 低下**（有意・本来の平滑化）するが、**ピーク需要（max）は不変**（朝バーストではむしろ +1.6 悪化）。throughput への効果は立証できない。後日この限界が「播種ノイズ」探索につながった（下記 2026-06-11 §位相同期の分散・`seed-noise-findings.md`）。

**重要な校正の教訓（小標本ノイズに2度騙された）**: ① 3回平均1run で「定着 72→68・効果なし」→ ② 5回平均で「+3.8/+4.8・+5〜7%」と逆結論 → ③ 別の5回平均で「−4.2/−1.6」と再逆転 → ④ **N=24 でようやく「Δ≈0・有意差なし」に収束**。Δの真値（±1〜2）が run 間 std（±6〜9）より小さく、5回程度では符号すら定まらない。**タイミング系機構の sim 検証は N≥20 + 標準誤差必須**。

**dueSampling の決着（2026-06-11・既定 false に）**: 新 learner では throughput 有意改善なし・CV は ~0.02 下げるが peak は不変。同じ desync 目的で**より強力かつ outcome 検証済みの播種ノイズ（seedNoise）を core 採用**したため、冗長な dueSampling は**既定 false**に（組み合わせ未検証・effectiveH/uncertaintyWidth 機構は提案書系譜として残置、`dueSampling=true` で再有効化可能）。詳細は上記「位相同期の分散: 播種ノイズ」・`seed-noise-findings.md`。

`sim/scenarios.js` のシナリオ E（`dueSampling` off/on・頻回学習者）は macro 影響チェック用。app も同じ core 経路を通る（`_computeTide` の予測は点推定 h のまま＝期待値ベースで安定）。

---

### review.md #5 ステップ1: 共有土台（死んだ μ/σ/uncertain 削除 + 仮想学習者の語ごと真 h 個体差）

`bayesian-srs-proposal.md` で再構成された進行順の**ステップ1（共有土台）**を実施。#5・#1・提案 Phase 1 すべての前提となる作業。

**A. 死んだ μ/σ/uncertain 機構の削除**（review #5・提案書 §2/§7）:
- `models.js`: `WordState.mu`・`WordState.sigma`・`currentSigma()` を削除
- `config.js`: `sigma0`・`sigmaDecay`・`uncertainThreshold` を削除
- `srs-engine.js`: intro の μ/σ 初期化・`_bayesianUpdate()` 呼び出しとメソッド本体を削除（μ は死にフィールド、σ は不正解でも単調減少する場当たり更新だった）
- `feed-generator.js`: `uncertain` プール（σ > threshold）・`sigma_desc` ソート・`selectedUncertain` 割当を削除。プール順は `skipped → urgent → due → new → filler` に。uncertain はデッドコードだったため通常パスへの影響はほぼなし
- `labels.js`: 未使用の `params.sigma`・`pools.uncertain`・`sigmaToConfidence()` を削除
- `app/ui-cards.js`: near_miss スナップショットから `mu`/`sigma` を除去（2箇所）
- `app/ui-wordwave.js` `_computeTide`: `currentSigma > uncertainThreshold` の continue を削除（uncertain プール消滅に追従）
- `spec.md`・`ui-labels-spec.md`: σ/uncertain の記述を削除し、提案書（uncertaintyWidth 復活構想）への注記を追加
- 旧 localStorage セーブの mu/sigma は `fromJSON` の `Object.assign` で無害にコピーされるだけ（どこからも読まれない）→ 移行処理不要

**B. 仮想学習者に語ごと真 h の ±30% 個体差を導入**（提案書 §8・review #1 の検証注意点）:
- `sim/virtual-learner.js`: `hVariation`(0.3) と `_hFactor(wordId)` を追加。wordId から sin ハッシュで決定的に `[0.7, 1.3]` の係数を導出（`Math.random` 不使用で再現性確保）し、`trueH = h × ability × _hFactor` とする
- 目的: システムの推定 h（全語一律 alpha 成長）と学習者の真 h の間に**推定誤差**を持たせる。これがないとトンプソンサンプリング（提案 Phase 1）や deltaT 連動 h 更新（#1）の真価＝「推定誤りの発見と訂正」を sim で測定できない

**sim 影響**（3回平均・±30% 個体差込みが新ベースライン）: D90 定着 ~481-497 → **~473-483**、D180 ~871-886 → **~818-850**、1000語定着 Day ~214 → **Day ~223-226**。個体差により推定が外れる語が増え後半ほど保守化（意図通り。app の挙動は不変＝core から μ/σ/uncertain を消しただけで判定経路は同一）。

**次**: 提案 Phase 1（`uncertaintyWidth(word, currentTime)` 導出関数 + due 判定の `effectiveH` トンプソンサンプリング）→ シナリオ E で位相同期分散を sim 検証。続いて #1（deltaT 連動 h 更新）。

---

### review.md #6: 小さい指摘 4 件を処理

`review.md` の指摘 #6（小さい指摘群）をまとめて対応。

**① spellingFlag が write-only → 削除**: `srs-engine.js` で `result === 'phonetic'` 時に set されていたが、near_miss/phonetic は app（UI で wrong に翻訳）・sim（virtual-learner で終端化）のどちらでも生の `'phonetic'` が processResponse に届かないため**実際には set されず**、かつ読み手は ui-cards のスナップショット保存/復元のみで**判断には未使用**だった。`models.js` の宣言・`srs-engine.js` の set ブロック・`ui-cards.js` のスナップショット2箇所から完全削除。

**② `_isPhoneticMatch` の判定が広すぎ＋ replace が1箇所のみ → 精密化**: 旧実装は ① regex を `input.replace(/ie/)` で渡し最初の1出現しか置換せず、② 「編集距離≤2 かつ 長さ≥4」の広いフォールバックで大半の2文字タイポを phonetic に巻き込んでいた（判定名と実態の乖離）。パターンを全置換（`/g`）に変え、広いフォールバックを削除して**発音混同パターン一致のみ**を phonetic と判定するよう精密化。`butiful`（beautiful）は旧 phonetic → 新 wrong に（より正直）。SRS 影響なし（near_miss/phonetic/wrong は全て不正解扱い・judgeDictation は app 専用で sim 不使用）。あわせて未使用の壊れた死に変数 `const fbText = result === 'near_miss'`（ASI で boolean 代入になり未参照）も除去。

**③ Handwrite 常時 perfect → コメントで明示**: OCR モックは文字認識せず常に正解語を表示し `_markReady('perfect')` を返すため、無条件で最大ブースト（alpha×handwriteWeight ≈ 3.2倍）が得られる。実 OCR がない現状では判定の実体化が不可能なため、挙動は変えず `ui-cards.js` のモック箇所に「実 OCR 導入時は照合で perfect/wrong を実体化しブーストを判定ゲート下に置く」旨のコメントを追加（暫定許容を明文化）。

**④ peakH のコメントが古い → 修正**: wave 解放が供給ベースになり core では peakH 未使用（Word Wave ポップオーバー表示・sim/scenarios 用に残置）。`models.js`・`srs-engine.js` の「ウェーブ解放判定に使用」コメントを実態に合わせて更新。

sim 回帰なし（Day 90 定着 ~477・post-#4 範囲内）。①④はコメント/死にコードのみで挙動不変、②は app のフィードバック/履歴ラベルのみ変化（SRS 不変）。

---

### review.md #4: Wave 卒業判定の穴 2 つを防御

`review.md` の指摘 #4 に対応。`wave-manager.js` `_isGraduated`（90% が h≥graduationH(8) で activeWaves から除外）の2つの穴を塞いだ。

**穴① 未導入 new 語の孤児化**: 供給ベース解放では、ある wave に最大4語の `new` 語が残ったまま次 wave が解放される。その状態でも残り new が10%以下なら卒業条件（90% h≥8）を満たせてしまい、activeWaves から外れる。すると `getNewWordsFromActiveWaves` は卒業 wave を見ないため、その new 語は**永久に導入されず全Wave クリアも永久に達成不能**になる（長期離脱からの復帰で復習が飽和し続けるケースで現実に起こり得る）。

**穴② excluded 語が分母に残る**: 未学習のまま除外された語は h=0 で分母に入るため、**10語以上除外された wave は永久に卒業できず** activeWaves が肥大する。

**変更（`core/wave-manager.js` `_isGraduated`・防御2行）**:
- 分母を `getWordsInWave(wn).filter(w => !w.excluded)` に変更（excluded を除外）
- `if (words.some(w => w.stage === 'new')) return false;` を追加（非除外 new が残る間は卒業させない）

`getNewWordsFromActiveWaves` の呼び出し元（`feed-generator.js:102`・`app.js`）はすべて `.filter(!excluded)` 済みのため、卒業ブロック中の wave の new 語は引き続き正しく供給される。

**検証**: 直接ユニットテストで3ケース確認 — ①9卒業+1 new 残 → 卒業しない（false）②全10卒業 → 卒業する（true・過剰制限なし）③2卒業+8除外(未学習) → 卒業する（true・除外を分母から除外）。sim 3回平均は post-#3 と実質同値（Day 90 ~485-504、Day 180 ~865-884、1000語 Day ~211-215）で**通常パスに回帰なし**（この修正は長期離脱・大量除外のエッジケース専用の防御）。

---

### review.md #3: mastered の二重定義を `stage === 'mastered'` に統一

`review.md` の指摘 #3 に対応。`masteredCount`（ヘッダの「定着語数」統計）の定義を h ベースから stage ベースに統一。

**問題**: `LearnerState.masteredCount`（`models.js:90-92`）と sim の集計（`sim-runner.js:86`）は **h ≥ masteredThresholdH(14)** で定着を数えていた。一方、Wave クリア判定・Word Wave の金色ドットは **stage === 'mastered'** で判定する。降格して `stage='dictation'` だが h が高いまま居座る語（opportunity 事件・h=24.88）は、**ヘッダ統計では「定着」に数えられるのに Wave クリアはブロックされる**二重評価ズレを起こしていた（#2 と同種の「stage と h のズレ」）。

**変更**:
- **`core/models.js`** `masteredCount` getter: `w.h >= masteredThresholdH` → `w.stage === 'mastered'`（app ヘッダ・セッション完了画面の「定着」表示の源）
- **`sim/sim-runner.js`** スナップショット集計: 同上（app/sim 同一定義）
- **`app/ui-wordwave.js`** `_updateStats()`: Word Wave 内の「定着」統計（旧 `h >= 14`）と全Wave クリア予測の `masteredNow`（旧 `!excluded && h >= threshold`）を `stage === 'mastered'` に統一。これで Word Wave の数値が Wave クリア判定（`_isWaveCleared`・stage 基準）・金色ドットと完全一致
- **`spec.md`** §出力グラフ「定着語数（h≥14日）」→「定着語数（`stage === 'mastered'`）」

stage='mastered' への昇格条件自体は従来どおり「Dictation クリア かつ h ≥ 14」（`_evaluateStageTransition`）。今回はあくまで**カウント定義**を昇格時の stage に合わせただけで、昇格ロジック・降格ロジックは不変。

**シム結果への影響**: stage ベースは「降格して stage=dictation だが h≥14」の語を除外する分やや保守的。除外対象（降格中・高 h）は時間とともに増えるため後半ほど差が広がる。3 回平均で Day 90 定着 ~506 → ~495、Day 180 ~965 → ~870、**1000語定着 Day 219 → Day ~214**。app の挙動は表示数値のみ変化（昇降格ロジックは不変）。

---

## 2026-06-10 修正ログ

### review.md #2: near_miss / phonetic のポリシーをエンジンに一元化（sim と app の乖離解消）

`review.md` の指摘 #2 に対応。near_miss/phonetic の SRS 扱いが sim と app で乖離していた問題を解消。

**問題**: エンジン `srs-engine.js` は `isCorrect = result !== 'wrong'` で near_miss/phonetic を**正解扱い**（×alpha×0.9=×1.8・昇格判定）していた。エンジンに生の near_miss/phonetic を渡すのは sim だけ（app は UI 層で `_markReady('wrong')` に翻訳済み）。結果、**sim が dictation ステージで楽観的に振れ、現アプリ挙動をモデルできていなかった**。

**採用方針（B: アプリ忠実な回復モデル）**: アプリの near_miss は「即 wrong 登録 → その場で再入力 → 直せば perfect に巻き戻し / ギブアップで wrong 確定」という**回復可能イベント**。virtual-learner が near_miss を生成するのは adjustedP 通過後（＝知っている語の軽微なミス）なので、大半が perfect に回復する。これを fix 確率でモデル化:

- **`core/srs-engine.js`**: `isCorrect = result !== 'wrong' && result !== 'near_miss' && result !== 'phonetic'`（near_miss/phonetic を不正解に。エンジンを唯一のポリシー源とする防御的フォールバック）。dead 化した `_cardWeight` の near_miss 分岐を削除
- **`sim/virtual-learner.js`**: `_resolveSpelling(kind)` を追加。near_miss/phonetic を `nearMissFixRate`(0.85)/`phoneticFixRate`(0.6) で `'perfect'`(修正成功) or `'wrong'`(ギブアップ) に終端化。`respond` は near_miss/phonetic を**外に出さない**（エンジンには終端結果のみ）
- **`sim/sim-runner.js`**: correctCount・リトライ挿入判定を `isWrong = wrong|near_miss|phonetic` に統一（エンジンと同じ不正解定義。実際には near_miss/phonetic は届かないが防御的）
- **`core/config.js`**: 未使用化した `nearMissWeight` を削除
- **`spec.md`**: §2.2/§2.3 の判定表を「near_miss/phonetic = β 不正解扱い + 再入力モデル」に改訂。パラメータ表の `nearMissWeight` を `nearMissFixRate`/`phoneticFixRate`(sim のみ) に差し替え

**シム結果への影響**: 旧（near_miss≒正解）より phonetic(0.6 fix)・near_miss(0.85 fix) の一部が wrong に解決される分わずかに保守的。Day 90 定着 ~492（ほぼ従来同等）、**1000語定着が Day 189 → Day 219** に補正（app 忠実な値）。app の挙動は不変（エンジンに near_miss を渡していないため影響なし）。

---

## 2026-06-03 修正ログ

### #573 statistics の語源解説の派生方向を修正

旧 etymology「ドイツ語 'Statistik' → ラテン語 'statisticum'（国家に関する）から」は矢印の向きが逆で、ドイツ語からラテン語が派生したかのような誤った記述になっていた。実際の派生はラテン語 → 新ラテン語 → ドイツ語 → 英語の順。

正しい派生方向と「国情を扱う学」→「数量データを扱う学問」への意味変化（19世紀以降）を補った記述に差し替え:

> ラテン語 status（立つこと・状態・国家）が語根。そこから新ラテン語 statisticum（国事に関する）が派生し、ドイツ語 Statistik を経て英語 statistics へ。もともとは国家の「国情」——人口・産物・軍備など、統治に有用な情報——を扱う学を指していた。現代的な「数量データを扱う学問」を表すようになったのは19世紀以降。

`scripts/results/word_data_final.json`（正マスター）を修正 → `build_word_data_js.py` で `core/word-data.js` を再ビルド（Errors 0）→ デプロイ済み。

---

## 2026-06-01 修正ログ

### #618 trace の例文を `trace back to` 構文の日常文に差し替え

旧例文「Police traced the call back to a nearby phone booth.」は逆探知という刑事ドラマ特化の状況かつ `phone booth`（公衆電話）が時代遅れで語感が掴みにくかった。さらに `passive.tips` 自身が頻出構文として推している `trace back to` を肝心の例文で使えていなかった。

トラブルシューティング文脈の「We traced the problem back to a faulty cable.（私たちはその問題の原因が不良ケーブルにあることを突き止めた。）」に差し替え、tips と例文の整合も取った。`blankAnswer` は `traced` のまま。

`scripts/results/word_data_final.json`（正マスター）を修正 → `build_word_data_js.py` で `core/word-data.js` を再ビルド（Errors 0）→ デプロイ済み。（commit `0530eb0`）

---

## 2026-05-28 修正ログ

### Word Wave に mastered/クリアの視覚表現とクリア解除イベントを追加

ドッグフーディング中に Wave 7 Day 52 で「すでに mastered だった opportunity の dictation 正解で『Wave 2 クリア』overlay が発火した」報告を受けて調査。実際には opportunity は過去の降格で `stage='dictation'`・h=24.88 で居座っており、Word Wave の色は h ベース（h≥14 → 緑、h≥30 → 濃緑）のため「色は緑だが stage は dictation」の状態が「mastered に見える」誤認を起こしていた。今回の dictation 正解で初めて mastered に再昇格し、Wave 2 が真に初めて 100% mastered 達成した正規イベントだったが、ユーザー視点では「クリア済みの wave が再びクリアされた」ように見えた。

stage と色の二重評価ズレを根本解消する設計に変更:

**B: 単語レベル mastered バッジ**
- `ui-wordwave.js` `_applyColor()` で `stage === 'mastered'` の語に `.mastered` class を toggle
- `app.css` `.ww-word::before`: 全単語に `●` ドット（デフォルトは `#ccc` opacity 0.5）。mastered は金色 `#f7d774` opacity 1 で点灯
- 当初は `.ww-word.mastered` に `box-shadow` 金色枠 + `::after` に ★ を試したが、mastered が密集すると視覚的に刺激が強すぎたため `::before` ドット方式に変更

**E: Wave クリアの背景色**
- `ui-wordwave.js` `_isWaveCleared()` / `_updateWaveCleared()` / `_refreshAllWavesCleared()` 追加
- `_build()` 完了時と `updateWord()` 時に該当 wave の `.ww-wave-label.cleared` を toggle
- `app.css` `.ww-wave-label.cleared`: 金色グラデ背景（識別は背景色のみ。✓ プレフィックスは UI 検討後に削除）

**G: クリア解除トースト + 初回 overlay 重複防止**
- `core/models.js` `LearnerState` に `everClearedWaves: Number[]` 追加（`toJSON`/`fromJSON` で永続化）
- `app.js`:
  - `_notifiedWaveComplete` を `_clearedWaves`（現在クリア中・state から毎回再計算）と `_everClearedWaves`（過去に1度でもクリア・localStorage 永続）に分離
  - 旧 `_checkWaveComplete` を `_computeWaveCleared` + `_handleWaveStateChange` に置き換え。stage 変化検出後に呼んで 3 種類のイベント発火:
    - **初回クリア**: 既存 `_showWaveComplete` overlay
    - **再クリア**: 無音（Word Wave のバッジ復活のみ）
    - **クリア解除**: 「⚠ Wave N のクリアが解除されました」トースト
- これにより降格→再昇格でも overlay は再発火しなくなる。クリア状態の変動はバッジ/背景で常時可視化、変化の瞬間はトーストで通知

### Word Wave の階層別配色を CSS クラスにリファクタ

`ui-wordwave.js` の `_applyColor()` がインラインスタイル（`backgroundColor`/`color`/`textDecoration`）で h レンジ別の配色を直接書き込んでいた。これだと背景色ごとに `::before` ドットのコントラストを CSS 側で個別調整できないため、階層別 CSS クラスに置き換え。

- `ui-wordwave.js`: 旧 `getColorForWord()` を `getTierClass()` に置き換え。`.ww-word--{excluded,new,t0..t5}` のいずれかを返す。`_applyColor()` は `WW_TIER_CLASSES` を classList から remove → 該当クラスを add するだけになり、`mastered` トグルも維持
- `app.css`: 階層別クラスで背景色・文字色を定義（旧インラインと同色）。`.ww-word--t{0..5}::before` で各背景に合うドット色を個別指定（明背景=`#222`、暗背景=`#fff`）。mastered は `(0,2,1)` の specificity で各階層を上書きし金色 `#f7d774` に統一
- bulk-mode の選択可能セレクタも `:not([style*="line-through"])` から `:not(.ww-word--excluded)` に変更
- Wave 2 以降の `.ww-wave-label` に `margin-left: 6px` を追加（`.cleared` の金色背景同士・前 wave の単語との接触防止）

### `app/debug.html` を追加（iOS Chrome 向け）

iOS Chrome では DevTools が使えず localStorage を直接確認できない。Wave サマリ（全 mastered なら ✅ + 緑背景行）・Wave 詳細（単語ごとの stage/h/peakH/復習統計をソート可能なテーブル）・JSON コピー機能を提供するデバッグ閲覧ページを `app/` 配下に新設。本番にもデプロイされる（`scripts/deploy.sh` は `app/` 配下を転送）。

---

## 2026-05-25 修正ログ

### スタート画面の「前回」→「最近」

`_buildStartGreeting()` の直近 mastered 通知が「前回、X・Y が定着しました。」を表示していたが、判定ロジックは `lastReviewed >= currentTime - sessionDur * 2`（直近 2 セッション分 ≒ 16時間以内に触れた mastered 語）であり「直前のセッション」ではなく「最近触れた mastered 語」が正確。`前回` → `最近` に変更。（`app/app.js` `_buildStartGreeting`）

### 「制覇」「全波」を「クリア」「全Wave」に統一

ブランドトーン調整。勇ましすぎる「制覇」「全波」表記をアプリ全体で柔らかい「クリア」「全Wave」に置換。

- `app/app.js` `_showWaveComplete`: `全波 制覇` → `全Wave クリア`、`Wave N クリア！` → `Wave N クリア`、`Wave 1 達成` → `Wave 1 クリア`（タイトル文言の感嘆符も削除）
- `app/ui-wordwave.js` `_updateStats`: `🏆 全Wave制覇達成！` → `🏆 全Wave クリア`、`全Wave制覇は約N日後です。（Day Y 頃）` → `全Wave クリアまで約N日です。（Day Y 頃）`、定着語不足時のメッセージは「定着語が増えると 最後の波をクリアするまでにかかる期間の予測が表示されます」に書き換え

「All Wave」も併用検討したが「全Wave」に統一。

### #601 commit の第一義を「専念する・約束する」に

meanings[0]「（罪・過ちを）犯す」→「（〜に）専念する・約束する」に入れ替え。例文も `He committed a serious mistake at work yesterday.`（犯す用法）→ `She committed to finishing the project by Friday.`（約束する用法）に差し替え。日常・ビジネス文脈・Git の「コミット」もこちらが第一義として自然。passive の tips・collocations・trivia は「犯す」用法にも触れる構成のまま据え置き。

（`scripts/results/word_data_final.json` / `core/word-data.js`）

---

## 2026-05-22 修正ログ

### 波の絵文字をブランドアイコンに置き換え・body 背景に波の写真

プラットフォーム依存の絵文字レンダリング（🌊）をブランド統一されたアイコンに置き換え、アプリ全体に波の世界観を持たせる施策。

**波アイコン**:
- インライン用に `wave-icon.png`（192px・透過・29KB）を `icon.png` から生成（内容クロップ＋5%余白で正方形化・縮小）
- `.wave-icon` クラス（`width/height: 1em` のインライン要素・`background-size: contain`・`vertical-align: -0.28em`）で `font-size` スケール可能に。絵文字 🌊 と同じ感覚で使える
- 全9か所を統一: スタート画面ロゴ・`waves ›` リンク・wave-complete オーバーレイ・wave 解放トースト・Word Wave の Wave ラベル・満ち潮メッセージ
- `textContent` だったトースト（`_dequeueToast`）・Wave ラベルは `innerHTML` に変更しアイコン span を注入（メッセージは全て内部文字列のため安全）
- スタート画面ロゴは `#start-screen .wave-icon { font-size: 128px }`

**背景画像**:
- `body` 要素の背景に波の写真 `wave.jpg`（Unsplash・Tim Marshall）を設定。可読性確保のため暗いオーバーレイ（`rgba(8,8,18,0.55→0.78)` の縦グラデーション）を重ねる
- `#start-screen` は `background: transparent` にして body の背景を透過表示（スタート画面・ヒートマップ背後・アプリ全体に波が見える）

**アセット配置**:
- `icon.png`（1.4MB・1024px 透過マスター）はリポジトリルートへ移動。`deploy.sh` は `app/` を転送するため、参照されないマスター画像を本番から除外
- `wave.jpg`（557KB）・`about.wave.jpg.txt`（Unsplash クレジット表記）は `app/` に配置

（`app/app.html` / `app/app.css` / `app/app.js` / `app/ui-wordwave.js` / `app/style-mockup.html` / `app/wave-icon.png` / `app/wave.jpg` / `icon.png`）

### Word Wave に潮の状態（満ち/引き/凪）と次の満ち潮予測を表示

「位相同期」を問題ではなく Word Wave の体験そのもの——新語投入期（満ち）と復習定着期（引き）の自然なリズム——として可視化する施策。仕様上の Wave（100語ゲート＝大きな波）とは別に、`h の成長 × sessionSize × maxNewPerSession` の相互作用から生まれる小さな波を `#ww-pace-section` に表示する。

**`ui-wordwave.js` — `_computeTide()` 追加**:
- `feed-generator` の貪欲割当（`skipped→urgent→due→new`）を先読みし、次セッションの新語枠数 `newSlots` を見積もる
- `reviewDemand = skipped + urgent + due`、`newSlots = min(newAvail, max(0, sessionSize − reviewDemand), maxNewPerSession)`
- 判定: `newSlots ≥ 3` → 満ち潮 / `reviewDemand ≥ sessionSize − 2`（18以上）→ 引き潮 / それ以外 → 凪
- （旧: uncertain プールの除外考慮があったが review #5 ステップ1で uncertain プール自体を削除済み）

**`_updateStats()` — ペースセクション改修**:
- 既存の全Wave制覇予測の上に潮の状態行を追加（2段構成: 上段＝潮、下段＝全Wave制覇予測）
- 引き潮のときのみ「次の満ち潮」を外挿表示: `excess = reviewDemand − (sessionSize − 3)` を学習者のセッションペース（`sessionsCompleted / currentDay`）× `sessionSize` で割って日数化。`< 0.75日` は「まもなく」、それ以外は「約N日後（Day X頃）」。`sessionsCompleted < 3` または `currentDay < 1` は予測を出さない
- 満ち潮・凪は状態のみ表示（次の満ち潮予測なし）

**`app.css`**:
- `#ww-pace-section` を `flex-direction: column` に変更（潮の行と全Wave行を縦積み）
- `.ww-tide-line`（背景 `#333`・`padding 0.5rem`・角丸のボックス表示）・`.ww-tide--flood/ebb/slack`・`.ww-goal-line` を追加

設計上の注意: 毎日学習する学習者では引き潮は1セッション程度で解消するため予測はほぼ「まもなく満ち潮」になる。複数日の「約N日後」が出るのは離脱して復習の山が積み上がった学習者のケース（外挿として正しい挙動）。SRS ロジックには一切手を入れず既存 state からの可視化のみのため spec.md の改訂は不要。

（`app/ui-wordwave.js` `_computeTide` / `_updateStats` / `app/app.css`）

### Word Wave のタイトル横に Wave 数を表示

`#wordwave-stats`（学習/定着/平均h の行）内にあった Wave 数を `#wordwave-title` 内の `#wordwave-time`（Day N 表示）の直前に移動。`#wordwave-wave` span を新設し `_updateStats()` で `Wave N` をセット。CSS は `#wordwave-time` と同スタイルに統合。

（`app/app.html` / `app/ui-wordwave.js` `_updateStats` / `app/app.css`）

### mastered 語の passive カードに維持クレジットを付与

2026-05-21 の「mastered 維持レビュー多様化」により、mastered + due 語が 1/4 の確率で passive カードを引くようになった。しかし `processResponse` は passive を即 return するため h も lastReviewed も更新されず、その語は維持レビューのクレジットを得られないまま `due` に居座り、非 passive を引くまで毎セッション再出題され続けるループが発生していた（`due` プールがわずかに膨張）。

**変更**: `srs-engine.js` `processResponse` の passive 早期 return を、mastered 語のときだけ `word.lastReviewed = currentTime` を更新してから return するよう変更。

- h は更新しない（passive は間接観測のみ、の原則は維持）
- lastReviewed の更新により `pRecall` が回復し、その語は `due` → `filler` へ移行。次の due まで通常間隔（h × retentionFactor）を空ける＝真の「維持」
- 降格・昇格・stuckCount 等は一切変えない
- 非 mastered の passive（filler 由来）は従来どおりノークレジット（filler は p 高で due ループの問題がないため）

app（`_onCardAnswered` → `processResponse`）・sim 双方が同じ `processResponse` を経由するため両方に反映。spec.md §「mastered 語の維持レビューのカード種別」も同内容に改訂。

（`core/srs-engine.js` `processResponse`）

---

## 2026-05-21 修正ログ

### mastered 語の維持レビューを出題プールに応じて変化

spec.md §4.4 改訂に伴う実装変更。mastered 語の維持レビューカードを `_assignCardType` で出題プールから分岐。

**変更前**: `_assignCardType` は word.stage のみで判定し、mastered は switch の default に落ちて常に `recall` を返していた。

**変更後**:
- `_assignCardType(word, learnerState, pool)` に pool 引数を追加（`'skipped'|'urgent'|'due'|'uncertain'`）
- `word.stage === 'mastered'` 分岐を switch の前に追加
  - `pool === 'urgent'`（p < 0.5）: `dictation` 固定 — 長期離脱後の確実な確認
  - それ以外（due / skipped）: `['recognition','recall','dictation','passive']` からランダム選出 — 変化のある軽い確認
- `generateSession` の Card 生成箇所で pool 種別を渡すよう更新
- リトライ呼び出し元（`app.js _insertRetry` / `sim-runner.js`）は pool 未指定のまま（リトライ時点で word.stage は降格済みのため mastered 分岐に入らない）

mastered + passive 選出時の `Card.passiveSection` は ui-cards.js の遅延初期化（`card.word.passiveCursor` 参照）が自動的に処理するため feed-generator 側の追加対応不要。

シム結果: 200日まで実行し従来とほぼ同等の数値を確認（Day 30 定着=183、Day 90 定着=471、Day 180 定着=814）。

（`core/feed-generator.js` `_assignCardType` / `generateSession`）

---

## 2026-04-30 修正ログ

### Wave 解放条件を供給ベースに変更・スタート画面 wave 番号誤表示を修正

**問題**:
- wave 6 を14語しか学んでいない状態で wave 7 が解放され、スタート画面に「第7波到達中」と誤表示されていた
- 旧解放条件「導入済み語の70%が peakH≥2.0」は導入語数を考慮しないため、少数サンプルで早期発火していた

**wave-manager.js — `_meetsUnlockCondition` 変更**:
- 変更前: wave N の導入済み語のうち `peakH >= waveUnlockH(2.0)` が70%以上
- 変更後: アクティブ wave 全体の `new` 語が `maxNewPerSession`（5）未満になったら次を解放
- 設計根拠: wave 解放の目的は「次のセッションに含める新語の供給確保」であり、セッションあたり新語数が下限の根拠になる
- `waveUnlockRatio`・`waveUnlockH` は config・sim/scenarios.js で参照継続のため定義は残す（wave-manager では使用しない）

**app.js — `_buildStartGreeting()` 修正**:
- `Math.max(...activeWaves)` → `state.words.reduce` で `stage !== 'new' && !excluded` 語の最大 waveNumber を使用
- 解放済みだが未学習の wave を「到達中」と表示しない

**シム結果への影響**: 1000語定着が Day 307 → Day 189 に短縮（wave が just-in-time で解放され各セッションのレビュー密度が上がるため）

（`core/wave-manager.js` `_meetsUnlockCondition` / `app/app.js` `_buildStartGreeting`）

---

## 2026-04-27 修正ログ

### Recall 選択肢の大文字始まり語で正解がバレる問題

`Arctic`・`Muslim` など WORD_DATA の `word` フィールドが大文字始まりの語は、Recall カードの正解ボタンが大文字で他の選択肢が小文字になり正解が特定できた。

**対応**: `.card-recall .choice-btn { text-transform: lowercase }` を `app.css` に追加。表示は統一して lowercase になるが、回答後の例文ハイライト（`blankAnswer` を使用）は大文字・小文字を正しく維持。

（`app/app.css`）

### Word Wave に全Wave制覇ペース予測を追加

ドッグフーディング中に「あと何日で全Wave制覇できるか」を知りたいニーズが浮上。`_updateStats()` で `masteredNow / currentDay` を計算し「全Wave制覇は約N日後です。（Day Y頃）」を Word Wave 画面の固定フッタバーに表示。

- `#ww-pace-section` を `#wordwave-body` と `#wordwave-footer` の間に HTML で配置（overlay の column flex により自然に固定）
- 定着語 10 語未満は「定着語が増えると予測が表示されます」
- 全Wave制覇達成時は「🏆 全Wave制覇達成！」
- `#wordwave-body` に `padding-bottom: 48px` を追加してコンテンツが隠れないよう対応

（`app/app.html` / `app/ui-wordwave.js` / `app/app.css`）

### ドッグフーディング実績（2026-04-27 時点）

開発者自身による実使用データ: Day 23.7・学習済み 509語・定着 491語・Wave 6・約3回/日。ユーザーは上級英語学習者で既知語がほぼ100%。シミュレーション予測（Day 30 で定着〜105語）の約4倍ペース。全Wave制覇予測は Day 92〜100頃。Dictation はスペリング習熟として機能しており Handwrite 介入も発動確認済み。

---

## 2026-04-21 修正ログ

### choiceLabel 取りこぼし修正（audioHint 表記ゆれ問題）

`generate_choice_labels.py` の候補絞り込みが `audioHint` との先頭3文字一致で判定していたため、`code`（意味: コード / audioHint: コウド）のように表記が異なる語が対象外になっていた。

**対応**:
- `scripts/fix_missing_choice_labels.py` を新規作成。meanings にカタカナ3文字以上を含み choiceLabel 未定義の全語（129件）を Claude API に渡し、「対象語の発音からカタカナが推測できるか」を API に判断させる方式に変更
- 54語に choiceLabel を自動追加
- `virus (#657)` → `感染性病原体`、`allergy (#957)` → `過敏反応` を手動追加（API 生成がカタカナを含んでいたため）
- 計56語追加（累計 200語）

### interest passive.tips 整合性修正

「動詞としても使える」と書いていながら後続の例がすべて形容詞形（interested / interesting）だった矛盾を修正。動詞用法の例文（`The news interested me.`）を冒頭に追加し、その後に形容詞形の使い分け注意を続ける構成に整理。（`scripts/results/word_data_final.json` / `core/word-data.js`）

### リトライカード設計の刷新（stageBeforeWrong 廃止）

**変更前**:
- リトライカードは元カードと同じ cardType（dictation wrong → retry dictation）
- リトライ正解（handwrite以外）: `word.stage = card.stageBeforeWrong`（降格キャンセル・h 更新なし）
- mastered-stage の単語が recall カードで間違えると retry recall に `stageBeforeWrong='mastered'` がセットされ、retry recall 正解で h チェックなしに mastered が復元。mastered toast が不正発火するバグがあった

**変更後**:
- `_insertRetry` が `feedGen._assignCardType(word, state)` を呼び、**降格後の stage** に対応するカード種別でリトライカードを生成（dictation wrong → stage=recall → retry recall）
- リトライ正解も全種別 `processResponse` を呼ぶ（h 更新 + 通常の昇格判定）
- mastered 復帰には dictation 正解 かつ h ≥ masteredThresholdH が必要（ユーザーの認知と一致）
- `Card.stageBeforeWrong` フィールドを削除

**h の推移（dictation wrong + retry recall correct の場合）**:
- 変更前: h = h × 0.3（retry 正解でも h は戻らない）
- 変更後: h = h × 0.3 × 2.0 = 0.6h（retry 正解で部分回復）
- **※ 2026-06-11 の deltaTGain=true で再び `h = h × 0.3` に**（同セッション内リトライは deltaT≈0 → 成長なし。下記 #1 修正ログ・spec §4.5 参照。部分回復は後日の間隔の空いた復習で得る設計に変わった）

（`app/app.js` `_insertRetry` / `_onCardAnswered` / `core/models.js` Card / `sim/sim-runner.js`）

spec.md §4.5 も同内容に改訂済み（「ダメージ回復・h 更新なし」→「降格ステージからの正規昇格・processResponse 経由」）。

---

## 2026-04-20 修正ログ

### 全波制覇オーバーレイの条件修正

**変更前**: `waveNumber === maxWave`（最後の波番号がクリア）で「全波制覇」を表示。他の波にまだ未完語があっても発火していた。

**変更後**: 全非除外語が `stage === 'mastered'` になったときのみ「全波制覇」で置き換え。各波クリアは常に「Wave N クリア！」を表示する。

（`app/app.js` `_showWaveComplete`）

### dev モードで「第4波到達中」と誤表示される問題

**原因**: `totalWaves = Math.ceil(config.totalWords / config.waveSize)` = `Math.ceil(1900 / 3)` = 634 となり、Wave 3 の解放条件を満たすと Wave 4 が `activeWaves` に push されていた（Wave 4 には語が存在しない）。

**修正**:
- `DEV_CONFIG` に `totalWords: DEV_WORD_COUNT`（= 9）を追加し `totalWaves` を正しく 3 に制限
- `wave-manager.js` の `checkUnlock` で `getWordsInWave(nextWave).length === 0` の波は push しない防御を追加

（`app/app.js` DEV_CONFIG / `core/wave-manager.js` `checkUnlock`）

### Dictation ギブアップ時 UI 改善・perfect 入力欄の強調表示維持

**変更前**:
- ギブアップ時: `input.className = 'word-input wrong'`（赤）で正解スペルを表示
- perfect 時: `input.disabled = true` でブラウザがグレーアウト

**変更後**:
- ギブアップ時: `input.className = 'word-input correct'`（緑）で正解スペルを強調表示
- ギブアップ時: フィードバック「惜しい、もう一度」を `dismissed` クラスで `opacity: 0.3` に（意味をなさないため非活性化）。ギブアップボタンも消える
- perfect / ギブアップ時: `.word-input.correct:disabled { opacity: 1 }` を追加し disabled でもグレーアウトしない

（`app/ui-cards.js` `_renderDictation` giveup handler / `app/app.css`）

### Spec §4.3 配置ルール更新（同種最大2連続・Dictation後半固定廃止）

spec.md の §4.3 セッション内配置ルールが改訂されたため実装を更新。

**変更内容**:
- **`_enforceMaxConsecutive(cards, max=2)` 追加**: 同種カードが3連続になる位置に別種を割り込ませる（best effort — 他種が尽きた場合は諦めて積む）
- **dictation / handwrite を後半固定から解放**: `[...nonUrgentRecall, ...reviewRecognition, ...dictation, ...handwrite]` として `_interleaveIntroRecognition` のフィラープールに統合
- **削除したルール**: 旧「Dictation/Handwrite はセッション後半に配置」

（`core/feed-generator.js` `_arrangeCards` / `_enforceMaxConsecutive`）

---

## 2026-04-16 修正ログ

### #wordwave-stats スタイル調整

`#wordwave-stats` に `margin-top: 0.8rem; line-height: 0.8` を追加。（`app/app.css`）

### Dictation near_miss / phonetic を不正解扱いに変更

**変更前**: near_miss（レーベンシュタイン距離=1）・phonetic（発音類似パターン）は `isCorrect = true` として正解扱いで SRS 処理されていた。

**変更後**:
- near_miss / phonetic → 即座に SRS 不正解登録。フィードバックは「惜しい、もう一度 | ギブアップ」（正解スペルは見せない）。入力欄は再入力可能（全選択状態）
- 再入力 → perfect: word 状態をスナップショットから復元 → `_srsProcessed = false` → `_markReady('perfect')` で SRS 正解上書き。統計の `sessionWrong--` も補正
- ギブアップボタン: 入力欄に正解スペルを表示・disabled 化（SRS 不正解は確定）
- near_miss 時はリトライカード挿入をスキップ（その場でリトライ可のため）
- 完全不正解（wrong）は従来通り

（`app/ui-cards.js` `_renderDictation` / `app/app.js` `_onCardAnswered`）

---

## 2026-04-15 修正ログ

### choiceLabel ビルド漏れ修正

`scripts/build_word_data_js.py` の `entry_to_js()` に `choiceLabel` 出力処理が抜けていたため、`word_data_final.json` の 144 件が `core/word-data.js` に反映されていなかった。`distractors` の直後に `choiceLabel`（値が null のエントリは出力しない）を追加し、`word_data_final.json` から再ビルド。

### Bug 14: Word Wave が2回繰り返して表示される

スタート画面で Word Wave を一度開いた後、セッション開始 → セッション完了 → 再度 Word Wave を開くと Wave 1-19 が2回表示される。
原因: `_initHeatmapEarly()` で `WordWaveRenderer` を生成・`_build()` 済みの状態で `_boot()` が呼ばれると、`#wordwave-body` をクリアせず新インスタンスを生成するため `_build()` が既存 DOM に Wave 1-19 を再 append していた。
修正: `_boot()` 内の新インスタンス生成前に `#wordwave-body.innerHTML = ''` でクリア（reset パスと同じ処理）。（`app/app.js` `_boot()`）

---

## word-data.js 品質監査ログ（2026-04-09）

`vocabflow-word-data-audit-instructions.md` に基づき実施。修正スクリプトは `scripts/phase*.py`。

### 修正サマリー

| Phase | 内容 | 件数 |
|---|---|---|
| 2-1 | 句点なし修正（etymology/tips/confusables/trivia 文末に `。` 付与） | 283件 |
| 2-2 | collocations の日本語訳除去（全角・半角括弧内の日本語を削除） | 1,884件 |
| 2-3 | audioHint の注釈除去（13件の特定エントリをカタカナ読み1つに絞る） | 13件 |
| 3 | 個別修正（致命的バグ・論理矛盾・虚偽記述・confusableSpellings 正答混入） | 6エントリ |
| 1 | Claude Sonnet API 検証で発覚した事実誤認・論理矛盾の修正 | 37エントリ |
| 4-2 | trivia 文末 `！` → `。` 統一 | 750件 |

---

## word-data.js 追加品質修正ログ（2026-04-13）

`vocabflow-distractor-fix-instructions.md` に基づき実施。修正スクリプトは `scripts/fix_distractor_and_meaning.py`・`scripts/fix_korean_remaining.py`。

### 修正サマリー

| 問題 | 内容 | 件数 |
|---|---|---|
| distractor 同義語衝突（致命的） | 四択の不正解選択肢に正解とほぼ同義の訳が含まれていた | 7件 |
| distractor 同義語衝突（要注意） | 意味が近いが用法・品詞が異なる — それでも紛らわしいため差し替え | 5件 |
| ハングル混入 | meanings/distractors/passive.etymology にハングルが混入（LLM生成トークン混入） | 13件 |
| カタカナのみ meaning | 和語・漢語の言い換えがなく正解が音から推測可能 | 9件 |

### distractor 致命的7件の詳細

- **#400 nevertheless / #1000 nonetheless**: 相互に相手の meaning が distractor に入っていた → 別意味の副詞訳に差し替え
- **#1000 nonetheless**: #497 regardless の meaning も distractor に → 差し替え
- **#357 vote**: #1062 poll の meaning「世論調査・投票」が distractor に → 差し替え
- **#1383 indispensable**: #584 vital の meaning「不可欠な、極めて重要な」が distractor に → 差し替え
- **#1389 fragile**: #1283 delicate の meaning「繊細な、壊れやすい」が distractor に → 反義語「丈夫な、頑丈な」に差し替え
- **#1399 inherent**: #1189 indigenous の meaning「先住民の；固有の」が distractor に → 差し替え

### ハングル混入13件

- distractors: `손상されていない` (#99/#492/#696/#1495)、`훑어보다` (#134/#638/#1038/#1730)
- meanings: `귀중한` (#879 precious)、`훑어보다` (#926 scan)
- etymology: `넘치다` (#333 surround)、`넘れ` (#1192 abundant)

### カタカナのみ meaning 9件

site/web/concrete/mall/penalty/fantasy/horror/cluster/barrel に和語・漢語の言い換えを追加。

### 正マスターの更新

`scripts/results/word_data_final.json` を更新（旧版は `.bk20260413` でバックアップ）。`build_word_data_js.py` で再ビルド・デプロイ済み。

---

## word-data.js choiceLabel 導入ログ（2026-04-13）

`word-data-spec.md` の改訂（choiceLabel フィールド追加）に基づき実施。

### 概要

Recognition カード（四択）の正解ラベルにカタカナが含まれると英単語の音から推測できてしまう問題（146語）を解消。

### 変更内容

- **スキーマ**: `choiceLabel: String?` を追加（省略可・fallback 方式）
- **UI**: `app/ui-cards.js` に `getChoiceText()` を実装（`choiceLabel ?? meanings[0].meaning`）。履歴ビューの正解ボタンハイライトも同ロジックで統一
- **バリデーション**: `scripts/validate_word_data.py` に choiceLabel チェック追加（空文字禁止・カタカナ3文字以上禁止・distractor 重複禁止）
- **データ**: 144語に `choiceLabel` を追加（Claude API バッチ処理 142語 + 手動 2語）
  - 生成スクリプト: `scripts/generate_choice_labels.py`
  - スキップ（null）: 該当なし（全144語に定義）
  - 手動修正: #361 web → `蜘蛛の巣`、#1821 browse → `閲覧する`

### Phase 3 個別修正（致命的・手動）

- **#875 prefecture**: blankAnswer が `"Kyoto"` → 例文・blankAnswer を `"prefecture"` に差し替え
- **#1249 syndrome**: blankAnswer が `"Down syndrome"` → 例文・blankAnswer を `"syndrome"` に差し替え。trivia（サンドロ虚偽記述）もインポスター症候群の正確な解説に差し替え
- **#132 regard**: tips の混同元 `'consider A as B'` → `'consider A to be B'` に修正
- **#107 solve**: tips の論理矛盾（for を使うなと言った直後に for 付き例）を整合性ある説明に差し替え
- **#1562 makeup**: confusableSpellings から正答 `"makeUp"` を除去し `"make-up"`, `"maikup"` に差し替え
- **#366 crisis**: trivia に JFK 俗説であることを明記、「機」の本来の意味を補足

### Phase 1 API検証の判断基準

- **53件の error** を確認。うち約15件は false positive（AI誤検出）と判断してスキップ
- スキップ基準: テキストが言語学的に正確、または API が引用した語句が実際のテキストに存在しない場合
- **68件の warning** は今回対応なし（内容が不完全・表現が曖昧な程度で誤りではない）

### 再ビルド手順（次回修正時）

```bash
# 最終データ（word_data_final.json）を起点に修正 → 再ビルド
python3 scripts/build_word_data_js.py scripts/results/word_data_final.json

# バリデーション
python3 scripts/validate_word_data.py scripts/results/word_data_final.json
```

中間ファイル（`scripts/results/`）:
- `word_data_fixed.json` — Phase 2 以前のベースライン
- `word_data_phase2.json` / `word_data_phase3.json` / `word_data_phase1_fixed.json` — 各 Phase の出力
- `word_data_final.json` — **現行の正マスター**（trivia ！→。統一済み）
- `verification_results.json` — Phase 1 API 検証結果（121件: error 53 / warning 68）

### Phase 4 仕様決定

- **不規則動詞 blankAnswer**（drew/tore/arose/hung/spun/clung/swore）: 活用形のまま維持（仕様確認済み）
- **trivia 文末スタイル**: `。` に統一（`！` 終わり 750件を変換済み）

---

## SRS パラメータ研究ログ（2026-04-08〜09）

### テーマ：h0 動的制御と学習者ライフスタイルへのアダプティブ最適化

詳細は `scripts/results/h0decay_report.md` を参照。

#### 検討した仮説と結果

**仮説 1: h0 decay（0.98/語）**
同日導入語の位相同期を解消するため、N 語目の h0 を `h0 × 0.98^N` で減衰させる。
→ まとめ消化で復習なしが増加。原因：peakH≥2.0 到達に必要な review 回数が増え Wave 解放が遅延。

**仮説 2: セッション間隔逆算 h0**
`h0 = sessionInterval / retentionFactor`（4分→h0=0.012、2.5h→h0=0.444）
→ 足踏み効果（h が育たない）は正しく動作するが、Wave unlock が崩壊して復習なし 5 倍増。

**仮説 3: alpha 引き下げ（1.3〜1.8）で daily due を増やす**
h の成長を抑えて翌朝 due に留まる語を増やす。
→ 逆効果。peakH 成長が遅くなり Wave 2 解放が大幅遅延。alpha=1.3 では 21 日間 Wave 2 が解放されず。

#### 核心的発見

**「h の成長を抑制して daily due を増やす」と「Wave を早く解放して新語を供給する」はトレードオフ。**

Wave unlock が `peakH≥2.0`（70%基準）に依存する以上、h 成長を遅らせる施策は必ず Wave 解放を遅らせる。毎朝学習者（1日1回・5セッション集中）にとって、新語供給は due 語と同等以上に重要。

**毎朝 5 セッション学習者への最適パラメータ: 現行デフォルト（alpha=2.0, targetRetention=0.85）が最良。**

#### 検討結果（2026-04-09）

1. **`waveSize` 変更の効果検証** ✅ **完了・採用済み**  
   - 縮小方向（25語）は逆効果：1日で Wave を使い切り復習なし急増  
   - **拡大方向（100語）が正解**：25語/日ペースで4日間新語が続き、Wave 2 解放までの谷がなくなる  
   - waveSize=100 で朝集中学習者（4分間隔×5SS）の復習なしがゼロに（vs waveSize=50 で2.6回/30日）  
   - `core/config.js` の `waveSize` を 50 → **100** に変更済み。1900語が19波に整理
2. **Wave unlock 条件を review 回数ベースに変更**し、h 成長速度から切り離す（未実装）
3. **「学習者ライフスタイルへのアダプティブ動的 Word Wave」**：1日のセッション間隔を検出し、パラメータを自動調整するコンセプトが浮上（未実装）

---

## 教材データ生成（✅ 完了）

全95バッチ（1900語）の生成・検証・ビルドが完了。

```bash
# 再ビルドが必要な場合（品質監査適用後の正マスターから）
python3 scripts/build_word_data_js.py scripts/results/word_data_final.json
python3 scripts/validate_word_data.py scripts/results/word_data_final.json
```

中間ファイル:
- `scripts/results/word_data/batch_001〜095.json` — バッチ別生成データ
- `scripts/results/word_data_raw.json` — 全バッチ統合（生データ）
- `scripts/results/word_data_fixed.json` — distractors差し替え・sanitize済み（品質監査前ベースライン）
- `scripts/results/word_data_final.json` — **現行の正マスター**（品質監査全Phase適用済み）

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

### Bug 12: 履歴ビューで不正解ハイライトが2回目以降消える
4択問題で不正解後、次カードへ進んで戻ると正解（緑）・不正解（赤）が再現されるが、
もう一度進んで戻ると不正解（赤）のハイライトが消える。
原因: `renderHistoryView()` が `_markReady('history')` を呼ぶ際、復元した `savedOnReady` が
`_onCardAnswered('history')` を呼び出し、`card.result` を `'wrong'` → `'history'` に上書きしていた。
修正: `onReady` callback に `!card._srsProcessed` ガードを追加し、処理済みカードへの
`_onCardAnswered` 二重呼び出しを防止。
（`app/app.js` CardRenderer `onReady` callback）。

### Bug 8: 復習なし画面の待機時間が減らないように見える
`_calcWaitHours()` が `Math.round` で時間単位に丸めるため、1.4h も 0.5h も「約1時間後」と表示され、
ユーザーが待機してリロードしても表示が変わらないケースがあった。
`_calcWaitDisplay()` に改名し、60分未満は分単位・以上は時間単位で表示するよう変更。
あわせて復習なし画面に「更新」ボタンを追加（押下時に経過時間を反映して `_startSession()` を再呼び出し）。
（`app/app.js` `_calcWaitDisplay` / `_showNoWork`）。

### Bug 13: 復習なし画面「更新」→ wave トースト未表示（修正済み）
復習なし画面から「更新」ボタンでセッションを開始したとき、wave 5→6 の intro カードが
登場したにもかかわらずトーストが表示されなかった。
原因（推定）: ① `savedAt` メモリ未更新バグによる `currentTime` の過大進行、② excluded 単語が
`maxStudiedWaveBefore` を誤って引き上げていた可能性。
修正①: `_saveState()` 冒頭に `this.state.savedAt = Date.now()` を追加し `LearnerState.toJSON()` は
`savedAt: this.savedAt ?? Date.now()` に変更（二重カウント防止）。
修正②: `maxStudiedWaveBefore` の計算に `!w.excluded` を追加し excluded 単語を除外。
修正③: `generateSession()` 前後の `waveUnlockEvents` 差分を取り、このセッションで解放直後の
wave も確実にトーストを発火するよう belt-and-suspenders 対応。
（`app/app.js` `_startSession` / `_saveState` / `core/models.js` `LearnerState.toJSON`）。

### Bug 14: Word Wave が2回繰り返して表示される（修正済み）
スタート画面で Word Wave を一度開いた後、セッション開始 → セッション完了 → 再度 Word Wave を開くと Wave 1-19 が2回表示される。
原因: `_initHeatmapEarly()` で `WordWaveRenderer` を生成・`_build()` 済みの DOM に対し、`_boot()` が `#wordwave-body` をクリアせず新インスタンスを生成するため `_build()` が Wave 1-19 を再 append していた。
修正: `_boot()` 内の新インスタンス生成前に `#wordwave-body.innerHTML = ''` を追加。（`app/app.js` `_boot()`）

### 全波制覇オーバーレイの誤発火（修正済み）
Wave N（最後の波）クリア時に他波が未完でも「全波制覇」が表示されていた。`_showWaveComplete` を全非除外語の `stage === 'mastered'` チェックに変更。（`app/app.js`）

### dev モードで Wave 4 以降が activeWaves に混入（修正済み）
`totalWaves = ceil(1900/3) = 634` により空 wave が unlock されスタート画面に「第4波到達中」と誤表示。`DEV_CONFIG` に `totalWords` を追加 + `checkUnlock` の防御追加。（`app/app.js` / `core/wave-manager.js`）

### savedAt メモリ未更新バグ（修正済み → Bug 13 修正①と同一）
`_saveState()` 冒頭で `this.state.savedAt = Date.now()` を追加。
`LearnerState.toJSON()` を `savedAt: this.savedAt ?? Date.now()` に変更。
これにより「更新」ボタンの elapsed 計算が常に「最終 save からの実経過時間」になる。

### mastered 復元が h チェックなしに発火するバグ（修正済み）
mastered-stage の単語が recall カード（`_assignCardType` の default）で不正解 → リトライ recall に `stageBeforeWrong='mastered'` → リトライ正解で `word.stage = 'mastered'` が直接代入され、h < masteredThresholdH でも mastered toast・`_checkWaveComplete` が発火していた。
リトライ設計刷新（2026-04-21）により解消。リトライカードは降格後 stage に基づく種別で生成され、正解時も `processResponse` を経由するため mastered 復帰には h ≥ 14.0 が必要。
（`app/app.js` / `core/models.js` / `sim/sim-runner.js`）

---

## シミュレーション実績（waveSize=100・供給ベース wave 解放・定着=`stage === 'mastered'`・deltaTGain=true・間隔効果あり virtual-learner）

| Day | 定着語数 | 学習済み | avgH | Wave |
|-----|--------|--------|------|------|
| 30  | ~99  | ~141 | ~31日 | [1,2] |
| 60  | ~181 | ~229 | ~59日 | [3] |
| 90  | ~264 | ~303 | ~87日 | [3,4] |
| 180 | ~463 | ~499 | ~164日 | [5] |
| 365 | ~800 | ~830 | — | [9] |

正解率 ~81%、Wave は just-in-time で解放。**1000語定着は 365日内に未到達（Day365 で ~800・wave9）**。2026-06-11 に #1（deltaTGain）を ratio 正規化で校正して既定 true 化し、検証のため virtual-learner を間隔効果ありの独立した真の記憶モデルに刷新（下記修正ログ参照）。これにより旧ベースライン（cram 膨張込み・D90 ~485・D180 ~850・1000語 Day ~223）から大幅に保守化した。これは間隔効果（クラミング不可）＋ deltaT 連動の保守的成長による honest な値。**app（実ユーザー）の体感は不変**（deltaTGain は core 一元のため app/sim 同経路だが、上級ドッグフーダーは語を既知のため sim とは別ペース）。

> **⚠️ sim デフォルト learner（初学者）と実ユーザー（既習）の乖離**: 上表は `VirtualLearner` のデフォルト（`ability=1.0`・`hVariation=0.3`＝**真の novice**・語ごと難度バラつき大）の値。実ドッグフーダーは**上級・語をほぼ既知**（`ability` 高・`hVariation` 小）で、ペースは sim の 3〜4倍（[ドッグフーディング実績](memory)）。この乖離は単なる速度差ではなく**機構の顕在化レジームを分け得る**: **deltaTGain（#1）の校正価値**は初学者（推定誤差が間隔起因で大きい）で顕在化＝校正MAE 大幅改善で立証済み。一方 **dueSampling の位相同期分散**は理論上は既習（難度均一でコホートがロックステップ）で出るはずだが、N=24 では既習でも Δ定着 +1.3（SE±2.2）で**有意差は立証できなかった**。タイミング系機構を sim 評価するときは**測りたい機構に合う learner プロファイルを選び（`ability`/`hVariation`）、N≥20 + 標準誤差**で判定すること。デフォルト1本・小標本では符号すら定まらない。

---

## コアモジュール設計のポイント（spec v3 準拠）

### srs-engine.js
- passive: h 更新しない（mastered 語のみ lastReviewed を更新＝維持クレジット）
- intro: h = h0, stage = recognition
- recognition → recall: h ≥ recognitionThresholdH (2.0日)
- recall → dictation: h ≥ dictationThresholdH (4.0日)
- 定着済み: dictation クリア かつ h ≥ masteredThresholdH (14.0日)
- h範囲: `[cfg.hMin, cfg.hMax]` = `[0.5, 365]`
- h更新後に `peakH = max(peakH, h)` を記録

### feed-generator.js（グリーディ方式）
```
skipped（最優先） → urgent（pRecall昇順） → due（pRecall昇順） → new（先着順） → filler（ランダム）
早期終了: skipped=urgent=due=new=0 なら [] を返す
```
- skipped 語は stage='new' フィルタより先に評価（逃げ切り不可）
- excluded 語は new プール含む全プールから除外（`w.excluded` チェック）
- recognition 復習カードは `reviewRecognition` として recall と同列配置（Bug 1）
- mastered 語が `p < targetRetention` なら due プールに追加（Bug 4）
- `_interleaveIntroRecognition`: キュー方式で Intro→Recognition 間 MIN_GAP=2 を保証（Bug 6）。dictation/handwrite もフィラープールに統合（後半固定廃止）
- `_enforceMaxConsecutive`: 同種カード 3 連続を best effort で解消（Spec §4.3 ルール 1）

### wave-manager.js
- 解放条件: アクティブ wave 全体の `new` 語が `maxNewPerSession`（5）未満になったら次 wave を解放（供給ベース）
- 卒業判定（`_isGraduated`）: **非除外語** のうち `h >= graduationH(8.0)` が 90%+。ただし **excluded を分母から除外**し、**非除外 new 語が1つでも残る間は卒業させない**（孤児化・excluded 居座り防止。review #4）
- 即時トリガー: generateSession 冒頭で毎回 checkUnlock
- **`maxActiveWaves` 撤廃**: 解放条件ゲートのみで制御。学習者のペースに委ねる設計
- `waveUnlockRatio`・`waveUnlockH` は config に定義を残すが wave-manager では参照しない（sim/scenarios.js 用）

### core/labels.js（UIラベル一元管理）
- `LABELS`: params / pools / cardTypes / stages / session / wordwave / heatmap の定数オブジェクト
- `formatH(h)`: h（日）→ 人間可読文字列（例: 12.3日、3.1ヶ月、1.2年）
- `formatPRecall(p)`: 0〜1 → パーセント文字列
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
- **復習なし画面**: `_showNoWork()` が card-wrapper にインライン HTML を注入（overlay ではなくカード領域に表示）。ヘッダ（ヒートマップ・統計）とフッタは常時表示。`_calcWaitDisplay()` で「意味あるセッションが組める時刻」を予告（60分未満は分単位・以上は時間単位）。「更新」ボタン押下時に経過時間を `currentTime` に加算して `_startSession()` を呼び直し、開始可能なら即セッション開始。`_updateStats()` を呼んでヒートマップを描画
- **TTS**: Recognition 回答後に単語を読み上げ、Recall 回答後に例文（HTMLタグ除去済み）を読み上げ。カード遷移時（`_showCard` 冒頭）に `speechSynthesis.cancel()` で停止
- 時間早送り: 次のセッション(1/3日)・翌日・1週間後。ボタンラベルは `LABELS.session.timeForward1/2/3`
- localStorage キー: `vocabflow_state_v1`
- Word Wave: `app/ui-wordwave.js`。ヘッダバークリックで全画面表示。単語タップでポップオーバー（pRecall・最終復習日・除外ボタン付き）。一括除外モード（🗑️）対応。
- Handwrite カード: 音声を聞いて紙に手書き10回 → カメラ/ギャラリーで写真送信 → AI OCRモック（文字スキャン風に表示）→ 常に perfect 判定で h ブースト
- 日本語訳トグル: Intro は常時表示。Recall は回答後にアクティブ化（回答前は disabled でグレーアウト表示）
- **Passive カード 1セクション表示**: `WordState.passiveCursor` で etymology/tips/confusables/collocations/trivia をローテーション。`Card.passiveSection` に確定値を保存し履歴ビューで同じセクションを再現。collocations チップはタップで Google 検索（`https://www.google.com/search?q=フレーズ`）
- **Wave 表示**: `stage !== 'new'` の最大 `waveNumber`（学習が始まった最大波番号）。解放済みでも未学習の wave はカウントしない

### _calcWaitDisplay（復習なし画面の予告時刻）
```
newCount  = アクティブウェーブ内の未学習語数（maxNewPerSession 上限）
needed    = max(1, ceil(sessionSize / 2) − newCount)
予告時刻   = 学習済み語の nextDueTime（lastReviewed + h × retentionFactor）を昇順ソートした needed 番目
```
- new が多い（5語）→ needed=5 と小さくなり早い予告。new が枯渇 → needed=10 で due 待ちのため遅い予告
- 「1語目が due になる時刻」（旧）では戻ったら filler 19枚だったが、新ロジックは 8/8 チェックポイントで meaningful ≥ 10 枚を保証（`scripts/verify_wait_display.js` で検証済み）

### sim-runner.js（リトライ処理）
```
リトライカード種別: feedGen._assignCardType(word, state) で降格後 stage から決定
  例: dictation wrong → stage=recall → retry recall
      mastered recall wrong → stage=dictation → retry dictation
全カード（通常・リトライ・不正解）: processResponse 呼び出し（通常の h 更新 + 昇格判定）
```
スナップショットには10日ごとに `heatmapData`（全語のh値配列）を保存。

---

## バージョン管理

- ローカル git リポジトリ（`main` ブランチ）
- 直近コミット: リセットボタン整理・スタート画面に確認ダイアログ追加（bf88997）
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
├── README.md             # プロジェクト入口（概要・起動方法・構成。人間向け）
├── spec.md               # SRS仕様書 v3（必読）
├── spec.md.bk20260330    # v2 バックアップ
├── word-data-spec.md     # 単語データ仕様
├── 1900_words_list.md    # 1900語リスト（語順=wave順）
├── package.json          # "type": "module"
├── classification-spec.md# カテゴリ分類作業仕様書（18カテゴリ体系・作業フロー）
├── .gitignore
├── icon.png              # 波アイコンのマスター画像（1024px透過。wave-icon.png の生成元。deploy 対象外）
├── scripts/              # 各種スクリプト群
│   ├── batch_extract.py         # 1900語→20語×95バッチ分割
│   ├── classify_all.py          # 全1900語のcategoryId定義（AI判定済み）
│   ├── generate_word_data.py    # Claude API で教材データ一括生成（✅ 全95バッチ完了）
│   ├── fix_distractors.py       # distractors を実単語意味で差し替え
│   ├── generate_choice_labels.py      # choiceLabel を Claude API で生成（初回144語）
│   ├── fix_missing_choice_labels.py   # choiceLabel 漏れ補完（audioHint表記ゆれ対策・56語追加）
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
│   ├── labels.js            # LABELS定数・formatH/formatPRecall（ui-labels-spec.md準拠）
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
    ├── style-mockup.html # スタイル確認用モックアップ（6種カード・画面遷移・ヘッダ/フッタを静的表示）
    ├── debug.html        # iOS Chrome 向け localStorage 閲覧デバッグページ（Wave サマリ・詳細・JSON コピー）
    ├── wave-icon.png     # 波のブランドアイコン（インライン用・192px透過。.wave-icon クラスで使用）
    ├── wave.jpg          # body 背景の波写真（Unsplash・Tim Marshall・557KB）
    └── about.wave.jpg.txt# wave.jpg のクレジット表記（Unsplash 帰属）
```
