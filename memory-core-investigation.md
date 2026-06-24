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

1. ⚠️ **適応導入（検証済だが採用保留・知見⑥/§11）**: success ゲートは `%oracle` では両立に見えたが、**絶対アウトカムでは exponential 真実で崩壊（245→2）＝べき則への賭け**。greedy 維持。残課題: exponential×novice の崖を消す設計（最低導入フロア等）・真のカーブの実データ確認。
2. **online パラメータ適応**: DSR/FSRS 系コアの成長定数を各語/各ユーザーのログから推定し、固定 96% を族横断で更に詰める。
3. **真実族の拡張**: ACT-R 活性化・混合など第3・第4の真実で頑健性主張を強化。
4. **実データ**: ドッグフーディングの review ログで実 forgetting 曲線の"形"を測る（唯一の外部審判）。
5. **spec/README 反映**: 校正MAE→対オラクル％への物差し転換、貪欲スロットルのコスト、Ripple Seeding を主役に、Ebisu 不採用（ただし「コア選択はほぼ無関係」が真相）を反映。

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
