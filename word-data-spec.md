# VocabFlow 単語データ仕様書

## 概要

VocabFlow SRSで使用する1900語の単語データの構造・生成方法・品質要件を定義する。
各カード種別（Intro, Recognition, Recall, Dictation, Handwrite, Passive）が要求するフィールドを網羅する。

---

## 1. 元データ

### 1.1 単語リスト

既存の1900語リスト（1900.txt）を使用する。リストの語順がそのままword_idとなり、ウェーブの割り当て順序にもなる。

```
word_id 1:    create
word_id 2:    increase
word_id 3:    improve
...
word_id 1900: zealous
```

### 1.2 18カテゴリ分類

既存のクラスタリング結果を使用する。

| ID | 種別 | クラスター名 |
|---|---|---|
| 1 | 動詞 | 基本動作・操作・変化動詞 |
| 2 | 動詞 | 認知・思考・コミュニケーション動詞 |
| 3 | 動詞 | 身体動作・生理・物理動詞 |
| 4 | 動詞 | 社会的行為・対人関係動詞 |
| 5 | 名詞 | 科学・医学・健康 |
| 6 | 名詞 | 社会・政治・制度 |
| 7 | 名詞 | 経済・ビジネス・金融 |
| 8 | 名詞 | 自然・環境・地理 |
| 9 | 名詞 | 学術・教育・知識 |
| 10 | 名詞 | 抽象概念・哲学・精神 |
| 11 | 名詞 | 日常生活・物品・文化 |
| 12 | 名詞 | 技術・システム・情報 |
| 13 | 名詞 | 芸術・文化・創作 |
| 14 | 名詞 | 時間・空間・数量 |
| 15 | 形容詞 | 基本特性・状態形容詞 |
| 16 | 形容詞 | 感情・性格・人間性形容詞 |
| 17 | 形容詞 | 専門的・技術的・学術的形容詞 |
| 18 | 形容詞 | 評価・判断・程度形容詞 |
| 0 | — | 分類不可能 |

カテゴリはSRSアルゴリズム内で以下に利用される：
- 将来の「カテゴリ間相関モデル」（同カテゴリの弱点推定）
- Recognition用ダミー選択肢の生成（同カテゴリから選出）
- Word Wave可視化でのグルーピング表示オプション

---

## 2. 単語エントリのデータ構造

### 2.1 完全スキーマ

```javascript
{
  // === 基本情報 ===
  id: Number,              // 1-1900。リスト順。wave割り当ての基準
  word: String,            // 英単語（小文字基本形）
  
  // === 語彙情報 ===
  pos: String,             // 品詞: "verb" | "noun" | "adjective" | "adverb" | "other"
  categoryId: Number,      // 18カテゴリのID (0-18)
  meanings: [              // 日本語の意味（複数可。主要な意味を先頭に）
    {
      meaning: String,     // 日本語訳
      pos: String,         // この意味における品詞（多品詞語用）
    }
  ],
  
  // === 発音情報（Intro, Dictation, Handwrite で使用）===
  pronunciation: String,   // IPA発音記号 例: "/əˈbændən/"
  syllables: String,       // シラブル分割 例: "a-ban-don"
  audioHint: String,       // 発音の日本語近似（カタカナ）例: "アバンドン"
  
  // === 例文（Intro, Recall, Passive で使用）===
  examples: [
    {
      en: String,          // 英語例文
      ja: String,          // 日本語訳
      blank: String,       // 空欄版（Recall用）例: "They had to ___ the sinking ship."
      blankAnswer: String, // 空欄の正解 例: "abandon"
      // blankAnswer は word と異なる場合がある（活用形: "abandoned", "abandoning" 等）
    }
  ],
  
  // === Recognition用ダミー選択肢 ===
  distractors: [String],   // 3つのダミー選択肢（日本語の意味）
  // 正解の意味 + distractors 3つ = 4択
  // 同カテゴリ内の他の単語の意味から選出するのが望ましい
  
  // === Dictation/Handwrite用 ===
  confusableSpellings: [String],  // よくあるスペルミス 例: ["abanden", "abondon"]
  // phonetic match 判定の参考データ
  
  // === Passive カード用読み物コンテンツ ===
  passive: {
    etymology: String,       // 語源解説 例: "a-（離れて）+ bandon（支配）→ 支配を手放す → 放棄する"
    tips: String,            // 使い方のコツ、ニュアンス 例: "abandon は「完全に」諦めるニュアンス。give up より強い"
    confusables: String,     // 紛らわしい語との比較 例: "abandon vs. desert: desert は義務を放棄する意味合いが強い"
    collocations: [String],  // よく一緒に使われる語句 例: ["abandon hope", "abandon a plan", "abandon ship"]
    trivia: String,          // トリビア・文化的背景 例: "タイタニック号の船長は 'Abandon ship!' の命令を出さなかったと言われている"
  },
  
  // === メタデータ ===
  frequency: Number,       // 頻度ランク（COCA/BNC等。低い数字ほど高頻度）
  cefr: String,            // CEFRレベル推定: "A1"|"A2"|"B1"|"B2"|"C1"|"C2"
  // ウェーブ内での語順最適化の参考。高頻度・低CEFR語を先に出す等
}
```

