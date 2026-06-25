# 記憶コア検証レポート — Ebisu / オラクル指標 / スケジューリング構造

**日付**: 2026-06-24
**位置づけ**: 独立した検証レポート（README / spec.md への反映は未実施・本レポートで合意してから）
**一行要約**: 「記憶コアを何にするか」より「**新語供給を絞らないスケジューリング構造**」が支配的レバーだと判明。健全な構造なら現実的（べき則）忘却の下で**どのコアでもオラクルの 96〜99%**に届く。「適応導入（観測成功率ゲート）」は**べき則真実では near-oracle**だが、**exponential 真実では絶対アウトカムが壊滅**（標準 sim Day90 定着 245→2）＝**「現実=べき則」への賭け**であり、`%oracle` がその絶対崩壊を隠していた（policy-matched オラクルとの比較のため）。**greedy（現行既定）が真実不確実性に頑健**で、現時点の結論は「既定維持」。検証の過程で、校正MAE という物差しの circular 性、deltaTGain の優位の交絡、Ripple Seeding の真の頑健性、`%oracle` が絶対崩壊を隠す罠、そして spec の「貪欲方式＝意図的な認知負荷スロットル」が（べき則なら）裏目・（exponential なら）正解という二面性を明らかにした。

---

## 0. 発端

- README を「不確実性連動の播種ノイズを持つ HLR」と強気に書いた直後、「教科書的ベイジアン SRS ではない」という記述に疑問が生じ、実在する本物のベイズ SRS **Ebisu**（fasiha/ebisu）を発見。
- 別の AI スレッドが「SRS を丸ごと Ebisu に置き換えよ」と即答したことへの健全な懐疑から、**思いつきでなく sim で実証する**方針に。
- Ebisu は記憶モデル**コンポーネント**（predictRecall / updateRecall）であって学習システムではない＝置き換え対象は我々の `srs-engine` の h 推定層のみ、と切り分けた。

---

## 1. 構築した検証インフラ（すべて `memoryCore='hlr'` 既定でゼロ影響・gated）

| 資産 | 内容 |
|---|---|
| `core/ebisu.js` | Ebisu v2 の Beta/GB1 数学の移植（predict/update/halflife・単体検証済） |
| `core/dsr.js` | べき則忘却＋安定度成長（FSRS 系）の記憶コア |
| `memoryCore` フラグ | `hlr`（既定）/ `ebisu` / `dsr` を core で切替。`word.h` に halflife 同期・`pRecall` を各コアの推定に差替 |
| 真実モデル族（`sim/virtual-learner.js`） | `alpha`（指数則・HLR 同族）/ `dsr`（べき則・FSRS 系・中立）/ `ebisu`（Ebisu 生成過程） |
| 観測ノイズ層 | `slipRate`（既知語を誤って wrong 観測）/ `guessRate`（未知語をまぐれ perfect 観測）。真の記憶は本物の retrieval で更新し観測だけ汚す |
| オラクル・ハーネス（`scripts/verify_oracle.js`） | feed-generator に `recallFn`/`dueHFn` フック（既定 null）。オラクル = 同一全系で**recall 推定だけ真のカーブ**。差分＝推定誤差のコスト |
| `reserveNewSlots`（`core/feed-generator.js`） | 新語枠を復習の前に予約（既定 false＝従来の貪欲）。**core 共有ポリシー**（後述） |
| `adaptiveNew` + `adaptiveNewSignal`（同上 + `srs-engine.js`） | 適応導入。負荷信号（`urgent` 滞留 / `success` 観測成功率 EWMA）に応じ新語予約枠を動的調整。既定 false。**core 共有ポリシー** |

---

## 2. 知見①：校正MAE は記憶コア選定の物差しとして不適（circular）

校正MAE ＝ 復習時の |システム予測 p − 真の保持率|。**この "真" を誰が定義するかで勝者が変わる**:

| 校正MAE（標準学習者） | HLR-OFF | HLR-ON(deltaTGain) | Ebisu |
|---|---|---|---|
| 真実=指数則（HLR 同族） | 0.175 | **0.018（圧勝）** | 0.143 |
| 真実=べき則（中立） | **0.059（最良）** | 0.070（OFF に負け） | 0.15+ |

