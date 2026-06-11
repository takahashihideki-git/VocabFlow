# VocabFlow word-data.js 追加品質修正指示書（distractor・meaning編）

対象ファイル: `core/word-data.js`（Phase 1 修正適用済みの最新版を使用）

## 背景

四択問題の不正解選択肢（distractors）に、正解と同義・類義の日本語訳が含まれているケースが発見された。学習者が正しい知識を持っていても正答を選べない致命的な問題。また meaning フィールドに韓国語が混入しているケースも1件発見された。

---

## 問題1: distractors に同義語の meaning が含まれている（14件）

distractor は「明らかに間違いとわかる選択肢」でなければならない。正解の語と意味が重なる語の日本語訳が distractor に入っていると、四択問題として破綻する。

### 致命的（正解とほぼ同義 — 学習者が区別不可能）

| id | word | 問題の distractor | 衝突先 | 深刻度 |
|----|------|------------------|--------|--------|
| 400 | nevertheless | 「それにもかかわらず、それでもやはり」 | #1000 nonetheless の meaning | 致命的 |
| 1000 | nonetheless | 「それにもかかわらず、それでも」 | #400 nevertheless の meaning | 致命的 |
| 1000 | nonetheless | 「それにもかかわらず、とにかく」 | #497 regardless の meaning | 致命的 |
| 357 | vote | 「世論調査・投票」 | #1062 poll の meaning | 致命的 |
| 1383 | indispensable | 「不可欠な、極めて重要な」 | #584 vital の meaning | 致命的 |
| 1389 | fragile | 「繊細な、壊れやすい」 | #1283 delicate の meaning | 致命的 |
| 1399 | inherent | 「先住民の；固有の」 | #1189 indigenous の meaning | 致命的 |

### 要注意（意味が近いが文脈で区別可能な場合もある）

| id | word | 問題の distractor | 衝突先 | 深刻度 |
|----|------|------------------|--------|--------|
| 100 | despite | 「それにもかかわらず、それでも」 | #400 nevertheless の meaning | 要注意（品詞が異なる: 前置詞 vs 副詞） |
| 497 | regardless | 「それにもかかわらず、それでもやはり」 | #1000 nonetheless の meaning | 要注意（意味が近いが用法が異なる） |
| 283 | vast | 「巨大な、莫大な」 | #1582 immense の meaning | 要注意 |
| 1100 | versus | 「〜であるのに対して、一方で」 | #300 whereas の meaning | 要注意 |
| 1379 | outstanding | 「壮大な、素晴らしい」 | #1298 magnificent の meaning | 要注意 |
| 686 | rational | 「有効な、妥当な」 | #1080 valid の meaning | 軽微 |
| 1079 | grateful | 「勤勉な、努力家の」 | #1781 diligent の meaning | 問題なし（意味が十分異なる） |

### 修正方針

1. 「致命的」の7件は必ず distractor を差し替える
2. 「要注意」の5件は品詞・文脈の違いで区別可能か判断し、紛らわしい場合は差し替え
3. 差し替え先の distractor は以下の条件を満たすこと:
   - 対象語と同じ品詞（pos）の別の語の日本語訳を使う
   - 対象語と意味が明確に異なること
   - データセット内の他の同義語・類義語の meaning と重複しないこと

### 差し替え時の検証

差し替え後、以下のスクリプトで再検証すること:

```javascript
// 各 word について、distractors の各要素が
// データセット内の同義語・類義語の meaning と一致しないか確認
WORD_DATA.forEach(w => {
  const meanings = w.meanings.map(m => m.meaning.trim());
  w.distractors.forEach(d => {
    WORD_DATA.forEach(other => {
      if (other.id === w.id) return;
      other.meanings.forEach(om => {
        if (om.meaning.trim() === d.trim()) {
          // other の meaning が w の meaning と類似していないか確認
          // 類似していれば問題あり
        }
      });
    });
  });
});
```

---

## 問題2: meaning フィールドに韓国語が混入（1件）

| id | word | 問題の meaning | 修正 |
|----|------|---------------|------|
| 1700 | intact | 「無傷の、손상されていない」 | → 「無傷の、損傷されていない」 |

「손상されていない」は韓国語の「손상（損傷）」＋日本語の「されていない」が混ざったもの。LLM生成時のトークン混入と思われる。

### 補足: 他に韓国語・中国語の混入がないか全件チェックすること