### 2.2 各カード種別が参照するフィールド

| カード種別 | 参照フィールド |
|---|---|
| **Intro** | word, meanings, pronunciation, syllables, audioHint, examples[0].en, examples[0].ja |
| **Recognition** | word, meanings[0].meaning, distractors |
| **Recall** | examples[0].blank, examples[0].blankAnswer, examples[0].ja |
| **Dictation** | word, pronunciation, confusableSpellings |
| **Handwrite** | word, pronunciation, confusableSpellings |
| **Passive** | passive.etymology, passive.tips, passive.confusables, passive.collocations, passive.trivia（ランダムに1つ選んで表示）。word をハイライト |

### 2.3 最小限スキーマ（プロトタイプ初期段階用）

全フィールドが揃わなくてもプロトタイプが動作するよう、必須/任意を定義する。

```javascript
// 必須（これがないとカードが生成できない）
{
  id: Number,
  word: String,
  pos: String,
  categoryId: Number,
  meanings: [{ meaning: String }],  // 最低1つ
  examples: [{
    en: String,
    blank: String,
    blankAnswer: String,
  }],                                // 最低1つ
  distractors: [String],             // 最低3つ
}

// 任意（あれば品質向上）
{
  pronunciation: String,
  syllables: String,
  audioHint: String,
  "examples[].ja": String,
  confusableSpellings: [String],
  frequency: Number,
  cefr: String,
}
```

---

## 3. データ生成パイプライン

### 3.1 生成戦略

1900語の全データを手作業で作成するのは非現実的。以下の段階的アプローチで生成する。

#### Phase 0: ダミーデータ（シミュレーター用）

SRSアルゴリズムのシミュレーションは単語の中身を参照しない。id, word, categoryId のみあれば動作する。

```javascript
// word-data.js（シミュレーター最低限）
export const WORD_DATA = Array.from({ length: 1900 }, (_, i) => ({
  id: i + 1,
  word: WORD_LIST[i],          // 1900.txt から読み込んだ単語
  categoryId: CATEGORIES[i],    // 18カテゴリ分類結果
}));
```

#### Phase 1: サンプルデータ（インタラクティブUI用、50〜200語）

最初の数ウェーブ分を手動＋AI生成で作成し、UIの動作確認に使う。

```
Wave 1 (単語 1-50):   全フィールド完備
Wave 2 (単語 51-100): 全フィールド完備
Wave 3-4 (101-200):   最小限スキーマ
```

#### Phase 2: AI一括生成（全1900語）

Claude API を使ってバッチ処理で全単語のデータを生成する。

```
入力: 単語リスト（バッチ20語ずつ）+ カテゴリ情報
出力: 完全スキーマの JSON
検証: 自動バリデーション + サンプリング人手チェック
```

#### Phase 3: 品質改善（継続的）

- ダミー選択肢の品質向上（同カテゴリ内から自動選出→人手確認）
- 例文の自然さチェック
- confusableSpellings の実データ蓄積（ユーザーの誤回答から収集）

### 3.2 AI生成プロンプト（Phase 2 用）