- **deltaTGain（review #1）の「校正MAE 約1/13」は HLR 形の真実に対してのみ成立する交絡アーティファクト。** 中立（べき則）真実では deltaTGain ON は OFF に負ける（間隔抑制がべき則の太い裾を過小評価）。
- Ebisu は deltaT を更新の根幹入力に持つため **deltaTGain を構造的に内包**（OFF≡ON）。採用すれば review #1 は不要。
- **教訓**: 校正MAE は「予測＝真実」の循環に依存。記憶コアの優劣判定には使えない。

---

## 3. 知見②：物差しを「対オラクル％」へ（非circular・アウトカム）

- **オラクル** = 我々と全く同じ全系（Wave・貪欲 feed・ステージ遷移・リトライ・同じ engine）。唯一の違いは recall 推定だけが真のカーブを知る。
- 指標 = 期末の真の保持語数（genuine）。ours/oracle ＝ **推定誤差のコスト**。「予測＝真実」の循環に依存しない。
- **健全性チェック合格**: 真実＝指数則のとき HLR は自分のオラクルに **93〜102%** 一致＝物差しが正しいことの確認。

---

## 4. 知見③：三コア × 真実族の対オラクル比較（90日・N=5・reserve OFF＝現行既定）

| コア | 指数則 標準 / 朝 | べき則(現実的) 標準 / 朝 |
|---|---|---|
| HLR | 93% / 102% | 49% / 55% |
| Ebisu | 18% / 33% | 11% / 15% |
| DSR | 57% / 28% | 61% / 66% |

- **単一の固定コアは真実族に頑健でない**: HLR は指数則で勝ち・べき則で半減、DSR は逆。Ebisu はこの時点で全敗。
- べき則（実 forgetting に近い）真実では HLR ですらオラクルの約半分。**当初これを「実用ギャップ」と解釈した（後に誤りと判明・知見⑤）。**

### Ebisu の steelman（公平な機会を2つ与えた）
- **観測ノイズ**（Ebisu の主張する強み＝確信度頑健性）→ 改善せず**悪化**（19%→7%）。
- **ホームグラウンド**（真実＝Ebisu 生成過程）→ オラクルに一致するが、**定着がほぼ起きない退化世界**（genuine ~20-50語）。
- いずれも当時は「Ebisu の保守性は本質・consolidation を過小モデル化」と結論。**→ これは知見⑤で訂正される。**

---

## 5. 知見④（決定的・訂正）：新語供給は記憶コアでなくスケジューリング構造の問題

ユーザーの指摘「過小評価→過剰復習→新語ゼロが Ebisu 本体なら GitHub で炎上するはず」から再検証。原因は **Ebisu でなく feed-generator の貪欲方式**（新語は最低優先 `urgent→due→new`）。保守的なコアだと復習が枠を食い、wave で解放済みの新語まで締め出していた。

`reserveNewSlots`（新語枠を復習の前に予約・wave 供給の範囲内）を ON にすると:

| 対オラクル％（べき則・現実的真実） | reserve OFF | reserve ON |
|---|---|---|
| HLR | 49% / 55% | **98% / 97%** |
| Ebisu | 11% / 15% | **99% / 99%** |
| DSR | 61% / 66% | **96% / 96%** |

絶対値でも genuine 定着は ~346→971（HLR 標準）と跳ね、学習語数も全コア 1350-1900（枯渇解消）。

**この結果の3つの含意:**
1. **「Ebisu は consolidation を過小モデル化し勝てない」は誤りだった**（撤回）。新語枯渇のアーティファクト。新語枠を確保すれば Ebisu は near-oracle（99%）でむしろ最良。
2. **以前の「対オラクル ~50%」も大半が同じ枯渇アーティファクト**。reserve すると全コア 96-99%＝**システムは現実的真実下でほぼ最適**。
3. **真のレバーは記憶コアでなくスケジューリング構造**。reserve 下では3コアが 96-99% に収束＝**コア選択は review-timing にほとんど効かない**（Ebisu の 99% は N=5 ノイズ域の僅差）。

