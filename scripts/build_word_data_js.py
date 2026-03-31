"""
word-data.js ビルドスクリプト
word_data_fixed.json（または word_data_raw.json）を
core/word-data.js の完全フォーマットに変換する。

使用方法:
  python3 scripts/build_word_data_js.py [input_file]

デフォルト入力: scripts/results/word_data_fixed.json
出力: core/word-data.js（上書き）
"""

import json, os, sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT  = os.path.dirname(SCRIPT_DIR)
OUT_JS     = os.path.join(REPO_ROOT, "core", "word-data.js")

CATEGORIES_DEF = [
    {"id": 0,  "name": "分類不可能",                     "pos": "other"},
    {"id": 1,  "name": "基本動作・操作・変化動詞",           "pos": "verb"},
    {"id": 2,  "name": "認知・思考・コミュニケーション動詞",    "pos": "verb"},
    {"id": 3,  "name": "身体動作・生理・物理動詞",            "pos": "verb"},
    {"id": 4,  "name": "社会的行為・対人関係動詞",            "pos": "verb"},
    {"id": 5,  "name": "科学・医学・健康",                  "pos": "noun"},
    {"id": 6,  "name": "社会・政治・制度",                  "pos": "noun"},
    {"id": 7,  "name": "経済・ビジネス・金融",               "pos": "noun"},
    {"id": 8,  "name": "自然・環境・地理",                  "pos": "noun"},
    {"id": 9,  "name": "学術・教育・知識",                  "pos": "noun"},
    {"id": 10, "name": "抽象概念・哲学・精神",               "pos": "noun"},
    {"id": 11, "name": "日常生活・物品・文化",               "pos": "noun"},
    {"id": 12, "name": "技術・システム・情報",               "pos": "noun"},
    {"id": 13, "name": "芸術・文化・創作",                  "pos": "noun"},
    {"id": 14, "name": "時間・空間・数量",                  "pos": "noun"},
    {"id": 15, "name": "基本特性・状態形容詞",               "pos": "adjective"},
    {"id": 16, "name": "感情・性格・人間性形容詞",            "pos": "adjective"},
    {"id": 17, "name": "専門的・技術的・学術的形容詞",         "pos": "adjective"},
    {"id": 18, "name": "評価・判断・程度形容詞",              "pos": "adjective"},
]