```
以下の英単語について、指定フォーマットのJSONを生成してください。

単語: {word}
カテゴリ: {category_name}

出力フォーマット:
{
  "word": "{word}",
  "pos": "品詞",
  "meanings": [
    { "meaning": "最も一般的な日本語訳", "pos": "品詞" },
    { "meaning": "2番目の意味（あれば）", "pos": "品詞" }
  ],
  "pronunciation": "/IPA発音記号/",
  "syllables": "シラブル分割（ハイフン区切り）",
  "audioHint": "カタカナ近似発音",
  "examples": [
    {
      "en": "自然な英語例文（15語以内）",
      "ja": "日本語訳",
      "blank": "対象単語を___に置換した版",
      "blankAnswer": "空欄の正解（活用形含む）"
    }
  ],
  "distractors": ["ダミー意味1", "ダミー意味2", "ダミー意味3"],
  "confusableSpellings": ["よくあるスペルミス1", "よくあるスペルミス2"],
  "passive": {
    "etymology": "語源の解説（接頭辞・語根の分解）",
    "tips": "使い方のコツ、日本人が間違えやすいポイント",
    "confusables": "紛らわしい語との比較・使い分け",
    "collocations": ["頻出コロケーション1", "コロケーション2", "コロケーション3"],
    "trivia": "文化的背景やトリビア（TikTok的な『へぇ』感を意識）"
  },
  "frequency": COCA頻度順位の推定値,
  "cefr": "CEFRレベル推定"
}

制約:
- examples の英語例文は、日常的で自然な文にすること
- distractors は同じ品詞カテゴリ内の別の単語の意味を使うこと
- distractors は正解と紛らわしいが明確に区別できるものを選ぶこと
- confusableSpellings は日本人学習者が犯しやすいスペルミスを含めること
- blankAnswer は文脈に応じた活用形（三単現のs、過去形、進行形等）にすること
- passive の各フィールドは日本語で記述すること
- passive.etymology は接頭辞・語根の分解を含め、可能なら日本語のカタカナ語との関連に触れること
- passive.tips は日本人英語学習者が実際に間違えやすいポイントに焦点を当てること
- passive.trivia は堅くなりすぎず、「へぇ」と思える内容にすること
- passive の全フィールドが書けない場合は、書けるものだけでよい

JSONのみを出力してください。
```

### 3.3 バッチ処理の設計

```javascript
// generate-word-data.js（Node.js スクリプト）
// Claude API を使って20語ずつバッチ生成

const BATCH_SIZE = 20;

async function generateBatch(words, startIndex) {
  const prompt = buildPrompt(words);
  const response = await callClaudeAPI(prompt);
  const parsed = JSON.parse(response);
  
  // バリデーション
  for (const entry of parsed) {
    validateEntry(entry);
  }
  
  return parsed;
}

// バリデーション
function validateEntry(entry) {
  const errors = [];
  
  // 必須フィールド
  if (!entry.word) errors.push('word missing');
  if (!entry.pos) errors.push('pos missing');
  if (!entry.meanings?.length) errors.push('meanings empty');
  if (!entry.examples?.length) errors.push('examples empty');
  if (!entry.distractors?.length >= 3) errors.push('need 3+ distractors');
  
  // 例文の空欄チェック
  for (const ex of entry.examples || []) {
    if (!ex.blank?.includes('___')) errors.push('blank missing ___');
    if (!ex.blankAnswer) errors.push('blankAnswer missing');
  }
  
  // distractors が正解と重複していないか
  const correctMeaning = entry.meanings[0]?.meaning;
  if (entry.distractors?.includes(correctMeaning)) {
    errors.push('distractor duplicates correct answer');
  }
  
  return errors;
}
```

---

## 4. Distractor（ダミー選択肢）生成ルール

Recognition カードの品質は distractors の質に直結する。

### 4.1 基本ルール

- 正解と同じ品詞カテゴリの単語の意味から選ぶ
- 正解と「紛らわしいが区別可能」なものを選ぶ
- 明らかに不正解とわかるものは避ける
- 3つのダミーの間でも意味が被らないようにする

### 4.2 品詞別 distractor 戦略

**動詞の場合**:
同じ動詞カテゴリ（4カテゴリ内）から選出。
例: "abandon"（〜を捨てる）のdistractors →「〜を吸収する」「〜を認める」「〜を獲得する」

**名詞の場合**:
同じ名詞カテゴリ（10カテゴリ内）から選出。
例: "democracy"（民主主義）→「官僚制」「経済」「哲学」

**形容詞の場合**:
同じ形容詞カテゴリ（4カテゴリ内）から選出。
例: "anxious"（不安な）→「退屈な」「誠実な」「頑固な」

### 4.3 動的 distractor 選出（将来実装）

学習者の既知語から動的にdistractorを選出する。
既知語を使うことで「知っている意味の中から正解を選ぶ」構造になり、
テストの妥当性が向上し、既知語の復習にもなる。

```javascript
function selectDistractors(targetWord, learnerState, wordData) {
  // 同カテゴリの既知語（h > 2日）からランダムに3つ選出
  const sameCategory = wordData.filter(w =>
    w.categoryId === targetWord.categoryId &&
    w.id !== targetWord.id &&
    learnerState.getWord(w.id).h > 2.0
  );
  return shuffle(sameCategory).slice(0, 3).map(w => w.meanings[0].meaning);
}
```