### ★ さらに重要：これは「バグ」でなく spec の意図的設計だった
spec.md §4.2 / §361 に明記:
> 認知負荷の制御は max_active_waves ではなく sessionSize と貪欲方式が担う。**復習すべき語が増えれば urgent/due がセッションを埋めて new が入らなくなり、新語の投入ペースが自動的に抑制される。**

つまり「復習が溜まると新語が出ない」は**意図された認知負荷スロットル**（復習債務・位相同期を大きくしすぎないという仕様初期からの設計思想）。`reserveNewSlots` はこの思想への**変更提案**であり、トレードオフ:

| | 守るもの |
|---|---|
| 貪欲（現行・仕様） | 過負荷からの保護（復習が溜まったら新語を絞る・復習債務を作らない） |
| reserveNewSlots | 語彙スループット（復習負荷に関係なく新語を入れ続ける） |

**oracle 分析が定量化したのは「この意図的スロットルが（novice では）定着の約半分を犠牲にしている」というコスト。** 復習債務/位相同期を抑える初期思想が、新規・苦戦する学習者ではかえってアダになりうる。

### reserve は万能ではない（過剰導入の罠）
真実＝**指数則（速い忘却）**では、reserve が新語を流し込みすぎて**全員崩壊**（genuine ~44・オラクルすら救えない）。
→ 正解は「常に予約」でなく「**過負荷なら絞る・余裕なら入れる適応導入**」＝spec の意図と oracle の知見を両立させる方向。

---

## 6. 知見⑤：Ripple Seeding は真実モデル非依存で genuine（本物の貢献）

播種ノイズ（`base/rc^2.5`）を**中立（べき則）真実**でも検証 → HLR/burst で真に覚えてる語数 **+10.4・3.0σ 有意**（偽 mastered の兆候なし）。**真実モデルを替えても崩れない＝本物の新規貢献。** 記憶コアが何であれ上に乗る。

---

## 6.5 知見⑥：適応導入が「過負荷保護」と「スループット」を両立（reserveNewSlots の精緻化）

知見⑤の reserveNewSlots は現実的（べき則）真実で near-oracle だが、指数則（速い忘却）では**過剰導入で崩壊**（オラクルすら救えない＝容量問題）。spec の過負荷保護（復習が溜まれば新語を絞る）と oracle のスループットを両立するため、新語予約枠を**負荷信号で動的に絞る適応導入**を2つの信号で検証した。

- **urgent ゲート（失敗）**: urgent（p<0.5）滞留で絞る。urgent 数が**コアの過小評価で水増し**され、べき則語を誤判定して絞りすぎる。べき則で HLR 48%（reserve 98 に届かず）。閾値を緩めても同じ＝**コア依存が本質**。
- **success ゲート（成功）**: **観測成功率（EWMA・engine 保持・processResponse 更新）**で絞る。信号が学習者の実際の正誤＝観測なので**コア推定に汚されない**。

**対オラクル%（べき則＝現実的真実・標準/朝集中・90日 N=5）:**

| ポリシー | HLR | Ebisu | DSR |
|---|---|---|---|
| greedy（現行） | 49 / 55 | 11 / 15 | 61 / 66 |
| reserve（常時予約） | 98 / 97 | 99 / 99 | 96 / 96 |
| adaptive-urgent | 48 / 52 | 35 / 40 | 75 / 84 |
| **adaptive-success** | **102 / 99** | **103 / 101** | **97 / 99** |

### ★ 重大な訂正：`%oracle` は絶対崩壊を隠していた（後日 deploy 直前に発覚）

上表の `%oracle` だけ見ると adaptive-success が万能に見えるが、**絶対アウトカムで検証すると exponential 真実で壊滅する**:

| 標準 sim（exponential 真実・novice・Day90） | 定着 | 学習済 | avgH |
|---|---|---|---|
| greedy（現行既定） | **245** | 282 | 81 |
| adaptive-success | **2** | 123 | 1.0 |
| adaptive-success(succLow=0.3) | **0** | 844 | 0.8 |

`%oracle` が 99-102% でも、それは **policy-matched オラクル自身もそのポリシー下で低い**ため。**絶対値では成熟が起きない**（avgH≈1・mastered≈0）。succLow を下げて新語を 844 入れても avgH 0.8・mastered 0＝introduction では救えない。

