# VocabFlow 1900語 18カテゴリ分類 — 作業仕様書

## 概要

VocabFlow で使用する1900語の英単語を、18カテゴリ＋分類不可能（計19区分）に分類する。分類結果は word-data.js の `categoryId` フィールドに格納される。

**注意: 生成AIはリストの正確な管理が苦手である。** バッチの抽出・分類結果の記録・検証はすべて Python コードで機械的に行い、AIは「この単語はどのカテゴリか」の判断のみに集中する。

---

## 1. 18カテゴリ体系

### 1.1 カテゴリ一覧

| ID | 種別 | カテゴリ名 | 代表語の例 |
|---|---|---|---|
| 0 | — | 分類不可能 | （複数カテゴリに均等に属する等） |
| 1 | 動詞 | 基本動作・操作・変化動詞 | create, increase, produce, build, transform |
| 2 | 動詞 | 認知・思考・コミュニケーション動詞 | consider, suggest, analyze, explain, argue |
| 3 | 動詞 | 身体動作・生理・物理動詞 | breathe, crawl, float, stretch, drag |
| 4 | 動詞 | 社会的行為・対人関係動詞 | share, cooperate, negotiate, compete, lead |
| 5 | 名詞 | 科学・医学・健康 | molecule, symptom, therapy, organ, vaccine |
| 6 | 名詞 | 社会・政治・制度 | democracy, legislation, bureaucracy, treaty, reform |
| 7 | 名詞 | 経済・ビジネス・金融 | revenue, investment, commodity, deficit, inflation |
| 8 | 名詞 | 自然・環境・地理 | ecosystem, glacier, vegetation, continent, drought |
| 9 | 名詞 | 学術・教育・知識 | hypothesis, curriculum, methodology, thesis, discipline |
| 10 | 名詞 | 抽象概念・哲学・精神 | consciousness, virtue, paradox, autonomy, fate |
| 11 | 名詞 | 日常生活・物品・文化 | furniture, cuisine, fabric, luggage, costume |
| 12 | 名詞 | 技術・システム・情報 | algorithm, database, bandwidth, protocol, interface |
| 13 | 名詞 | 芸術・文化・創作 | sculpture, melody, narrative, portrait, genre |
| 14 | 名詞 | 時間・空間・数量 | interval, dimension, proportion, duration, volume |
| 15 | 形容詞 | 基本特性・状態形容詞 | common, available, appropriate, complex, obvious |
| 16 | 形容詞 | 感情・性格・人間性形容詞 | anxious, generous, stubborn, humble, enthusiastic |
| 17 | 形容詞 | 専門的・技術的・学術的形容詞 | sustainable, empirical, preliminary, cognitive, chronic |
| 18 | 形容詞 | 評価・判断・程度形容詞 | significant, crucial, adequate, profound, trivial |

### 1.2 分類の原則

**多品詞語（名詞にも動詞にも使える語）は、最も一般的な用法の品詞で分類する。**
例: "increase" → 動詞としての用法がより一般的 → カテゴリ1（基本動作・操作・変化動詞）

**複数カテゴリにまたがる語は、最も中心的な意味で分類する。**
例: "culture" → 日常生活・物品・文化(11)と芸術・文化・創作(13)の両方に関連するが、より広い文脈で使われる日常生活・物品・文化(11)に分類

**分類に強い根拠がない場合は、カテゴリ0（分類不可能）に入れる。**
無理に分類しない。ただし全体の5%以内（95語以内）に収める目標。

---

## 2. 作業フロー

### 2.1 全体の流れ

```
Step 1: 1900語リストを Python で20語ずつのバッチに分割（95バッチ）
Step 2: 各バッチについて AI が分類を判定（JSON出力）
Step 3: Python で分類結果をマージ・検証
Step 4: カテゴリ分布のレビュー
Step 5: 必要に応じてカテゴリ体系を再編し、再分類を実行
Step 6: 最終結果を word-data.js に統合
```

**Step 4 → Step 5 の判断基準:**

18カテゴリは仮説であり、全語を分類して初めて妥当性がわかる。以下のいずれかに該当したらカテゴリ体系の再編を検討する。