```javascript
const koreanRegex = /[\uAC00-\uD7AF]/; // ハングル
WORD_DATA.forEach(w => {
  // meanings, distractors, passive 全フィールドを検査
  const fields = [
    ...w.meanings.map(m => m.meaning),
    ...w.distractors,
    ...(w.examples || []).map(e => e.ja),
    w.passive?.tips, w.passive?.confusables,
    w.passive?.trivia, w.passive?.etymology,
  ];
  fields.forEach((text, i) => {
    if (text && koreanRegex.test(text)) {
      console.log(`#${w.id} ${w.word}: Korean detected in field ${i}: ${text}`);
    }
  });
});
```

---

## 問題3: データセット全体の distractor 品質の構造的検証（推奨）

今回の調査は「distractor が他の語の meaning と完全一致」するケースのみ検出した。以下の潜在的問題は未検証:

1. **日本語表現が微妙に異なるが意味が同じ** — 例:「増やす」vs「増加させる」。完全一致では検出できない。
2. **distractor が正解の meaning の部分一致** — 例: 正解が「〜を調査する」、distractorが「調査する、研究する」。
3. **distractor 3つのうち2つ以上が似た意味** — 選択肢として機能しにくい。

これらはClaude API を使った意味的類似度チェックで検出可能。余力があれば実施を推奨。

---

## 問題4: meaningのカタカナがaudioHintと一致し、四択の正解を推測可能にしている

### 概要

四択問題は「日本語の意味を見て正しい英単語を選ぶ」形式だが、正解の選択肢（meaning）にカタカナ語が含まれている場合、英単語の知識がなくてもカタカナの音から正解を推測できてしまう。

例: meaningが「革新、イノベーション」→ 選択肢にinnovationがあれば、「イノベーション」の音だけで正解がわかる。

### 規模

- meaningにカタカナ（3文字以上）を含む語: 299件 / 1,900件
- うちaudioHintと一致し正解が推測可能: **146語**（全体の7.7%）
- meaningがカタカナのみ（日本語の言い換えなし）: **9語**（最悪のケース）

### カタカナのみの9語（正答が一意に特定できてしまう）

| id | word | meaning |
|----|------|---------|
| 173 | site | （ウェブ）サイト |
| 361 | web | ウェブ、インターネット |
| 783 | concrete | コンクリート製の |
| 853 | mall | ショッピングモール |
| 1055 | penalty | ペナルティ（スポーツ） |
| 1076 | fantasy | ファンタジー（ジャンル） |
| 1354 | horror | ホラー（ジャンル） |
| 1355 | cluster | （データの）クラスター |
| 1645 | barrel | 樽、バレル |

### これはデータ修正だけでは解決できない

この問題には2つの層がある:

**層1: データの問題（修正可能）**
- meaningの日本語訳をカタカナ語に頼らず和語・漢語で書き直す
- 例: 「イノベーション」→「技術革新」、「コミュニティ」→「地域社会」
- ただし一部の語はカタカナ以外の自然な訳が存在しない（web, mall, fantasy等）

**層2: アプリ設計の問題（仕様検討が必要）**
- 四択の選択肢表示時に、正解のmeaningからカタカナ部分を除外するロジック
- あるいは、カタカナ語が含まれる場合は出題形式を変える（例: 空欄補充のみ、四択を出さない）
- distractorにも意図的にカタカナを含む語を混ぜて消去法を無効化する

### 推奨アクション

1. **即時対応（データ修正）**: 9語のカタカナのみmeaningに和語・漢語の言い換えを追加する（例: `mall` → `大型商業施設、ショッピングモール`）
2. **短期対応（データ修正）**: 146語のmeaningで、カタカナ語より先に和語・漢語を配置する（例: `「革新、イノベーション」` は現状でOK。`「イノベーション、革新」` なら語順入れ替え）
3. **中期対応（アプリ設計）**: 四択表示時の正解meaning表示ロジックを検討。VocabFlowのUI仕様として別途設計が必要。

---

## 実行順序

```
1. #1700 intact の韓国語修正（即時、1行修正）
2. 韓国語・中国語の全件スキャン（スクリプト実行）
3. 致命的 distractor 7件の差し替え
4. 要注意 distractor 5件の判断・差し替え
5. 差し替え後の再検証
6. カタカナのみ meaning 9語に和語・漢語の言い換えを追加
7. カタカナ meaning 146語の語順確認（和語・漢語を先頭に）
8. （アプリ設計検討）四択表示時のカタカナ正解問題への対処方針
```