**正しい含意（訂正後）:**
- adaptive-success は **「現実=べき則忘却」への賭け**。べき則なら near-oracle・高絶対値だが、exponential なら絶対崩壊。
- **greedy（現行既定）は真実不確実性に頑健**（exponential で 245・べき則でも genuine 346 と破綻しない）。reserve/adaptive-success はどちらも exponential で崩壊。
- success ゲートの「溺れたら絞る」は spec の意図と方向一致だが、**throttle が強すぎると novice が一切前進しない**（exponential で 123 学習・2 定着）。
- **方法論の教訓**: `%oracle`（policy-matched）は絶対崩壊を隠す。**必ず絶対アウトカム（mastered/avgH）も併読する。**
- 留保: 閾値（low0.6/high0.85）未掃引。UX（圧倒されての離脱）は retention 指標の外。

---

## 7. メタ知見とプロジェクトの問いへの回答

**問い**: 「Duolingo 等が巨額のデータ収集で構築した SRS に、AI のシミュレーションだけでどこまで実用的に肉薄できるか」

- **真実カーブの"形"は sim では当てられない**（真実を固定した瞬間に勝者が決まる）。だが**スケジューリング構造の優劣・対オラクル達成率は sim で非circular に測れる**。
- **健全な構造なら、現実的（べき則）忘却の下でオラクルの 96-99%**。**実データなしで near-optimal を実証できる**＝「実データにかなわない」の真逆。
- カーブの"形"は**文献の肩を借りる**（FSRS の実証＝べき則）。残りのパラメータ fit は**各ユーザーが自前ログを生む online 適応**で詰められる（Duolingo 級の事前コーパス不要）。

---

## 8. 誠実な訂正記録（撤回した主張）

| 当初の主張 | 訂正 |
|---|---|
| 「Ebisu は consolidation を過小モデル化し非退化世界で勝てない」 | **誤り**。新語枯渇アーティファクト。reserve すれば near-oracle（99%）。 |
| 「対オラクル ~50%＝大きな実用ギャップ」 | **大半が枯渇アーティファクト**。構造を直すと 96-99%。 |
| 「deltaTGain で校正MAE 約1/13＝明確な改善」 | **HLR 形真実に対してのみ**。中立真実では deltaTGain は不利。 |
| 「新語が出ないのは私のスケジューラの欠陥」 | **欠陥でなく spec §4.2 の意図的な認知負荷スロットル**。バグでなく設計トレードオフ。 |

ユーザーの懐疑（「GitHub で炎上するはず」「wave は使っているのか」「貪欲とは復習に貪欲では」）が各段で誤りを正した。**この検証台が自分の結論を自己修正できることの証明でもある。**

---

## 9. 未解決の問い・次の一手

1. ✅ **適応導入（検証完了・採用見送り確定・知見⑥/§11/§12）**: success ゲートは `%oracle` では両立に見えたが、絶対アウトカムでは exponential 真実で崩壊（245→2）。**残課題だった「最低導入フロア＋上限のみ throttle」を §12 で総当たり検証 → 反証**。フロアは崖を消さず mastered をむしろ下げる。**greedy 維持で確定**。残るは真のカーブの実データ確認（実機 A/B）のみ。
2. **online パラメータ適応**: DSR/FSRS 系コアの成長定数を各語/各ユーザーのログから推定し、固定 96% を族横断で更に詰める。
3. **真実族の拡張**: ACT-R 活性化・混合など第3・第4の真実で頑健性主張を強化。
4. **実データ**: ドッグフーディングの review ログで実 forgetting 曲線の"形"を測る（唯一の外部審判）。ただし現状は復習イベント未ログ＝要 instrumentation（§13 の選択肢 B）。上級ドッグフーダーには review wall（層3）は見えない。
5. ✅ **spec/README 反映**: 校正MAE→対オラクル％への物差し転換、貪欲スロットルのコスト、Ripple Seeding を主役に、記憶コア検証の結論（「コア選択はほぼ無関係・greedy が真実不確実性に頑健」）を 2026-06-25 に README/spec へ反映。

