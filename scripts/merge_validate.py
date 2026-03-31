import json, os, sys
from collections import Counter

VALID_CATEGORY_IDS = set(range(0, 19))

CATEGORY_NAMES = {
    0:"分類不可能",1:"基本動作・操作・変化動詞",2:"認知・思考・コミュニケーション動詞",
    3:"身体動作・生理・物理動詞",4:"社会的行為・対人関係動詞",5:"科学・医学・健康",
    6:"社会・政治・制度",7:"経済・ビジネス・金融",8:"自然・環境・地理",
    9:"学術・教育・知識",10:"抽象概念・哲学・精神",11:"日常生活・物品・文化",
    12:"技術・システム・情報",13:"芸術・文化・創作",14:"時間・空間・数量",
    15:"基本特性・状態形容詞",16:"感情・性格・人間性形容詞",17:"専門的・技術的・学術的形容詞",
    18:"評価・判断・程度形容詞",
}

def load_words(filepath='../1900_words_list.md'):
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    return [l.strip() for l in lines if l.strip() and not l.startswith('#')]

def validate(results, original_words):
    errors, warnings = [], []
    if len(results) != len(original_words):
        errors.append(f"Count mismatch: expected {len(original_words)}, got {len(results)}")
    ids = [r['id'] for r in results]
    expected_ids = list(range(1, len(original_words) + 1))
    missing = set(expected_ids) - set(ids)
    dupes = [i for i in ids if ids.count(i) > 1]
    if missing: errors.append(f"Missing IDs: {sorted(missing)[:20]}")
    if dupes:   errors.append(f"Duplicate IDs: {sorted(set(dupes))[:20]}")
    results_sorted = sorted(results, key=lambda r: r['id'])
    for r, expected in zip(results_sorted, original_words):
        if r['word'] != expected:
            errors.append(f"ID {r['id']}: '{r['word']}' != '{expected}'")
    for r in results:
        if r['categoryId'] not in VALID_CATEGORY_IDS:
            errors.append(f"ID {r['id']} ({r['word']}): invalid categoryId {r['categoryId']}")
    dist = Counter(r['categoryId'] for r in results)
    for cat_id in sorted(VALID_CATEGORY_IDS - set(dist.keys())):
        warnings.append(f"Empty category: {cat_id}")
    for cat_id, count in dist.items():
        if cat_id == 0 and count / len(results) > 0.05:
            warnings.append(f"Category 0 has {count} ({count/len(results)*100:.1f}%) > 5%")
        if count / len(results) > 0.30:
            warnings.append(f"Category {cat_id} has {count} ({count/len(results)*100:.1f}%) > 30%")
    return errors, warnings

def report(results):
    dist = Counter(r['categoryId'] for r in results)
    by_cat = {}
    for r in results:
        by_cat.setdefault(r['categoryId'], []).append(r['word'])
    print(f"\n{'ID':>3} {'カテゴリ名':<34} {'語数':>5} {'割合':>6}  サンプル")
    print("-"*95)
    for cat_id in sorted(dist.keys()):
        count = dist[cat_id]
        pct = count / len(results) * 100
        sample = ', '.join(by_cat[cat_id][:4])
        flag = " ⚠️" if (cat_id == 0 and pct > 5) or pct > 30 else ""
        print(f"{cat_id:3d} {CATEGORY_NAMES[cat_id]:<34} {count:5d} {pct:5.1f}%  {sample}{flag}")
    print(f"\n総語数: {len(results)}")

if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    words = load_words()
    with open('results/all_results.json', encoding='utf-8') as f:
        results = json.load(f)
    errors, warnings = validate(results, words)
    if errors:
        print("❌ ERRORS:"); [print(f"  {e}") for e in errors]
    if warnings:
        print("⚠️  WARNINGS:"); [print(f"  {w}") for w in warnings]
    if not errors:
        print("✅ Validation passed!")
        report(results)
    sys.exit(1 if errors else 0)
