"""
カテゴリ別単語一覧レポートを生成する。
出力: scripts/category_report.md
"""
import json, os
from collections import defaultdict

CATEGORY_NAMES = {
    0:"分類不可能",
    1:"基本動作・操作・変化動詞",
    2:"認知・思考・コミュニケーション動詞",
    3:"身体動作・生理・物理動詞",
    4:"社会的行為・対人関係動詞",
    5:"科学・医学・健康",
    6:"社会・政治・制度",
    7:"経済・ビジネス・金融",
    8:"自然・環境・地理",
    9:"学術・教育・知識",
    10:"抽象概念・哲学・精神",
    11:"日常生活・物品・文化",
    12:"技術・システム・情報",
    13:"芸術・文化・創作",
    14:"時間・空間・数量",
    15:"基本特性・状態形容詞",
    16:"感情・性格・人間性形容詞",
    17:"専門的・技術的・学術的形容詞",
    18:"評価・判断・程度形容詞",
}

def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    with open('results/all_results.json', encoding='utf-8') as f:
        results = json.load(f)

    by_cat = defaultdict(list)
    for r in results:
        by_cat[r['categoryId']].append((r['id'], r['word']))

    lines = []
    lines.append("# VocabFlow 1900語 カテゴリ別一覧\n")

    # サマリーテーブル
    lines.append("## サマリー\n")
    lines.append("| ID | カテゴリ名 | 語数 | 割合 |")
    lines.append("|---|---|---:|---:|")
    for cat_id in range(0, 19):
        count = len(by_cat[cat_id])
        pct = count / 1900 * 100
        lines.append(f"| {cat_id} | {CATEGORY_NAMES[cat_id]} | {count} | {pct:.1f}% |")
    lines.append(f"| — | **合計** | **1900** | **100%** |")
    lines.append("")

    # カテゴリ別詳細
    lines.append("---\n")
    lines.append("## カテゴリ別詳細\n")

    for cat_id in range(0, 19):
        words = by_cat[cat_id]
        count = len(words)
        pct = count / 1900 * 100
        lines.append(f"### Cat {cat_id}: {CATEGORY_NAMES[cat_id]}（{count}語 / {pct:.1f}%）\n")

        # Wave別にグルーピング（50語=1Wave）
        wave_groups = defaultdict(list)
        for word_id, word in words:
            wave = (word_id - 1) // 50 + 1
            wave_groups[wave].append((word_id, word))

        for wave in sorted(wave_groups.keys()):
            wave_words = wave_groups[wave]
            word_list = "  ".join(f"`{w}`" for _, w in wave_words)
            lines.append(f"**Wave {wave}** ({len(wave_words)}語): {word_list}\n")

        lines.append("")

    output_path = 'category_report.md'
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

    print(f"✅ Report generated: {output_path}")
    print(f"   合計 {len(results)} 語 / {len(CATEGORY_NAMES)} カテゴリ")

if __name__ == '__main__':
    main()
