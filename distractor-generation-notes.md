# 空欄補充（Recall）の誤答生成 — 先行研究メモ

2026-10-29。Recall カードの誤答で「install の空欄に delete が出る」（誤答なのに空欄に入る）問題から調査した。
現状の `app/ui-cards.js` `getDistractors()` は **同品詞の全語から毎回ランダム抽選**で、空欄に入るかの検査も、
Recognition の `distractors` のような事前監査もない。

## 結論（先に）

- 「同品詞・word2vec 近傍で候補を出し → BERT の当てはまり度で切り分ける」は **Yeung et al. (2019) とほぼ同じ**。再発明ではなく定石の採用になる。
- ただし **「空欄に入ってしまう誤答を除く」工程は分野として未解決**。WordNet 同義語・品詞・n-gram で除いても 12〜28% は空欄に入る。残差は「その文脈でだけ同義になる語」（wonder/think、turned/flushed）。
- ∴ 機械（BERT 順位＋WordNet）で大半を落とし、**残差だけを AI 監査／目視に回す**2層構成にする（Recognition の誤答監査と同じ考え方）。

## 用語

| 用語 | 意味 |
|---|---|
| carrier sentence | 空欄を含む例文 |
| target / key | 正解語 |
| distractor | 誤答 |
| plausibility | 誤答のもっともらしさ（易しすぎないか） |
| reliability / validity | 誤答が**正解として通ってしまわない**か（正解の一意性） |

誤答は「もっともらしいが、正解ではない」の2条件を同時に満たす必要があり、2つは引っ張り合う（近いほどもっともらしく、近いほど正解として通りやすい）。

## 読んだ文献

### Yeung, Lee & Tsou (2019) Difficulty-aware Distractor Generation for Gap-Fill Items（ALTA, U19-1021）
- 中国語学習用。word2vec（skip-gram）類似上位20 ∩ BERT マスク予測上位50 を候補にし、**BERT の順位で並べ直す**。
- 人のもっともらしさ判定との相関: word2vec 単独 −0.23（有意でない）→ BERT 再順位 −0.46（p=0.002）。
- BERT 順位にしきい値を置いて3分類（leave-one-out で調整）: **1〜10位＝正解として通る／11〜39位＝もっともらしい／40位〜＝易しい**。正答率 60.6%（word2vec 42.5%）。
- BERT の上位を直接使わない理由: 正解語と意味的に関係のない語が混ざるから（→ word2vec との積集合にする）。
- 注意: 37文・評価者の一致度 κ=0.42（中程度）。しきい値はこのデータ固有で流用不可。

### Hill & Simha (2016) Co-occurrence Likelihoods and Google n-grams（BEA, W16-0503）
- 母語話者の読解用。正解語を含む 2〜5-gram の窓で、同品詞の語に置き換えた n-gram を Google n-gram から引いて候補にする。
- 除外: **WordNet の直接同義語**／**GloVe で正解語より文脈語と共起しやすい候補**。残りから頻度の低い3語を採用。
- 結果: 誤答の **約12%が全文脈で空欄に入ってしまった**。主因は「近い意味の語」（her face ___ red に対する turned と flushed）。WordNet では落ちない。