---

## 5. 例文の品質要件

### 5.1 Intro用例文

- 自然で日常的な英文（不自然な教科書英語を避ける）
- 15語以内
- 対象単語の最も一般的な意味で使用
- 文脈から意味が推測しやすい（学習の助けになる）

### 5.2 Recall用例文（空欄問題）

- 空欄の位置が文脈から一意に推測できること
- 空欄化する単語は原形とは限らない（活用形OK）
  - "She ___ the project last year." → "abandoned"
  - "The children were ___ their toys." → "abandoning"
- blankAnswer に正確な活用形を記録する
- 文中の他の単語が手がかりになる構造（時制のヒント等）

### 5.3 Passive カードコンテンツ

Passive カードはテストではなく「読み物」として機能する。フィード内のテストカードの間に挟まることで、スクロールの単調さを緩和し、エピソード記憶のフックを提供する。

**コンテンツ種別と品質要件:**

**etymology（語源）:**
- 接頭辞・接尾辞・語根の分解を示す
- 日本人学習者にとって馴染みのあるカタカナ語や漢字語との関連があれば言及する
- 例: "abandon: a-（離れて）+ bandon（支配、ban と同根）→ 支配を手放す → 放棄する"

**tips（使い方のコツ）:**
- 日本人が間違えやすいポイントに焦点を当てる
- 類義語との使い分け、可算/不可算、前置詞の選択など
- 例: "evidence は不可算名詞。a piece of evidence とは言うが、an evidence とは言わない"

**confusables（紛らわしい語との比較）:**
- スペル・意味・発音が似ている語のペアを解説
- 例: "affect（動詞: 影響する）vs. effect（名詞: 効果）。'A comes before E' で覚える"

**collocations（コロケーション）:**
- 3〜5個の頻出コロケーションをリスト
- 例: ["make a decision", "reach a decision", "final decision"]

**trivia（トリビア・文化的背景）:**
- 学習者の興味を引く雑学・エピソード
- 堅くなりすぎず、TikTok的な「へぇ」感を意識する
- 例: "democracy はギリシャ語の demos（民衆）+ kratos（力）。古代アテナイでは女性と奴隷に参政権はなかった"

**表示ルール:**
- 1回の Passive カード表示では、上記コンテンツからランダムに1つを選んで表示する
- 同じ単語の Passive が複数回出現する場合、前回と異なる種別を優先的に選ぶ
- すべての種別が揃っていなくてもよい。最低1つあれば Passive カードとして機能する

---

## 6. 音声関連データ

### 6.1 TTS音声（Web Speech API）

プロトタイプでは Web Speech API (SpeechSynthesis) を使用する。
word-data.js に音声ファイルパスは含めず、クライアント側で動的に生成。

```javascript
function speak(text, lang = 'en-US') {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = 0.9;  // やや遅め
  return utterance;
}
```

### 6.2 将来: 高品質TTS

Chatterbox TTS 等のローカルTTSパイプラインで事前生成した音声ファイルを使用。
その場合の word-data.js 拡張:

```javascript
{
  // ...既存フィールド
  audio: {
    word: "audio/abandon_word.mp3",      // 単語のみ
    example: "audio/abandon_example.mp3", // 例文読み上げ
    slow: "audio/abandon_slow.mp3",       // ゆっくり発音
  }
}
```

---

## 7. ファイル形式と配置

### 7.1 word-data.js

ESモジュールとしてエクスポートする。

