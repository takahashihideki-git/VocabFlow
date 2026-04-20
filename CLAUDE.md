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
| `core/config.js` | ✅ handwriteStuckThreshold: 3・recognitionThresholdH: 2.0・masteredThresholdH: 14.0 追加済み。`maxActiveWaves` 撤廃（wave 解放はSRSペースに委ねる）。**waveSize: 100**（朝集中学習者の復習なし解消のため 50→100 に変更済み） |
| `core/models.js` | ✅ WordState: stuckCount/needsHandwrite/skipped/excluded/passiveCursor 追加。Card: done/userAnswer/shuffledChoices/bgUrl/passiveSection 追加。LearnerState: handwriteModeEnabled・savedAt 追加 |
| `core/srs-engine.js` | ✅ Handwrite 停滞介入ロジック。昇格時のみ stuckCount リセット。handwrite はステージ遷移なし |
| `core/wave-manager.js` | ✅ Bug 5 修正済み。`maxActiveWaves` 上限撤廃（解放条件ゲートのみで制御） |
| `core/feed-generator.js` | ✅ skipped 最優先プール（stage='new' フィルタより先）。excluded 語を全プールから除外。_assignCardType に learnerState 渡し。**Spec §4.3 配置ルール更新（2026-04-20）**: `_enforceMaxConsecutive()` 追加（同種最大2連続 best effort）。dictation/handwrite を後半固定から解放し review pool に統合 |
| `core/word-data.js` | ✅ 全1900語フルデータ（meanings/examples/passive等）。`scripts/build_word_data_js.py` でビルド済み。**品質監査（2026-04-09）で全Phase修正適用済み**（詳細は下記「word-data.js 品質監査ログ」参照）。**choiceLabel 144件反映済み**（2026-04-15: ビルドスクリプトの出力漏れ修正 → 再ビルド） |
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
| `app/app.html` | ✅ PC用前後ナビボタン・Word Wave overlay。ヘッダーに Day N 表示。アプリ表示名「Word Wave」。`#toast` 要素追加。スタート画面タグラインを動的グリーティングに変更（3dot loading アニメーション付き）。wave全mastered達成オーバーレイ（`#overlay-wavecomplete`）追加。`#pc-nav-btns` を `#card-wrapper` 内に移動（カード右端近くに配置）。セッション完了画面: btn-primary（続ける）を time-controls の上に配置。**`#heatmap-section` を `#app` 外（body直下）に移動し常時表示**。`#card-area`・`#footer` は boot まで `display:none`。**セッション完了画面・復習なし画面のリセットボタンを削除**（スタート画面のみに集約）。**セッション完了タイトル（`#oc-title`）を動的メッセージに変更**（`_getSessionTitle()` で設定） |
| `app/app.js` | ✅ スキップ・戻りスワイプ・履歴ビュー。WordWaveRenderer 統合。passive-scroll とのスワイプ干渉修正済み。トースト通知・回答確定時SRS処理（`_onCardAnswered`）・カード遷移時TTS停止。スタート画面動的グリーティング。**実時間追跡**（`_boot()` で `savedAt` 差分を `currentTime` に加算）。**復習なし画面**を card-wrapper に直接注入（ヘッダ/フッタ維持・待機時間表示・更新ボタンを time-controls 上に配置）。**Intro/Passive を正解・不正解カウントから除外**。**wave全mastered達成オーバーレイ**（`_checkWaveComplete`・`_showWaveComplete`、Wave 1/中間/最終波でメッセージ分岐）。**Wave 表示**はセッション中 intro カードも考慮した最大 waveNumber。**wave トースト**は「そのwaveの最初の intro カードがセッションに登場した瞬間」に発火。**復習なし画面**で innerHTML 置換前に pc-nav-btns を退避・復元（時間早送り後の btn-next-card null エラー修正）。**`_initHeatmapEarly()`**: constructor で localStorage から state を早期ロードしヒートマップ・WordWaveRenderer を初期化（`requestAnimationFrame` で初回描画・スタート画面でも Waves 閲覧・除外操作が可能）。`_buildStartGreeting()` は `this.state` を再利用（localStorage 二重パース廃止）。**スタート画面「リセットして再開」に `confirm()` ダイアログ追加**（誤操作防止）。**`_getSessionTitle()`**: セッション完了タイトルをパフォーマンス連動で動的生成（久しぶり復帰・全問正解・正解率別に各複数バリエーションからランダム選択）。`_elapsedAtBoot` で前回 save からの経過日数を保持し久しぶり検出に使用（正解率 50%以上のときのみ「おかえり。」等を表示）。**Bug 14 修正**: `_boot()` で `#wordwave-body` をクリアしてから新 WordWaveRenderer を生成（スタート画面で一度開いた後の重複表示を防止）。**Dictation near_miss 対応**: `_onCardAnswered` で `card._dictationNearMiss` フラグ時はリトライカード挿入をスキップ、`card._dictationNearMissOverwrite` フラグ時は `sessionWrong--` で統計を補正 |
| `app/ui-cards.js` | ✅ 6種カードUI・TTS。全1900語の生成データを統合済み。**Passive カードは1回に1セクションをローテーション表示**（`WordState.passiveCursor` で管理、`Card.passiveSection` に確定値を保存して履歴ビューでも再現）。collocations チップは Google 検索リンク（`<a>`）。履歴ビュー完全再現（元 render メソッド流用・インタラクション無効化）。Intro/Recall に日本語訳トグル追加。Recognition 回答後に単語TTS・Recall 回答後に例文TTS。**Recall 回答後に `blankAnswer`（活用形）で例文を完成表示**（選択タップ時に差し替え・履歴ビューも対応）。**`getChoiceText()`**: Recognition 四択の正解ラベルに `choiceLabel ?? meanings[0].meaning` の fallback を実装（カタカナ推測防止）。履歴ビューの正解ボタンハイライトも同ロジックで統一。**Dictation near_miss / phonetic を不正解扱いに変更**: 入力時に word 状態をスナップショット保存 → `_markReady('wrong')` で即座に SRS 不正解登録 → 再入力可。再入力で perfect が出たらスナップショット復元 → `_srsProcessed = false` → `_markReady('perfect')` で正解上書き。フィードバックは「惜しい、もう一度 \| ギブアップ」（正解を見せない）。**ギブアップ押下で input を緑（correct）強調表示・フィードバックを dismissed（opacity 0.3）でグレーアウト**（2026-04-20） |
| `app/ui-heatmap.js` | ✅ excluded 語の色追加。ツールチップ h 表示を formatH・LABELS に統合 |
| `app/ui-wordwave.js` | ✅ Word Wave 全画面ビュー。単語除外・一括除外モード対応。ポップオーバーに pRecall・最終復習日追加。Wave 表示を学習済み最大波番号に統一 |
| `app/ui-background.js` | ✅ BackgroundManager（getUrl/preload）。CATEGORY_IMAGES からカテゴリ別ランダム画像URL取得 |
| `app/app.css` | ✅ 前後アニメーション・PC ナビボタン・Word Wave スタイル。タッチ環境ではカードをフルスクリーン表示（`body.no-touch` で 9:16 維持）。フォントサイズ引き上げ（choice-btn/passive-section-body: 16px、passive-section-title: 13px、collocation-chip: 16px）。`overscroll-behavior: none` で iOS バウンス無効化。Passive リッチUIスタイル。日本語訳トグルスタイル。トーストスタイル。nowork-card・wc-card・oc-sectionスタイル追加。`#pc-nav-btns` を `right: -14px` で card-wrapper 右端近くに配置。`.choice-btn:hover` を `body.no-touch` にスコープ限定（iOS でのホバー貼り付き防止）。`.collocation-chip` に `color: inherit; text-decoration: none`（`<a>` タグ対応）。**`body` を `flex-direction:column` に・`#app` を `flex:1` に変更**（heatmap 常時表示レイアウト対応）。**`#start-screen` / `.overlay` の `top` を `var(--heatmap-h)` に変更**してヒートマップを隠さないよう調整。**`--text-example: #ccc` 変数追加**。`.card-intro .word-example` を font-size: 20px・color: var(--text-example) に変更。`.card-recall .word-example`・`.example-ja` も color: var(--text-example) に統一。**`#wordwave-stats` に `margin-top: 0.8rem; line-height: 0.8` 追加**。**`.word-input.near`・`.giveup-btn` スタイル追加**（Dictation near_miss UI用）。**`.word-input.correct:disabled { opacity: 1 }` 追加**（disabled でもグレーアウトしない）。**`.answer-feedback.dismissed { opacity: 0.3 }` 追加**（ギブアップ後の非活性化表示） |
| `app/style-mockup.html` | ✅ 6種カード・画面遷移（スタート/セッション完了/復習なし）・ヘッダ/フッタを静的表示するスタイル確認用モックアップ。復習なし画面はヘッダ+カード+フッタのフルレイアウト（`.mockup-phone-frame`）で表示。Passive カードは1セクション1カードのローテーション例を3カラムで表示 |

