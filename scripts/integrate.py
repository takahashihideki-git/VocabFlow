"""
分類結果を word-data.js の categoryId フィールドに統合する。
各行の categoryId: <数値> を置換する。
"""
import json, re, os, sys

def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    with open('results/all_results.json', encoding='utf-8') as f:
        results = json.load(f)

    # id -> categoryId マップ
    cat_map = {r['id']: r['categoryId'] for r in results}

    worddata_path = '../core/word-data.js'
    with open(worddata_path, encoding='utf-8') as f:
        content = f.read()

    # 各エントリは: { id: N, word: "...", pos: "...", categoryId: M },
    # 正規表現で id と categoryId を同時に捉えて置換
    pattern = re.compile(
        r'(\{\s*id:\s*(\d+),\s*word:\s*"[^"]*",\s*pos:\s*"[^"]*",\s*categoryId:\s*)\d+'
    )

    replaced = 0
    def replace_fn(m):
        nonlocal replaced
        word_id = int(m.group(2))
        if word_id in cat_map:
            replaced += 1
            return m.group(1) + str(cat_map[word_id])
        return m.group(0)

    new_content = pattern.sub(replace_fn, content)

    if replaced != 1900:
        print(f"⚠️  Replaced {replaced} entries (expected 1900)")
        sys.exit(1)

    with open(worddata_path, 'w', encoding='utf-8') as f:
        f.write(new_content)

    print(f"✅ Updated {replaced} categoryId values in {worddata_path}")

if __name__ == '__main__':
    main()