- **肥大カテゴリ:** 1カテゴリに全体の20%（380語）以上が集中している → 分割を検討
- **過疎カテゴリ:** 1カテゴリに20語未満 → 隣接カテゴリへの統合を検討
- **分類不可能の肥大:** カテゴリ0が5%（95語）を超えている → 新カテゴリの新設か、既存カテゴリの定義拡張を検討
- **恣意的な境界:** レビュー時に「この語はAにもBにも入る」が頻出するカテゴリペア → 統合を検討

再編後は、影響を受けるカテゴリの語のみを対象に再分類を実行する（全語再分類は不要）。

### 2.2 バッチ分割スクリプト

```python
# scripts/batch_extract.py
# 1900語リストを20語ずつのバッチに分割する

import json

def load_words(filepath='1900_words_list.md'):
    """1900語リストを読み込む。先頭行がヘッダの場合はスキップ。"""
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    words = []
    for line in lines:
        word = line.strip()
        if word and not word.startswith('#'):
            words.append(word)
    
    assert len(words) == 1900, f"Expected 1900 words, got {len(words)}"
    return words

def create_batches(words, batch_size=20):
    """単語リストをバッチに分割する。"""
    batches = []
    for i in range(0, len(words), batch_size):
        batch = []
        for j, word in enumerate(words[i:i+batch_size]):
            batch.append({
                'id': i + j + 1,  # 1-indexed
                'word': word
            })
        batches.append(batch)
    return batches

def save_batch(batch, batch_num, output_dir='batches'):
    """バッチをJSONファイルとして保存する。"""
    import os
    os.makedirs(output_dir, exist_ok=True)
    filepath = os.path.join(output_dir, f'batch_{batch_num:03d}.json')
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(batch, f, ensure_ascii=False, indent=2)
    return filepath

if __name__ == '__main__':
    words = load_words()
    batches = create_batches(words)
    print(f"Total batches: {len(batches)}")
    for i, batch in enumerate(batches):
        path = save_batch(batch, i + 1)
        print(f"Batch {i+1}: words {batch[0]['id']}-{batch[-1]['id']} -> {path}")
```

### 2.3 分類プロンプト（バッチごとに実行）

```
以下の英単語を、指定された18カテゴリ＋分類不可能（ID: 0）に分類してください。

## カテゴリ一覧
0: 分類不可能
1: 基本動作・操作・変化動詞
2: 認知・思考・コミュニケーション動詞
3: 身体動作・生理・物理動詞
4: 社会的行為・対人関係動詞
5: 科学・医学・健康（名詞）
6: 社会・政治・制度（名詞）
7: 経済・ビジネス・金融（名詞）
8: 自然・環境・地理（名詞）
9: 学術・教育・知識（名詞）
10: 抽象概念・哲学・精神（名詞）
11: 日常生活・物品・文化（名詞）
12: 技術・システム・情報（名詞）
13: 芸術・文化・創作（名詞）
14: 時間・空間・数量（名詞）
15: 基本特性・状態形容詞
16: 感情・性格・人間性形容詞
17: 専門的・技術的・学術的形容詞
18: 評価・判断・程度形容詞

## 分類対象単語
{batch_json}

## 出力形式
JSON配列で出力してください。各要素は {"id": 数値, "word": "単語", "categoryId": 数値} の形式。
必ず入力と同じ id, word を保持し、categoryId のみを追加してください。

## 注意
- 多品詞語は最も一般的な用法の品詞で分類する
- 複数カテゴリにまたがる語は最も中心的な意味で分類する
- 迷う場合は categoryId: 0（分類不可能）にする
- 副詞は、対応する形容詞のカテゴリに準じて分類する（例: significantly → 18）
- JSONのみ出力。説明不要。
```

### 2.4 分類結果のマージ・検証スクリプト