---

## 10. 検証資産

- コード: `core/ebisu.js`・`core/dsr.js`・`core/feed-generator.js`(recallFn/dueHFn/reserveNewSlots)・`core/srs-engine.js`・`core/models.js`・`core/config.js`・`sim/virtual-learner.js`(真実族・観測ノイズ・trueHalflife)
- スクリプト: `scripts/verify_oracle.js`（対オラクル％）・`scripts/verify_deltat_calibration.js`(MEMORY_CORE/TRUE_MODEL/EBISU_A0,B0)・`scripts/verify_seed_noise.js`(MEMORY_CORE/TRUE_MODEL)
- 主要コミット（srs/seed-noise-deltat-gain）: `861fb44`(Ebisuプロト)・`6fa4cca`(中立真実)・`3015cea`(対オラクル+DSR)・`edd7ae6`(Ebisu steelman)・`0b71ade`(reserveNewSlots)・`f5d3b3e`(適応導入 success ゲート)
- 実行例:
  ```bash
  node scripts/verify_oracle.js 90 5                            # greedy（現行既定）
  NEW_POLICY=reserve   node scripts/verify_oracle.js 90 5       # 常時予約
  NEW_POLICY=adaptive ADAPT_SIGNAL=success node scripts/verify_oracle.js 90 5  # 適応導入(成功率)
  MEMORY_CORE=ebisu TRUE_MODEL=dsr node scripts/verify_deltat_calibration.js 90
  ```

---

## 11. 採否判断の材料（K）：adaptive-success を共有既定にするか

**変更内容**: `DEFAULT_CONFIG` を `adaptiveNew=true`・`adaptiveNewSignal='success'` に。**core 共有ゆえ app も sim も同時に変わる**（単一ソース原則）。spec §4.2/§361（貪欲＝認知負荷スロットル）の改訂を伴う。

**⚠️ 現時点の結論：共有既定にしない（greedy 維持）。** adaptive-success は **exponential 真実で絶対崩壊**（標準 sim 245→2）するため、真のカーブが確証されるまで blanket default にするのは高リスク。以下は将来の再検討用の材料。

**採用が報われる条件（＝賭けの前提）**
- 現実の忘却が**べき則寄り**であること。そのとき near-oracle（~100%）・greedy の ~50% から定着スループット倍増（特に novice/苦戦層）。
- spec の過負荷保護の意図を**保持**（溺れたら絞る）＝思想の精緻化。

**リスク・未知（実害寄り）**
- **exponential なら壊滅**: 標準 sim（exponential・novice）で Day90 定着 245→2。novice/苦戦層が**一切前進しなくなる**最悪ケース。greedy にはこの崖がない。
- **ドッグフーディングでは危険が露見しない**: 上級ユーザーは成功率高 → 満額導入 → reserve 同然で快適に見える。**崖は低成功率（novice/苦戦）層にしか出ない**ので、上級者の体感は偽りの安心になる。
- **UX/チャーン**: retention sim は「圧倒されての離脱」を測れない。
- **閾値** `low0.6/high0.85` 未掃引。**真のカーブ未確定**（全ては「べき則寄り」前提）。
- **方法論**: `%oracle` が絶対崩壊を隠した（§6.5）。判断は絶対アウトカム併読が必須。

**de-risk 手順案（採用を再検討するなら）**
1. **絶対アウトカム**で真実族（exponential/べき則/ACT-R）× 学習者層（novice/advanced）を総当たり。exponential×novice の崖を消せる設計（例: 最低導入フロア＋上限のみ throttle）を探す。
2. 閾値掃引＋ seedNoise 等併用で標準 baseline 回帰確認。
3. 実機: **フラグで限定 A/B（低成功率層を必ず含める）**。実 review ログで真のカーブと成功率分布を観測。
4. 採用時のみ spec §4.2/§361 を改訂。

**最小の意思決定**: greedy は真実不確実性に頑健で安全な既定。adaptive-success は**「現実はべき則」と確証できるまで保留**。確証は**低成功率層を含む実機 A/B が唯一の審判**（上級者だけのドッグフーディングでは判定不能）。

---