```javascript
// core/word-data.js

export const CATEGORIES = [
  { id: 0, name: "分類不可能", pos: "other" },
  { id: 1, name: "基本動作・操作・変化動詞", pos: "verb" },
  { id: 2, name: "認知・思考・コミュニケーション動詞", pos: "verb" },
  { id: 3, name: "身体動作・生理・物理動詞", pos: "verb" },
  { id: 4, name: "社会的行為・対人関係動詞", pos: "verb" },
  { id: 5, name: "科学・医学・健康", pos: "noun" },
  { id: 6, name: "社会・政治・制度", pos: "noun" },
  { id: 7, name: "経済・ビジネス・金融", pos: "noun" },
  { id: 8, name: "自然・環境・地理", pos: "noun" },
  { id: 9, name: "学術・教育・知識", pos: "noun" },
  { id: 10, name: "抽象概念・哲学・精神", pos: "noun" },
  { id: 11, name: "日常生活・物品・文化", pos: "noun" },
  { id: 12, name: "技術・システム・情報", pos: "noun" },
  { id: 13, name: "芸術・文化・創作", pos: "noun" },
  { id: 14, name: "時間・空間・数量", pos: "noun" },
  { id: 15, name: "基本特性・状態形容詞", pos: "adjective" },
  { id: 16, name: "感情・性格・人間性形容詞", pos: "adjective" },
  { id: 17, name: "専門的・技術的・学術的形容詞", pos: "adjective" },
  { id: 18, name: "評価・判断・程度形容詞", pos: "adjective" },
];

export const WORD_DATA = [
  {
    id: 1,
    word: "create",
    pos: "verb",
    categoryId: 1,
    meanings: [
      { meaning: "〜を創造する", pos: "verb" },
      { meaning: "〜を引き起こす", pos: "verb" }
    ],
    pronunciation: "/kriˈeɪt/",
    syllables: "cre-ate",
    audioHint: "クリエイト",
    examples: [
      {
        en: "She created a beautiful painting in just two hours.",
        ja: "彼女はわずか2時間で美しい絵を描き上げた。",
        blank: "She ___ a beautiful painting in just two hours.",
        blankAnswer: "created"
      }
    ],
    distractors: ["〜を増加させる", "〜を改善する", "〜を生産する"],
    confusableSpellings: ["creat", "criate"],
    frequency: 254,
    cefr: "A2"
  },
  // ... 1900語分
];
```

### 7.2 ファイルサイズの見積もり

- 1語あたり約 500 バイト（JSONテキスト）
- 1900語 × 500B = 約 950KB
- gzip圧縮後: 約 200-300KB
- ブラウザの初回読み込みに許容可能なサイズ

### 7.3 分割読み込み（オプション）

ファイルサイズが大きくなった場合、ウェーブ単位で分割可能:

```
core/word-data/
├── meta.js          # CATEGORIES + 全単語の最小情報 (id, word, categoryId)
├── wave-01.js       # 単語 1-50 の完全データ
├── wave-02.js       # 単語 51-100
├── ...
└── wave-38.js       # 単語 1851-1900
```

アクティブウェーブのデータのみを遅延読み込みする構成。

---

## 8. バリデーションルール

自動チェックで検出すべきエラー:

### 8.1 必須フィールドチェック
- [ ] id が 1-1900 の範囲で一意
- [ ] word が空でない
- [ ] pos が "verb"|"noun"|"adjective"|"adverb"|"other" のいずれか
- [ ] categoryId が 0-18 の範囲
- [ ] meanings が1つ以上
- [ ] examples が1つ以上
- [ ] distractors が3つ以上

### 8.2 整合性チェック
- [ ] examples[].blank に "___" が含まれている
- [ ] examples[].blankAnswer が空でない
- [ ] distractors に meanings[0].meaning と同一のものがない
- [ ] distractors 同士に重複がない
- [ ] confusableSpellings に正しいスペル (word) が含まれていない

### 8.3 品質チェック（警告レベル）
- [ ] pronunciation が "/" で囲まれている
- [ ] syllables にハイフンが含まれている
- [ ] examples[].en が 20語以内
- [ ] cefr が "A1"|"A2"|"B1"|"B2"|"C1"|"C2" のいずれか
- [ ] frequency が 1-100000 の範囲

---

## 9. SRSアルゴリズムとの接続点

### 9.1 ウェーブ割り当て

```javascript
function getWaveNumber(wordId, waveSize) {
  return Math.ceil(wordId / waveSize);
}
// wordId=1  → Wave 1
// wordId=50 → Wave 1
// wordId=51 → Wave 2
```

リストの先頭ほど高頻度・基礎的な語彙が来るよう、元の1900語リストの語順が重要。
現状のリスト（create, increase, improve...）はおおよそ頻度順に並んでいるが、
frequency フィールドを使ってウェーブ内の提示順を最適化することも可能。

### 9.2 カテゴリ活用

```javascript
// 同カテゴリの単語を取得（情報利得ベースの選出で将来使用）
function getWordsByCategory(categoryId) {
  return WORD_DATA.filter(w => w.categoryId === categoryId);
}

// 動的 distractor 生成
function getDynamicDistractors(word, learnedWords) {
  const sameCategory = learnedWords.filter(w =>
    w.categoryId === word.categoryId && w.id !== word.id
  );
  return shuffle(sameCategory).slice(0, 3).map(w => w.meanings[0].meaning);
}
```