def entry_to_js(entry: dict, indent: int = 2) -> str:
    """単語エントリを整形されたJSオブジェクト文字列に変換する"""
    pad  = " " * indent
    pad2 = " " * (indent + 2)
    pad3 = " " * (indent + 4)
    pad4 = " " * (indent + 6)

    lines = ["{"]

    # 基本情報
    lines.append(f'{pad2}id: {entry["id"]},')
    lines.append(f'{pad2}word: {json.dumps(entry["word"], ensure_ascii=False)},')
    lines.append(f'{pad2}pos: {json.dumps(entry.get("pos", "other"), ensure_ascii=False)},')
    lines.append(f'{pad2}categoryId: {entry.get("categoryId", 0)},')

    # meanings
    meanings = entry.get("meanings") or []
    lines.append(f'{pad2}meanings: [')
    for m in meanings:
        lines.append(f'{pad3}{{ meaning: {json.dumps(m.get("meaning",""), ensure_ascii=False)}, pos: {json.dumps(m.get("pos",""), ensure_ascii=False)} }},')
    lines.append(f'{pad2}],')

    # 発音
    lines.append(f'{pad2}pronunciation: {json.dumps(entry.get("pronunciation", ""), ensure_ascii=False)},')
    lines.append(f'{pad2}syllables: {json.dumps(entry.get("syllables", ""), ensure_ascii=False)},')
    lines.append(f'{pad2}audioHint: {json.dumps(entry.get("audioHint", ""), ensure_ascii=False)},')

    # examples
    examples = entry.get("examples") or []
    lines.append(f'{pad2}examples: [')
    for ex in examples:
        lines.append(f'{pad3}{{')
        lines.append(f'{pad4}en: {json.dumps(ex.get("en",""), ensure_ascii=False)},')
        lines.append(f'{pad4}ja: {json.dumps(ex.get("ja",""), ensure_ascii=False)},')
        lines.append(f'{pad4}blank: {json.dumps(ex.get("blank",""), ensure_ascii=False)},')
        lines.append(f'{pad4}blankAnswer: {json.dumps(ex.get("blankAnswer",""), ensure_ascii=False)},')
        lines.append(f'{pad3}}},')
    lines.append(f'{pad2}],')

    # distractors
    dist = entry.get("distractors") or []
    dist_str = ", ".join(json.dumps(d, ensure_ascii=False) for d in dist)
    lines.append(f'{pad2}distractors: [{dist_str}],')

    # confusableSpellings
    conf = entry.get("confusableSpellings") or []
    conf_str = ", ".join(json.dumps(c, ensure_ascii=False) for c in conf)
    lines.append(f'{pad2}confusableSpellings: [{conf_str}],')

    # passive
    passive = entry.get("passive") or {}
    lines.append(f'{pad2}passive: {{')
    lines.append(f'{pad3}etymology: {json.dumps(passive.get("etymology",""), ensure_ascii=False)},')
    lines.append(f'{pad3}tips: {json.dumps(passive.get("tips",""), ensure_ascii=False)},')
    lines.append(f'{pad3}confusables: {json.dumps(passive.get("confusables",""), ensure_ascii=False)},')
    collocations = passive.get("collocations") or []
    coll_str = ", ".join(json.dumps(c, ensure_ascii=False) for c in collocations)
    lines.append(f'{pad3}collocations: [{coll_str}],')
    lines.append(f'{pad3}trivia: {json.dumps(passive.get("trivia",""), ensure_ascii=False)},')
    lines.append(f'{pad2}}},')

    # メタデータ
    freq = entry.get("frequency")
    lines.append(f'{pad2}frequency: {freq if isinstance(freq, int) else "null"},')
    cefr = entry.get("cefr") or ""
    lines.append(f'{pad2}cefr: {json.dumps(cefr, ensure_ascii=False)},')

    lines.append(f"{pad}}}")
    return "\n".join(lines)


def build_categories_js() -> str:
    lines = ["export const CATEGORIES = ["]
    for cat in CATEGORIES_DEF:
        lines.append(
            f'  {{ id: {cat["id"]}, name: {json.dumps(cat["name"], ensure_ascii=False)}, pos: {json.dumps(cat["pos"])} }},'
        )
    lines.append("];")
    return "\n".join(lines)


def main():
    input_file = sys.argv[1] if len(sys.argv) > 1 else \
        os.path.join(SCRIPT_DIR, "results", "word_data_fixed.json")

    if not os.path.exists(input_file):
        fallback = os.path.join(SCRIPT_DIR, "results", "word_data_raw.json")
        if os.path.exists(fallback):
            print(f"Note: fixed file not found, using {fallback}")
            input_file = fallback
        else:
            print(f"ERROR: {input_file} not found")
            sys.exit(1)

    with open(input_file, encoding="utf-8") as f:
        data = json.load(f)

    data.sort(key=lambda x: x.get("id", 0))
    print(f"Building word-data.js from {len(data)} entries...")

    # JS ファイル組み立て
    header = """// core/word-data.js — 単語データ（Phase 2: AI一括生成）
// 生成: scripts/generate_word_data.py + fix_distractors.py + build_word_data_js.py
// バリデーション: scripts/validate_word_data.py（word-data-spec.md §8 準拠）

"""

    categories_section = build_categories_js()

    entries_js = []
    for entry in data:
        entries_js.append("  " + entry_to_js(entry, indent=2).replace("\n", "\n  "))

    word_data_section = "export const WORD_DATA = [\n" + ",\n".join(entries_js) + "\n];"

    full_content = header + categories_section + "\n\n" + word_data_section + "\n"

    with open(OUT_JS, "w", encoding="utf-8") as f:
        f.write(full_content)

    file_size_kb = os.path.getsize(OUT_JS) / 1024
    print(f"\n=== build_word_data_js complete ===")
    print(f"  Words:     {len(data)}")
    print(f"  Output:    {OUT_JS}")
    print(f"  File size: {file_size_kb:.1f} KB")


if __name__ == "__main__":
    main()
