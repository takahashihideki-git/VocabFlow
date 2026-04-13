# VocabFlow word-data-spec 改訂: `choiceLabel` の導入

改訂日: 2026-04-13
対象: vocabflow-word-data-spec.md

---

## 1. 改訂の背景

### 問題

Recognition カード（英単語→日本語訳の四択）において、正解選択肢に `meanings[0].meaning` をそのまま使用している。この meaning にカタカナ語が含まれる場合、学習者は英語の知識がなくてもカタカナの音から正解を推測できてしまう。

例:
- `innovation` の正解選択肢が「革新、**イノベーション**」→ 音で推測可能
- `web` の正解選択肢が「**ウェブ**、インターネット」→ ほぼ自明

### 影響範囲

- meaning にカタカナ（3文字以上）を含み、audioHint と一致する語: **146語**（全体の7.7%）
- meaning がカタカナのみで日本語の言い換えがない語: **9語**

### 設計方針

- `meanings` は辞書的な正確性を維持する役割に専念させる（カタカナ語を含むのは辞書として正しい）
- 四択の正解ラベルは学習効果を最大化する別の文字列で上書き可能にする
- 全語に必須ではなく、必要な語にのみ定義する **fallback 方式** を採用する

---

## 2. スキーマ変更

### 2.1 新規プロパティ: `choiceLabel`

Section 2.1「完全スキーマ」の `meanings` の直後に以下を追加:

```javascript
{
  // === 語彙情報 ===
  ...
  meanings: [
    {
      meaning: String,     // 日本語訳（辞書的。カタカナ語を含んでよい）
      pos: String,
    }
  ],
  choiceLabel: String?,    // 【新規・省略可】Recognition 四択の正解ラベル。
                           // 定義されていれば meanings[0].meaning の代わりに使用。
                           // カタカナ語を避け、和語・漢語で表現する。
  ...
}
```

### 2.2 型・制約

| プロパティ | 型 | 必須 | 制約 |
|-----------|-----|------|------|
| `choiceLabel` | String \| undefined | いいえ | カタカナ（3文字以上の連続）を含まないこと。空文字列は不可（未定義とすること）。 |

### 2.3 UIでの参照ルール

Recognition カードの正解選択肢テキストの決定ロジック:

```javascript
function getChoiceText(entry) {
  return entry.choiceLabel ?? entry.meanings[0].meaning;
}
```

- `choiceLabel` が定義されている → それを四択の正解として表示
- `choiceLabel` が未定義 → `meanings[0].meaning` を使用（従来通り）

### 2.4 他のカード種別への影響

| カード種別 | choiceLabel を使用するか | 理由 |
|-----------|------------------------|------|
| Intro | **使用しない** | 意味の全体像を見せる場面。meanings を表示 |
| Recognition | **使用する** | 四択のテスト。推測防止が必要 |
| Recall | 使用しない | 空欄補充。日本語訳は参考表示 |
| Dictation | 使用しない | 音声→スペル。日本語訳は補助 |
| Handwrite | 使用しない | 停滞介入用。日本語訳は補助 |
| Passive | 使用しない | 読み物カード。テスト要素なし |

---

## 3. choiceLabel の設計原則

### 3.1 基本原則

**「その日本語だけを見て、学習者が英単語の音を推測できないこと」**

### 3.2 良い choiceLabel の条件

1. カタカナ語を含まない（3文字以上の連続カタカナは禁止）
2. 対象語の意味を正確に表している
3. distractors（不正解選択肢）と明確に区別できる
4. 自然な日本語として読める

### 3.3 例