## 12. 残タスク②の決着：「最低導入フロア＋上限のみ throttle」は崖を消さない（反証・2026-06-25）

§11 の de-risk 手順1で挙げた「exponential×novice の崖を消す設計（最低導入フロア＋上限のみ throttle）」を実装・総当たり検証し、**反証**した。崖の原因が新語不足ではなく**容量限界下での成熟阻害**だったため、フロア（最低導入保証）はむしろ逆効果と判明。greedy 維持を確定する。

**実装**: `config.adaptiveNewFloor`（既定 0=無効・gated）。`feed-generator.js` の reservedNew 算出後に `reservedNew = max(reservedNew, min(floor, supplyCap))` を適用＝成功率が低く frac→0 でも最低 floor 語を予約。throttle は上限の伸びだけに効かせ、前進そのものは止めない設計。

**崖の機構（診断 `scripts/diag_adaptive_cliff.js`・指数則×novice）**: adaptive-success は **early の高成功率時に新語枠を予約（復習スロットを奪う）→ 過剰導入**（Day10 で learned 101 vs greedy 69）→ 溺れて success が 0.6 未満に落ちる → throttle 0 → だが既に導入済みの語が指数則の速い忘却で復習をすり抜け続ける → success が 0.56-0.58 で固着 → **新語凍結 + 既存語が成熟しないデススパイラル**（avgH 1.2 で停止・mastered 2）。greedy は「新語＝復習の余りスロット」なので有機的に絞られ過剰導入しない（avgH 88・mastered 264）。

**フロアの効果（反証・`scripts/verify_adaptive_floor_matrix.js`・90日 N=3・絶対アウトカム総当たり）**: 製品の実定義 mastered（stage 定着）で見ると **greedy が全 12 セル（真実3族×学習者2層×プロファイル2）で圧勝**し、フロアは崖を消さない:

| 真実×層×profile | greedy mastered / avgH | adapt | +floor1 | +floor2 |
|---|---|---|---|---|
| 指数則 novice 標準 | **262 / 88** | 2 / 1.0 | 1 / 1.0 | 0 / 0.9 |
| 指数則 advanced 標準 | **290 / 88** | 7 / 1.7 | 1 / 1.3 | 1 / 1.1 |
| べき則 novice 標準 | **345 / 93** | 16 / 3.8 | 20 / 3.9 | 15 / 3.8 |
| べき則 advanced 朝集中 | **543 / 79** | 39 / 4.4 | 46 / 4.5 | 40 / 4.4 |
| ACT-R novice 標準 | **3 / 4.2** | 1 / 0.9 | 0 / 0.8 | 0 / 0.8 |

**決定的な指標は avgH（成熟の深さ）**: greedy は avgH 60〜94（深く成熟）、全 adaptive 変種は avgH 0.8〜4.5（全語が浅いまま凍結）。**フロアは avgH をさらに薄める**（導入は増えるが成熟しない＝沈む船に水を注ぐ）。

**genuine 指標の誤誘導（§6.5 の教訓の先鋭化）**: adaptive はべき則で genuine 929（greedy 341）・学習 1241（greedy 386）と「勝つ」ように見えるが、これは**遅い忘却下で浅い大量導入（avgH 3.8・未成熟）が retain されるだけ**のアーティファクト。`%oracle` だけでなく**絶対 genuine ですら、遅い忘却の真実下では浅い暴露を過大評価する**。頑健な物差しは **avgH（成熟深度）＋ mastered（stage 成熟）** の併読。

**結論**: 崖は「新語供給の throttle が強すぎる」症状ではなく、**success ゲート型の reserve が（容量限界下で）早期過剰導入を招き成熟を阻害する**構造的問題。フロアでは塞げない。greedy の review-first 有機 throttle が、3 真実族 × 2 学習者層 × 2 プロファイルすべてで mastered/avgH 最良。**adaptive-success（フロア有無問わず）は不採用で確定。** `adaptiveNewFloor`/`adaptiveNew`/`reserveNewSlots` は gated・既定オフのまま再検証用に残置。真のカーブの実データ確認（実機 A/B）だけが将来の唯一の審判という §11 の結論は不変。

---

## 13. 過剰復習税と最終意思決定（2026-06-25）

