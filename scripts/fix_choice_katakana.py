#!/usr/bin/env python3
"""
Recognition 四択の文字列からカタカナ併記を機械的に落とす（2026-10-06）

  誤答:     「長所、メリット」→「長所」（distractors を直接書き換える）
  正解:     meanings[0] が「機会、チャンス」なら choiceLabel=「機会」を付ける
            （meanings 自体は Intro 等で表示するので残す）

カタカナ部分を落とすと何も残らない文字列（「ウイルス」「クリックする」）は
書き換えずに一覧で報告する（差し替えは人手）。

使用方法:
  python3 scripts/fix_choice_katakana.py            # dry-run（差分表示のみ）
  python3 scripts/fix_choice_katakana.py --apply
"""
import json, os, re, sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PATH = os.path.join(SCRIPT_DIR, "results", "word_data_final.json")
KATA = re.compile(r'[ァ-ヺー]{3,}')
DELIMS = set('、,，・;；/／')
OPEN, CLOSE = '（(', '）)'


def tokenize(s):
    """トップレベル（括弧の外）の区切りで [(区切り, 本体), ...] に分ける"""
    out, buf, depth, sep = [], '', 0, ''
    for ch in s:
        if ch in OPEN:
            depth += 1
        elif ch in CLOSE:
            depth = max(0, depth - 1)
        if depth == 0 and ch in DELIMS:
            out.append((sep, buf)); buf, sep = '', ch
        else:
            buf += ch
    out.append((sep, buf))
    return out


def strip_katakana(s):
    """カタカナ併記を落とした文字列。何も残らなければ None"""
    # 括弧補足の中もカタカナ部分だけ落とす（「（ニーズ・要望に）」→「（要望に）」）。
    # 中身が全部カタカナなら括弧ごと外す
    def _paren(m):
        inner = strip_katakana(m.group()[1:-1])
        return '' if inner is None else m.group()[0] + inner + m.group()[-1]
    s2 = re.sub(r'[（(][^（(）)]*[）)]', _paren, s)
    kept = [(sep, t.strip()) for sep, t in tokenize(s2) if t.strip() and not KATA.search(t)]
    if not kept:
        return None
    return kept[0][1] + ''.join(sep + t for sep, t in kept[1:])


def main():
    apply = '--apply' in sys.argv
    data = json.load(open(PATH, encoding='utf-8'))
    changed, manual = [], []
    for w in data:
        correct = w.get('choiceLabel') or w['meanings'][0]['meaning']
        if KATA.search(correct):
            new = strip_katakana(correct)
            if new is None:
                manual.append((w['id'], w['word'], 'correct', correct))
            else:
                changed.append((w['id'], w['word'], 'correct', correct, new))
                w['choiceLabel'] = new
        for i, d in enumerate(w.get('distractors') or []):
            if KATA.search(d):
                new = strip_katakana(d)
                if new is None:
                    manual.append((w['id'], w['word'], 'distractor', d))
                else:
                    changed.append((w['id'], w['word'], 'distractor', d, new))
                    w['distractors'][i] = new
    for c in changed:
        print(f"#{c[0]:4d} {c[1]:<15s} {c[2]:<10s} {c[3]}  →  {c[4]}")
    print(f"\n要手作業（カタカナ主体）: {len(manual)}件")
    for m in manual:
        print(f"#{m[0]:4d} {m[1]:<15s} {m[2]:<10s} {m[3]}")
    print(f"\n機械修正: {len(changed)}件 / 要手作業: {len(manual)}件")
    if apply:
        json.dump(data, open(PATH, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
        print('→ 書き込みました')


if __name__ == '__main__':
    main()