---

## 次セッションの残タスク

- 現時点で未解決のバグはなし。
- 検討候補: Wave unlock 条件を review 回数ベースに変更（h 成長速度から切り離す）

---

## 2026-04-20 修正ログ

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

### savedAt メモリ未更新バグ（修正済み → Bug 13 修正①と同一）
`_saveState()` 冒頭で `this.state.savedAt = Date.now()` を追加。
`LearnerState.toJSON()` を `savedAt: this.savedAt ?? Date.now()` に変更。
これにより「更新」ボタンの elapsed 計算が常に「最終 save からの実経過時間」になる。

---

## シミュレーション実績（waveSize=100・デフォルト設定）

| Day | 定着語数 | 学習済み | avgH | Wave |
|-----|--------|--------|------|------|
| 30  | ~100-110 | ~145-155 | ~33日 | [2,3] |
| 60  | ~225-240 | ~260-275 | ~74日 | [3,4] |
| 90  | ~320-340 | ~360-380 | ~113日 | [4,5] |
| 180 | ~620-640 | ~650-670 | ~211日 | [7,8] |
| 307 | ~1000 | ~1030 | — | — |

正解率 75〜85%、Wave は順次解放（19波体制）、**1000語定着が Day 307 で到達**（旧 waveSize=50 の Day 363 より56日短縮）。

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
- `_interleaveIntroRecognition`: キュー方式で Intro→Recognition 間 MIN_GAP=2 を保証（Bug 6）。dictation/handwrite もフィラープールに統合（後半固定廃止）
- `_enforceMaxConsecutive`: 同種カード 3 連続を best effort で解消（Spec §4.3 ルール 1）

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
- `uncertain` プールの語（σ > uncertainThreshold）は needed 計算に含まないため予告が若干保守的（遅め）になるが、「戻ったら内容が薄い」逆誤りは発生しない

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