§12 で adaptive-success が死んだ後、「では ebisuショック前から本番は何が変わったのか」を問い直し、**本番デフォルトは何も変わっていない**ことを確認した（`memoryCore='hlr'`・greedy・`deltaTGain/seedNoise` は 2026-06-11 のショック前採用）。べき則（`dsr`）は **sim の真実モデル**と **gated コアオプション**としてしか存在せず、本番の半減期計算は今も指数則 HLR。ebisuショック以降に**シップした変更はゼロ**＝調査は「現状が正しかった」の確認だった。

### 過剰復習税（over-review tax）— 「過剰復習は安全側」の訂正

当初「HLR はべき則真実下で実際より早く忘れると予測する→早めに復習する→過剰復習（安全側）」と述べたが、これは誤り。**間隔反復のアポリアは復習負債の雪だるま（review wall）であり、過剰復習こそ危険側**。固定の日次スロット予算を復習が食い潰し、greedy では新語スループットを削り、容量を超えれば backlog が雪だるま化する。

- **なぜ sim で崩れなかったか**: ① 誤指定の大きさが穏やか（HLR は h を桁違いに過小評価しない）② greedy の逃し弁——復習圧は「無限 backlog」でなく「新語導入の鈍化」に変換される（new = leftover）。だが*容量を超えない限り*。
- **税の所在＝対オラクル効率ギャップ**: §6.5 の greedy+HLR がべき則真実下で**効率 49〜66% of oracle** だった——これが過剰復習税の正体。オラクルは真の遅いべき則減衰を知り後ろ倒しにスケジュール→復習を減らし→空き枠を新語へ。HLR はそれができず同じ定着に余計な復習を払う。
- **最も効く層**: 上級者は全部通り h が速く育つので税は見えない。**容量近くで回す novice／苦戦層**で過剰復習税が高失敗率に複利で乗る＝review wall が最速で来る層＝「実機 A/B でしか判定できない」層と一致。
- **含意の訂正**: 「べき則コアへの切替は実利ほぼゼロ」は不正確。正しくは「**余裕レジームでは実利ゼロ・容量限界レジームでは符号が効く**」。べき則が真実なら `dsr`/`ebisu` への切替は後ろ倒しスケジュール→復習予算回収→wall 後退の価値があり得る（deltaTGain 相互作用の再検証込み）。sim はこれを過小評価する（逃し弁が圧を吸収・大きさが穏やか）が、失敗レジームでは大きさより符号が効く。

### 最終意思決定とこれからの一手

- **greedy 確定・記憶コア沼をクローズ**。adaptive-success/reserve/floor は全て不採用で確定（gated 残置）。本番は `memoryCore='hlr'` + greedy + deltaTGain + seedNoise のまま。
- **唯一 sim で決着できない問い**＝「現実の忘却はべき則か」。これは現状のドッグフーディングでも答えられない: ① **復習イベントの (Δt, 正誤) を時系列ログしていない**（state は現在値スナップショットのみ＝`WordState` の h/lastReviewed/reviewCount/正誤数。カーブはフィット不能）② **層が違う**（review wall が出るのは novice／苦戦層で、上級ドッグフーダーには原理的に見えない）。
- **次の一手（選択肢）**:
  - **A（推奨・最小）**: greedy で意思決定を閉じ、記憶コアから製品の別面へ移る。べき則コアは gated 準備済み——将来データが出たらフリップ可。
  - **B（カーブを測る種まき）**: 軽量な復習イベントログを `app.js _onCardAnswered` に追加（word id・Δt・cardType・result・timestamp を localStorage に append、`debug.html` で吸出し）。数週間後に自分の履歴で指数則 vs べき則をフィット＝層1（自分の忘却の形）だけは sim を回さず実データで決着できる。SRS ロジック不変・gated（記録するだけ・読まない）。review wall（層3）は依然見えない。
  - **C（wall を見る）**: 苦戦レジームのテスター/データが要る。上級者一人では不可能＝novice ユーザーが出るまで park。
- **推奨は A＋B の種まき**: greedy で閉じつつ、低コストの B（イベントログ）だけ入れて「べき則か」を実データに育てさせる。wall は park。
