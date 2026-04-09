# VocabFlow word-data.js 品質監査・修正指示書

対象ファイル: `core/word-data.js`（1,900語、約60,770行、3.5MB）

## 背景

AI一括生成（generate_word_data.py）で作成した単語データに、論理的矛盾・形式的不統一・事実誤認が混入している。2026-04-08の調査で構造的な問題パターンを特定済み。本指示書に基づき、Claude Code で検証・修正を実施する。

---

## Phase 1: API検証（tips / confusables / trivia / etymology の内容検査）

### 目的

正規表現では検出できない論理的矛盾・事実誤認・空振り記述を、Claude Sonnet API を使って検出する。

### 手順

1. `word-data.js` を読み込み、各語の `passive` オブジェクト（tips, confusables, trivia, etymology）を抽出
2. 50語ずつバッチ化し、以下のプロンプトで Claude Sonnet API (`claude-sonnet-4-20250514`) に投入
3. 結果をJSONに集約し、`verification_results.json` として保存

### 検証プロンプト（各バッチ共通）

```
あなたは英語教育コンテンツの品質検査官です。以下は日本人向け英単語学習アプリのデータです。
各単語について、tips/confusables/trivia/etymologyの4フィールドを検査してください。

検出すべき問題：
1. 論理的矛盾（「Xは誤り」と言いつつ直後にXを使う例を出す等）
2. 事実誤認（語源の誤り、歴史的事実の間違い等）
3. 説明の自己矛盾（前半と後半で矛盾する主張）
4. 虚偽・空振り記述（「〜と関係がある…実は無関係」のような無意味な記述）
5. 誤解を招く不完全な説明（solveの例：forを使うなと言った直後にfor付きの例を出す）
6. 混同パターンの論理破綻（regardの例：「consider A as Bと混同して」と書いているが、
   混同元は consider A to be B が正しい。対比自体が間違っている）

問題がない単語はスキップし、問題がある単語だけ報告してください。

出力はJSON配列のみ（他のテキスト一切なし）：
[{"id": 数値, "word": "語", "field": "tips|confusables|trivia|etymology", "issue": "問題の簡潔な説明", "severity": "error|warning"}]

問題がなければ空配列 [] を返してください。
```

各バッチには以下のフィールドを含める：
```json
{"id": 1, "word": "create", "pos": "verb", "meanings": "〜を創造する; 〜を引き起こす", "tips": "...", "confusables": "...", "trivia": "...", "etymology": "..."}
```

### 注意事項

- レート制限を考慮し、バッチ間に1秒のディレイを入れる
- HTTP エラーが出たらリトライ（最大3回、指数バックオフ）
- 結果は `verification_results.json` に保存

---

## Phase 2: 機械的修正（正規表現ベース）

調査で特定済みの形式的不統一を一括修正する。**Phase 1の結果とは独立して実行可能。**

### 2-1. 句点なし修正（292件）

etymology (88件), tips (72件), confusables (51件), trivia (81件) の文末に句読点がない。

**ルール:**
- 文末が `。！？!?）」` のいずれでもない場合、`。` を付与
- ただし末尾が `)` や `'` で閉じている場合は直前の文脈を確認

**検証方法:** 修正前後でフィールド数が変わらないこと、文末が必ず句読点で終わることを確認。

### 2-2. collocationsの日本語訳除去（1,884件 / 5,823件）

`collocations` 配列内の各要素から `（日本語訳）` 部分を除去する。

**ルール:**
- `"as soon as possible（できるだけ早く）"` → `"as soon as possible"`
- 全角括弧 `（...）` を正規表現で除去: `/（[^）]+）$/` → `''` の後 `.trim()`
- 半角括弧 `(...)` に日本語が含まれる場合も同様に除去

**例外:** `"solve for x (xを求める)"` のように英語の括弧内に日本語がある場合も除去対象。

**検証方法:** 修正後にcollocations内に日本語文字（`/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/`）がゼロであることを確認。

### 2-3. audioHintの注釈除去（13件）

カタカナ読みのみであるべきフィールドに注釈が混入。以下を修正：

| id | word | 現状 | 方針 |
|----|------|------|------|
| 37 | object | `オブジェクト（動詞）` | → `オブジェクト` |
| 235 | wind | `ウィンド（名詞）／ワインド（動詞）` | → `ウィンド`（名詞が主要義） |
| 245 | contrast | `コントラスト／コントラスト（動詞はコントラスト）` | → `コントラスト` |
| 249 | content | `コンテント（名詞）／コンテント（形容詞）` | → `コンテント` |
| 373 | desert | `デザート（名詞）／デザート（動詞はデザート）` | → `デザート` |
| 410 | tear | `テア（動詞）／ティア（涙）` | → `テア`（posがverb） |
| 568 | myth | `ミス（th音）` | → `ミス` |
| 577 | contract | `コントラクト（名詞）／コントラクト（動詞）` | → `コントラクト` |
| 736 | protest | `プロテスト（名詞）/ プロテスト（動詞）` | → `プロテスト` |
| 1129 | compound | `コンパウンド（動詞はコンパウンドにアクセント）` | → `コンパウンド` |
| 1200 | inclined | `インクライン(ド)` | → `インクラインド` |
| 1755 | rebel | `レベル（名詞）／リベル（動詞）` | → `レベル`（posがnoun） |
| 1876 | harassment | `ハラスメント（またはハラースメント）` | → `ハラスメント` |