| word | meanings[0].meaning | choiceLabel | 方針 |
|------|---------------------|-------------|------|
| web | ウェブ、蜘蛛の巣 | 蜘蛛の巣 | カタカナを除去し、原義の和語を採用 |
| innovation | 革新、イノベーション | 革新 | 先頭の和語部分を抽出 |
| community | 地域社会、コミュニティ | 地域社会 | 先頭の和語部分を抽出 |
| design | 〜をデザインする | 〜を設計する | 和語に言い換え |
| stress | ストレス；精神的緊張 | 精神的緊張 | カタカナ以外の部分を採用 |
| shelter | 避難所、シェルター | 避難所 | 先頭の和語部分を抽出 |
| mall | ショッピングモール | 大型商業施設 | 完全に和語で言い換え |
| fantasy | ファンタジー（ジャンル） | 空想、幻想 | 完全に和語で言い換え |
| horror | ホラー（ジャンル） | 恐怖、戦慄 | 完全に和語で言い換え |
| cluster | （データの）クラスター | 集団、群れ | 完全に和語で言い換え |
| access | アクセス、利用する権利 | 利用する権利 | カタカナ以外の部分を採用 |
| routine | 日課、ルーティン | 日課 | 先頭の和語部分を抽出 |
| concrete | コンクリート製の | 具体的な | 主要義である形容詞の意味を採用 |

### 3.4 choiceLabel が不要なケース

meaning にカタカナが含まれていても、英単語の音と対応しない場合は不要:

| word | meanings[0].meaning | choiceLabel 不要の理由 |
|------|---------------------|-----------------------|
| opportunity | 機会、チャンス | 「チャンス」≠ opportunity の音 |
| survey | ～を調査する、アンケートを取る | 「アンケート」≠ survey の音 |
| virus | ウイルス | 「ウイルス」≠ virus の音（ヴァイラス） |
| elite | エリート、精鋭集団 | 「エリート」≠ elite の音（イリート） |

---

## 4. 適用対象の判定基準

以下の条件をすべて満たす語に `choiceLabel` を定義する:

```
1. meanings のいずれかにカタカナ（3文字以上連続）が含まれる
2. そのカタカナが audioHint と音的に一致する
   （audioHint の先頭3文字とカタカナの先頭3文字が一致、
    またはカタカナが audioHint に含まれる、
    またはaudioHint がカタカナに含まれる）
3. choiceLabel として自然な和語・漢語の言い換えが可能
```

条件3について: 一部の語は和語での言い換えが極めて不自然な場合がある（例: `algorithm` → ?）。その場合は choiceLabel を定義せず、代替策としてdistractorsにもカタカナ語を含む語を混ぜるなどUI側で対処する。この判断は個別に行う。

---

## 5. 生成パイプラインへの追加

### 5.1 Phase 2 AI生成プロンプトへの追記

Section 3.2 の AI 生成プロンプトに以下を追加:

```
"choiceLabel": "（meanings のカタカナ語が英単語の音と一致する場合のみ）
    四択の正解選択肢用のテキスト。カタカナ語を使わず、和語・漢語で表現する。
    meanings と意味が一致していること。
    カタカナ語が英単語の音と一致しない場合は、このフィールドを省略する。"
```

### 5.2 バリデーション追加

Section 8 のバリデーションルールに以下を追加:

```javascript
// choiceLabel バリデーション
if (entry.choiceLabel !== undefined) {
  // 空文字列チェック
  assert(entry.choiceLabel.trim().length > 0, 
    `#${entry.id}: choiceLabel が空文字列`);
  
  // カタカナ（3文字以上連続）チェック
  assert(!/[ァ-ヾー]{3,}/.test(entry.choiceLabel),
    `#${entry.id}: choiceLabel にカタカナが含まれている: "${entry.choiceLabel}"`);
  
  // choiceLabel が distractors と重複しないこと
  assert(!entry.distractors.includes(entry.choiceLabel),
    `#${entry.id}: choiceLabel が distractor と一致`);
}
```

---

## 6. 既存データへの適用

### 6.1 対象語の特定

本改訂に先立つ調査で、146語が choiceLabel 定義の候補として特定されている。

### 6.2 適用の優先順位

```
1. カタカナのみの meaning（9語）— 最優先。choiceLabel がないと四択が機能しない
2. audioHint 完全一致（137語）— meaning の先頭に和語がある場合はそこから抽出可能
3. 和語の言い換えが困難な語 — 個別判断。choiceLabel 定義を見送り、UI側で対処
```

### 6.3 実装タスク

1. 146語の候補リストに対して choiceLabel を生成（Claude Code バッチ処理）
2. バリデーションスクリプトを更新
3. Recognition カードの UI ロジックに `getChoiceText()` fallback を実装