```python
# scripts/merge_validate.py
# 全バッチの分類結果をマージし、検証する

import json
import os

VALID_CATEGORY_IDS = set(range(0, 19))  # 0-18

def load_all_results(results_dir='results'):
    """全バッチの分類結果を読み込んでマージする。"""
    all_results = []
    for filename in sorted(os.listdir(results_dir)):
        if filename.endswith('.json'):
            with open(os.path.join(results_dir, filename), 'r', encoding='utf-8') as f:
                batch = json.load(f)
                all_results.extend(batch)
    return all_results

def validate(results, original_words):
    """分類結果の検証。"""
    errors = []
    warnings = []
    
    # 1. 件数チェック
    if len(results) != len(original_words):
        errors.append(f"Count mismatch: expected {len(original_words)}, got {len(results)}")
    
    # 2. ID の連続性と一意性
    ids = [r['id'] for r in results]
    expected_ids = list(range(1, len(original_words) + 1))
    missing_ids = set(expected_ids) - set(ids)
    duplicate_ids = [id for id in ids if ids.count(id) > 1]
    if missing_ids:
        errors.append(f"Missing IDs: {sorted(missing_ids)}")
    if duplicate_ids:
        errors.append(f"Duplicate IDs: {sorted(set(duplicate_ids))}")
    
    # 3. 単語の一致チェック（ID順にソート後）
    results_sorted = sorted(results, key=lambda r: r['id'])
    for r, expected_word in zip(results_sorted, original_words):
        if r['word'] != expected_word:
            errors.append(f"ID {r['id']}: word mismatch '{r['word']}' != '{expected_word}'")
    
    # 4. categoryId の範囲チェック
    for r in results:
        if r['categoryId'] not in VALID_CATEGORY_IDS:
            errors.append(f"ID {r['id']} ({r['word']}): invalid categoryId {r['categoryId']}")
    
    # 5. カテゴリ分布の確認（警告レベル）
    from collections import Counter
    dist = Counter(r['categoryId'] for r in results)
    print("\n=== カテゴリ分布 ===")
    for cat_id in sorted(dist.keys()):
        count = dist[cat_id]
        pct = count / len(results) * 100
        marker = " ⚠️" if cat_id == 0 and pct > 5 else ""
        print(f"  Category {cat_id:2d}: {count:4d} ({pct:5.1f}%){marker}")
    
    # 6. 空カテゴリの警告
    empty_cats = VALID_CATEGORY_IDS - set(dist.keys())
    if empty_cats:
        warnings.append(f"Empty categories: {sorted(empty_cats)}")
    
    # 7. 極端な偏りの警告（1カテゴリに30%以上）
    for cat_id, count in dist.items():
        if count / len(results) > 0.3:
            warnings.append(f"Category {cat_id} has {count} words ({count/len(results)*100:.1f}%) - may be over-broad")
    
    return errors, warnings

def generate_report(results):
    """分類結果のサマリーレポートを生成する。"""
    from collections import Counter
    
    CATEGORY_NAMES = {
        0: "分類不可能",
        1: "基本動作・操作・変化動詞",
        2: "認知・思考・コミュニケーション動詞",
        3: "身体動作・生理・物理動詞",
        4: "社会的行為・対人関係動詞",
        5: "科学・医学・健康",
        6: "社会・政治・制度",
        7: "経済・ビジネス・金融",
        8: "自然・環境・地理",
        9: "学術・教育・知識",
        10: "抽象概念・哲学・精神",
        11: "日常生活・物品・文化",
        12: "技術・システム・情報",
        13: "芸術・文化・創作",
        14: "時間・空間・数量",
        15: "基本特性・状態形容詞",
        16: "感情・性格・人間性形容詞",
        17: "専門的・技術的・学術的形容詞",
        18: "評価・判断・程度形容詞",
    }
    
    dist = Counter(r['categoryId'] for r in results)
    
    print("\n=== 分類結果サマリー ===")
    print(f"総語数: {len(results)}")
    print(f"\n{'ID':>3} {'カテゴリ名':<30} {'語数':>5} {'割合':>6}  {'サンプル'}")
    print("-" * 90)
    
    results_by_cat = {}
    for r in results:
        results_by_cat.setdefault(r['categoryId'], []).append(r['word'])
    
    for cat_id in sorted(dist.keys()):
        name = CATEGORY_NAMES.get(cat_id, "???")
        count = dist[cat_id]
        pct = count / len(results) * 100
        sample = ', '.join(results_by_cat[cat_id][:5])
        print(f"{cat_id:3d} {name:<30} {count:5d} {pct:5.1f}%  {sample}")

if __name__ == '__main__':
    import sys
    
    # 元の単語リスト読み込み
    from batch_extract import load_words
    original_words = load_words()
    
    # 分類結果読み込み
    results = load_all_results()
    
    # 検証
    errors, warnings = validate(results, original_words)
    
    if errors:
        print("\n❌ ERRORS:")
        for e in errors:
            print(f"  {e}")
    
    if warnings:
        print("\n⚠️  WARNINGS:")
        for w in warnings:
            print(f"  {w}")
    
    if not errors:
        print("\n✅ Validation passed!")
        generate_report(results)
    
    sys.exit(1 if errors else 0)
```