**方針:** posフィールドに対応する読みを採用。発音分岐の情報はtipsフィールドに記載があるため、audioHintは代表的な読み1つに絞る。

---

## Phase 3: 個別修正（手動判断が必要な項目）

### 3-1. blankAnswerが対象語と無関係（2件）— 致命的

**#875 prefecture:**
例文自体を差し替える。prefectureの部分が空欄になるようにする。
```
現状: blank: "___ Prefecture is famous for its historic temples." / blankAnswer: "Kyoto"
修正例: en: "Each prefecture in Japan has its own governor."
        ja: "日本の各都道府県にはそれぞれ知事がいる。"
        blank: "Each ___ in Japan has its own governor."
        blankAnswer: "prefecture"
```

**#1249 syndrome:**
同様に例文を差し替え。syndromeが空欄になるようにする。
```
現状: blank: "___ affects chromosome development." / blankAnswer: "Down syndrome"
修正例: en: "Impostor syndrome is common among high achievers."
        ja: "インポスター症候群は優秀な人に多く見られる。"
        blank: "Impostor ___ is common among high achievers."
        blankAnswer: "syndrome"
```

### 3-2. tipsの論理的矛盾（既知2件 + Phase 1で追加検出予定）

**#132 regard:**
```
現状: 'consider A as B' と混同して 'regard A to be B' としがちだが
修正: 'consider A to be B' と混同して 'regard A to be B' としがちだが
```

**#107 solve:**
```
現状: solve は必ず他動詞（目的語が必要）。'solve for the problem' ではなく 'solve the problem' が正しい。
      数学でも 'solve for x'（xを求める）のように使う。
修正案: solve は他動詞で 'solve the problem' のように直接目的語を取る。'solve for the problem' は誤り。
        ただし数学では 'solve for x'（xについて解く）という特殊な用法があり、
        この場合のforの後には「求める未知数」が来る点が異なる。
```

### 3-3. triviaの虚偽記述（1件）

**#1249 syndrome:**
```
現状: 「サンドロ（Sandro）」という名前もこの語根と関係がある、と言うと驚くかもしれない。
      実は無関係だが、...
修正: trivia全体を書き直す。語源（syn + dromos）に関連する面白い事実、
      または「〇〇症候群」の日本での浸透度に関するtriviaに差し替え。
```

### 3-4. confusableSpellingsに正答が含まれている（1件）

**#1562 makeup:**
```
confusableSpellingsから "makeUp" を除去し、別の誤答スペル（例: "make-up", "maikup"）に差し替え。
```

### 3-5. crisisのtrivia（俗説の扱い）（1件）

**#366 crisis:**
```
現状: 「危機」を表す漢字「危機」は「危険＋機会」と解釈されることがあり...
      「誤解されがちな豆知識」としても有名。
修正案: JFKが演説で広めた俗説であることを明記した上で、
        実際の「機」の意味（「きざし・転換点」であり「チャンス」ではない）を補足する。
        あるいは、別のtriviaに差し替え。
```

---

## Phase 4: 仕様判断が必要な項目

以下は開発者（Hideki）の判断を仰いでから対応する。

### 4-1. 不規則動詞のblankAnswer（7件）

drew, tore, arose, hung, spun, clung, swore — 活用形の知識も問う仕様なら現状のままでOK。原形のみを問う仕様なら、例文を現在形に書き換える。

対象: #112 draw, #410 tear, #521 arise, #530 hang, #1212 spin, #1623 cling, #1817 swear

### 4-2. triviaの文末スタイル統一

現状: `。` 終わり 1,040件 / `！` 終わり 760件。バッチにより偏りあり。
選択肢:
- A) `。` に統一（学習教材として落ち着いたトーン）
- B) `！` に統一（triviaの性質上、驚き・発見のトーン）
- C) 内容に応じて個別判断（コスト大）

---

## 実行順序の推奨

```
1. Phase 2（機械的修正）を先に実行 → 差分が明確で安全
2. Phase 3（個別修正）を実行 → 致命的バグの修正
3. Phase 1（API検証）を実行 → 新たな問題を検出
4. Phase 1 の結果を受けて追加修正
5. Phase 4（仕様判断）は随時
```

## 修正後の検証

すべての修正完了後、以下のバリデーションを実行：

```javascript
// 全件チェック項目
- [ ] 全1,900語の passive 4フィールドが句読点で終わる
- [ ] collocations に日本語文字がゼロ
- [ ] audioHint が全件カタカナのみ（/^[ァ-ヾー・]+$/）
- [ ] blankAnswer が全件、対象語の活用形である（語幹の先頭3文字が一致）
- [ ] confusableSpellings に正答が含まれない
- [ ] distractors に正答の meaning が含まれない
- [ ] examples の blank に ___ が含まれる
- [ ] 重複語がない
```