### Panda et al. (2022) Round-trip Machine Translation（ACL SRW, 2022.acl-srw.31）
- 上級 ESL 用。例文を5言語に往復翻訳して、正解位置に対応する語を候補にする（[コード](https://github.com/subhadarship/round-trip-distractors)）。
- 除外: WordNet 同義語＋**空欄を埋めた文での品詞判定**（候補を正解と同じ位置に入れて NLTK で品詞付け）。
- 上位5語のうち妥当な誤答の割合（人手）: 往復翻訳 72.3%／word2vec 56.1%／**BERT 38.0%**。BERT と word2vec で並べ替えると妥当率はむしろ下がる。
- 無効例の多くは「WordNet で落ちない文脈上の同義語」と「単に空欄に入る非同義語」。
- 読み: BERT が出す語は空欄に入りやすい語＝正解として通ってしまう語。**BERT は出す側ではなく判定する側に向く**ことの裏づけ。

### Chiang et al. (2022) CDGP（EMNLP Findings）
- BERT 等を CLOTH（中高生の長文空欄補充データ）で微調整し、候補を出してから重み付きスコアで選ぶ（[コード](https://github.com/AndyChiangSH/CDGP)）。
- 選択の特徴量: 言語モデルの確信度／正解語との単語埋め込み類似（fastText）／正解を入れた文と候補を入れた文の文埋め込み類似／品詞一致。
- 評価は正解誤答データとの一致率（NDCG@10 で 19.31→34.17）で、**誤答が正解として通るかは直接評価していない**。

### Alhazmi et al. (2024) Distractor Generation in Multiple-Choice Tasks: A Survey（EMNLP）
- 空欄補充の手法を、コーパス・規則／知識ベース（WordNet 等）／単語埋め込み／特徴量学習／微調整した言語モデル／プロンプト／往復翻訳に分類。
- **「正解の一意性（reliability）は十分に研究されていない」と明記**。難易度の制御も主要な未解決課題として挙げている。
- 空欄補充の公開データ: CLOTH、DGen、CELA。文献リスト: github.com/Distractor-Generation/DG_Survey
- 本文の後半約3割は未読。

## VocabFlow の条件（文献との違い）

- 誤答は **1900語の語彙リストの中から**選ぶ（自由語彙ではない）。学習済みの語から選ぶ余地もある。
- 例文は **1文だけ**（長文の文脈がない）→ 文脈が少ないぶん空欄に入る語は増えやすい。
- 選択肢は**原形**で、空欄の正解は活用形（578/1900語）。判定は候補を**正解と同じ活用形にして**文に入れて行う（Panda の「埋めてから品詞判定」と同じ発想）。
- 対象は日本人の中級学習者。誤答はもっともらしすぎる必要はないが、選択肢を品詞で絞れるほど易しくてもいけない。

## 方針（プロトタイプで検証すること）

1. **候補**: 同品詞の語彙から、単語埋め込みの類似上位を取る。
2. **当てはまり度**: 候補を正解と同じ活用形にして空欄に入れ、BERT の確率を測る。正解語との差（対数確率の差）と、候補の中での順位を見る。
3. **切り分け**: 上位帯＝正解として通る→除外、中間帯＝誤答に採用、下位帯＝易しすぎる。しきい値は少数の例に自分で正解ラベルを付けて決める（Yeung の 10/39 は流用しない）。
4. **WordNet 同義語**で機械的に除外（取りこぼし防止）。
5. 残った**文脈上の同義語**だけを AI 監査／目視へ。
6. 採用した誤答はデータ（例: `recallDistractors`）に固定し、出題時はそこからランダムに3つ選ぶ。

確かめたい問い: install の空欄で delete は上位帯に入るか／上位帯の切り方で、正解として通る誤答をどこまで落とせるか／中間帯が易しすぎないか。

## プロトタイプ1回目（2026-10-29・`scripts/proto_recall_distractors.py`）

bert-base-uncased（MLM・複数トークン語は左から順に埋める）＋ GloVe 300次元。
7語（install / vital / wonder / gain / eager / reject / delete）× 同品詞の全候補。CPU で約4分。

**効いたところ**: 上位帯は実際に空欄に入る語をよく拾う。
- install → created / launched / displayed、vital → essential / necessary / crucial、gain → obtained / acquired / earned / attained、eager → keen / anxious / willing
- WordNet 同義語で拾えたのはこのうち一部だけ（gain の acquired / earned / attained 等）。BERT のほうが網が広い。

**効かなかったところ（重要）**:
1. **install の空欄の delete は 770語中70位（Δ−5.0）で、上位帯に入らない**。「He deleted a new app」は文として成り立つが、「new app」と一緒に出にくいので BERT の確率は低い。
   → BERT の確率は「その文としてありがちか」で、「文として成り立つか」ではない。成り立つがありがちでない語が長い裾に残る。
2. **反義語が空欄に入る**。reject の空欄で approved が1位（Δ−0.6）、eager で reluctant が6位。1文だけの例文では反義語でも意味の通る文になる。
   文献の空欄補充は前後の文脈で意味が決まるが、VocabFlow の Recall は1文だけ。**データ処理だけでは解けない種類の曖昧さ**で、出題形式（例: 回答前に日本語訳を見せる）の判断になる。
3. **複数トークンの語が不当に低く出る（計測の欠陥）**。delete は `del ##ete` に分かれ、正解自体の fit が −10.8 に落ちて他の全語が「正解より当てはまる」になった。vital の空欄の indispensable（4トークン）は 403/404位。単一トークン語と複数トークン語で順位の中央値が倍近く違う（install: 360 vs 665）。
   → 「易しい・安全」と誤判定する方向の欠陥なので、このままでは除外に使えない。

**次に試すこと**:
- 採点を**文全体の比較**に変える（因果言語モデル GPT-2 系で文全体の対数確率を比較する、または MLM の文全体疑似対数尤度＝Salazar et al. 2020）。BPE 語彙なら delete も単一トークンになり、空欄より右の文脈（deleted → a new app）の影響も確率に入る。
- しきい値は確率の絶対値ではなく、正解との差 Δ と順位の両方で見る。
- 反義語の扱いを決める（出題時に日本語訳を見せるか、反義語を除外リストに入れるか）。

**決定（2026-10-29）: 反義語は誤答から除外する**（日本語訳は今のまま回答後に出す）。
回答前に訳を見せると「訳から語を選ぶ」問題になり、Recall の「文脈から語を引き出す」性格が変わるため。
- 第1層: WordNet の反義語。直接の反義語に加え、類義 synset（similar_tos）を経由した反義語も見る。
  - 直接の反義語で拾えた例: reject→accept/approve、gain→lose。
  - 類義 synset 経由でないと拾えない例: eager→reluctant（直接の反義語は uneager だけ）。
- 第1層で落ちない反義語（install↔uninstall/remove のような「逆の操作」など）は、最後の AI 監査で拾う。

## プロトタイプ2回目（2026-10-29・`--scorer causal`）

gpt2-medium で、空欄を埋めた**文全体の対数確率**を比べた。7語は1回目と同じ、CPU で約3分。
Δ は正解を入れた文との差（自然対数）。

**直ったところ**
- **複数トークン語の不利が解消**。vital の空欄の indispensable は 403位 → 4位、delete の空欄の erase は 3位。
- **反義語は WordNet で除外できた**。reject→approve（1位）、eager→reluctant（7位）。

**効かなかったところ**
- **頻度補正（文の log p − 語そのものの log p）は使えない**。install の空欄の上位が browsed / fetched / imitated / obeyed になった。珍しい語を持ち上げすぎる。→ 補正なしの Δ を使う。

**分かったこと（1回目の見立ての修正）: 1文の例文では、空欄に入る語が Δ のかなり下まで続く**
- 類似上位50語を Δ の帯に分けると、Δ −5〜−8 にも −8〜−12 にも空欄に入る語が残る。
  - reject: opposed / criticized / condemned the proposal
  - eager: curious / zealous / inclined to learn
  - wonder: doubt if she will come
- 1回目の「上位帯を除いて中間帯を採る」（Yeung 方式）は、1文の例文では成り立たない。中間帯こそ「成り立つがありがちでない」語の溜まり場だった。
- **向きを逆にする**: 「意味は近い（類似上位）が、空欄には明らかに入らない（Δ が十分低い）」語だけを誤答候補にする。
- Δ < −12 の帯を見ると、誤答らしい語が並ぶ。
  - vital: urgent / possible / specific
  - wonder: assume / insist / speculate
  - gain: improved / increased / proved
  - delete: publish / verify / compile
- install の空欄の **delete は Δ −4.3（44位）**。この規則なら**誤答に採らない**＝もとの問題は解消する。
- 課題1: install は類似50語のうち Δ < −12 が4語しか残らない。類似の範囲は100語程度に広げる必要がある。
- 課題2: Δ < −12 でも「文法的には成り立つ」語がまだある（delete の空欄の verify / modify）。最後の AI 監査は必要。
  ただし監査は「語ごとに十数語の候補から、空欄に入るものを挙げさせる」形で済む。Recognition の誤答監査と同じ規模（約$2）に収まる見込み。

**次に試すこと**
1. 類似上位100 ∩ Δ < −12 ∩ WordNet 同義・反義でない語を、候補プールにする。ランダムな約30語で、プールの大きさを確かめる。
2. そのプールを AI 監査にかけ、「空欄に入ってしまう」と指摘される割合（残差）を測る。しきい値 −12 が厳しすぎるか甘すぎるかも、ここで判断する。

## プロトタイプ3回目（2026-10-29・無作為30語 × 類似上位100語・AI 監査つき）

- 採点: `proto_recall_distractors.py --sample 30 --seed 1 --sim-top 100`（gpt2-medium）
- 監査: `scripts/proto_recall_audit.py`（claude-sonnet-5、約$1.3）。Δ は見せず、全3000候補の一つ一つが空欄に入るかを判定させた。
- 判定は3種: fits（正解として通る）／borderline（文法的だが意味が苦しい）／no
- 結果: `scripts/results/proto_recall_sample30_audit.json`
- 30語の内訳は名詞・動詞・形容詞で、副詞は抽出されなかった。

**Δ の帯ごとの「空欄に入る」割合**（WordNet 同義・反義を除く）

| Δ の帯 | 件数 | fits | fits+borderline |
|---|---|---|---|
| ≥ 0 | 16 | 69% | 94% |
| −3〜0 | 60 | 58% | 75% |
| −5〜−3 | 117 | 55% | 69% |
| −8〜−5 | 301 | 45% | 64% |
| −12〜−8 | 695 | 25% | 48% |
| −16〜−12 | 918 | 12% | 28% |
| −20〜−16 | 666 | 6% | 19% |
| < −20 | 209 | 1% | 5% |

**分かったこと**
1. **Δ は単調に効く**。低いほど空欄に入らない。ただし、きれいな切れ目はない。Δ < −12 でも fits が約1割残るので、**Δ だけでは決められず、AI 監査が要る**。
   Δ の役目は、監査にかける候補を「空欄に入りにくい側」に寄せることにある。類似上位100語をそのまま監査すると約3割が fits。
2. **誤答が壊れるかどうかは、語の組より例文の縛りの強さで決まる**。
   - 縛りの弱い例文では、何を入れても通る（Δ < −12 でも fits が多い）。
     - revolution「The French ___ changed European politics forever.」: legacy / democracy / strategy… 36語
     - digital「___ technology has changed how we communicate.」: 26語
     - justify「She couldn't ___ spending so much on a bag.」: 21語
     - own「She ___ three apartments in the city.」: seeks / destroys… 13語
   - 縛りの強い例文では fits が0。mess / thread / questionnaire / device / pedestrian / intend / donate / syndrome / duty など、30語中14語。
   - → 縛りの弱い例文は誤答の選び方では救いきれない。**例文自体を差し替える候補**として、別に挙げるのがよい。
3. **正解との差 Δ は、正解自体が文にとって意外なとき壊れる**。
   - dispute「He ___ the referee's decision loudly.」では、handled / regarded / split など空欄に入らない10語が Δ > −3 になった。正解 disputed の確率自体が低いため。
   - その結果、Δ < −12 に残るのは1語だけだった（retain 6語、absorb 7語も同じ傾向）。
   - → しきい値は Δ の絶対値でなく、**候補の中での順位（下位何割）でも決められる**ようにしておく。

**採用候補（Δ < −12 かつ監査 no）の数**
中央値53語。少ないのは dispute 1・retain 6・absorb 7・revolution 11 で、多くの語は誤答3つに十分足りる。

**監査の判定の甘さ**
fits の判定は寛容で、「She destroys three apartments」「The ancient Egyptian cereal was discovered in a sealed tomb」も通している。
ただ、学習者が「これも正解では」と言える文は誤答として避けたいので、方針として寛容寄りでよい。
人の目で一部を抜き取って確かめるのは、まだしていない。

**本番の形（案・2026-10-29 修正）**
1. 候補: 同品詞・埋め込み類似上位100語から、WordNet の同義語・反義語を除く。
2. 並べ替え: Δ の低い順。Δ < −12 で足りなければ、下位から順に取る（正解が意外な例文で Δ が壊れる対策）。
3. AI 監査: 20語ずつ判定し、fits と borderline を除く。no が5つに満たなければ次の20語を判定する。
4. 残りを `recallDistractors` に固定し、出題時はそこから3つをランダムに選ぶ。

- 例文の縛りが弱くても誤答は選べる。監査が例文込みで「空欄に入る語」を除くため。
  30語すべてで、類似100語中の no は11語以上あった（最少 revolution 11・digital 17）。
- 縛りの弱い例文で困るのは誤答の質だけ。意味の近い語ほど空欄に入るので、残る誤答はやや遠い語になる。
  例文の差し替えは、出来上がったデータを見てから判断する（当初の案にあった「例文差し替え候補の一覧」は不要）。

- コスト: 今回の出力は思考込みで1語あたり約4千トークン（100候補）。20候補なら1900語で $15〜20 程度の見込み。
- 時間: GPT-2 の採点は30語×100候補で十数分以内（正確な時間は測っていない）。1900語なら数時間なので、夜間に回せば済む。

## 副詞・品詞 other の確認（2026-10-30）

**本番の手順が使えない**: 副詞は1900語中8語、品詞 other（despite / whereas / via / versus）は4語しかない。
- 副詞の同品詞候補は7語だけ。GPT-2 採点＋監査で no が残ったのは regardless 7語、ほかは1〜2語（forth と somewhat が何にでも入らないだけ）。
- other は今の `getDistractors()` が全品詞から選ぶので、名詞・動詞が誤答に出て品詞だけで消去できる。
- **本番の不具合**: nevertheless の問題に nonetheless が 3/7 の確率で混ざる（逆も）。例文がほぼ同じなので正解が2つになる。

**対応**: 12語は Claude が教材外の語も含めて候補を出し、監査を通した → `scripts/results/recall_distractors_manual.json`（各5〜10語・ユーザー確認済み）。
- somewhat の very / too / so は文法の誤り（「very better」）を突く誤答。学習者がよく間違える形なので採用。

**監査の揺れ（本番前に要確認）**: nevertheless / nonetheless に同じ10候補（therefore, consequently, moreover, similarly…）を何度か監査すると、no の数が回ごとに大きく変わった。
- nevertheless: 0 / 2 / 7 / 0、nonetheless: 9 / 5 / 5
- 「文法は正しく論理だけおかしい」誤答で borderline と no の境が定まらない。品詞違い・文法の誤りは安定して no。
- この2語は人が確定（therefore, consequently, similarly, moreover, otherwise）。
- 動詞・名詞でも同じ揺れがありうる。全語監査の前に、プロトタイプ30語を2回監査して一致率を測る。

## 監査の再現性（2026-10-30）

プロトタイプ30語（各100候補）を同じ条件でもう1回監査し、前回と比べた（3回目は intend で max_tokens に達して止まり、結果なし）。

| 範囲 | 件数 | 一致率 |
|---|---|---|
| 全候補・3分類（fits / borderline / no） | 3000 | 85% |
| 全候補・no か否か | 3000 | 90% |
| **本番の範囲（同義・反義を除き Δ の低い20語）・no か否か** | 600 | **96%** |

- 本番の範囲で1回目に no の語は、97% が2回目も no。
- 食い違い24件はほとんどが no ↔ borderline で、もともと判断の割れる文（「The French humanity…」「Possible technology…」）。
- no ↔ fits は2件（entail の prolongs、own の justifies）。どちらも2回目の fits のほうが誤り（「The job prolongs a lot of travel」「She justifies three apartments」は空欄に入らない）。
- → **動詞・名詞・形容詞は監査1回で足りる**。nevertheless 型の大きな揺れ（論理の向きだけがおかしい接続副詞）は副詞特有で、副詞は手で確定済み。
- 本番の監査スクリプトは、採点と同じく1語ずつ書き出して再開できるようにし、max_tokens で止まった語は候補を分けて再試行する（3回目はこれで全部失った）。