### 2.5 最終統合スクリプト

```python
# scripts/integrate.py
# 検証済み分類結果を word-data.js に統合する

import json

def integrate(results_path, worddata_path, output_path):
    """分類結果を word-data.js の各エントリに統合する。"""
    
    # 分類結果をID→categoryId のマップに変換
    with open(results_path, 'r', encoding='utf-8') as f:
        results = json.load(f)
    cat_map = {r['id']: r['categoryId'] for r in results}
    
    # word-data.js を読み込んで categoryId を更新
    # （word-data.js が ES module の場合、JSON部分を抽出して処理する）
    
    print(f"Integrated {len(cat_map)} category assignments")
    print(f"Output: {output_path}")

if __name__ == '__main__':
    integrate('results/all_results.json', 'core/word-data.js', 'core/word-data.js')
```

---

## 3. 品質管理

### 3.1 自動チェック（merge_validate.py で実行）

- [ ] 1900語すべてに categoryId が割り当てられている
- [ ] ID が 1-1900 で連続・一意
- [ ] 単語の文字列が元リストと完全一致
- [ ] categoryId が 0-18 の範囲内
- [ ] 分類不可能（ID:0）が全体の5%以内
- [ ] 空のカテゴリがない
- [ ] 1カテゴリに30%以上が集中していない

### 3.2 人手チェック（サンプリング）

各カテゴリからランダムに10語を抽出し、分類が妥当かを確認する。

```python
# scripts/sample_check.py
import json, random

def sample_check(results, n=10):
    by_cat = {}
    for r in results:
        by_cat.setdefault(r['categoryId'], []).append(r)
    
    for cat_id in sorted(by_cat.keys()):
        sample = random.sample(by_cat[cat_id], min(n, len(by_cat[cat_id])))
        print(f"\nCategory {cat_id}:")
        for r in sample:
            print(f"  {r['id']:4d} {r['word']}")
```

### 3.3 既存分類結果（500語分）の活用

以前のクラスタリング作業で分類済みの500語がある場合、それを初期データとして読み込み、残り1400語のみをバッチ分類する。

```python
def load_existing(filepath):
    """既存の分類結果を読み込む。"""
    # フォーマットに応じて読み込み
    # → {word: categoryId} のマップを返す
    pass

def filter_unclassified(words, existing_map):
    """未分類の語だけを抽出する。"""
    return [w for w in words if w not in existing_map]
```

既存データのカテゴリ体系が現在の18カテゴリと一致するか確認し、一致しない場合は既存データも再分類対象とする。

---

## 4. 実行手順まとめ

```bash
# 1. バッチ分割
python scripts/batch_extract.py

# 2. 各バッチの分類（Claude Code が AI 分類を実行）
#    → results/ ディレクトリに batch_001_result.json 〜 batch_095_result.json

# 3. マージ・検証
python scripts/merge_validate.py

# 4. サンプリングチェック + カテゴリ分布レビュー
python scripts/sample_check.py

# 5. （必要に応じて）カテゴリ体系の再編 → 影響カテゴリのみ再分類
#    → カテゴリ定義を更新し、該当バッチのみ再実行
#    → 再度 merge_validate.py で検証

# 6. word-data.js への統合
python scripts/integrate.py
```

---

## 5. 出力形式

最終成果物は以下の2つ:

### 5.1 分類結果 JSON（中間成果物）

```json
[
  {"id": 1, "word": "create", "categoryId": 1},
  {"id": 2, "word": "increase", "categoryId": 1},
  {"id": 3, "word": "improve", "categoryId": 1},
  ...
  {"id": 1900, "word": "zealous", "categoryId": 16}
]
```

### 5.2 word-data.js への統合（最終成果物）

word-data.js の各エントリの `categoryId` フィールドが更新される。
