"""
Phase 1: API検証スクリプト
word_data_phase3.json を読み込み、50語ずつバッチで Claude Sonnet API に投入して
passive フィールド（tips/confusables/trivia/etymology）の論理的矛盾・事実誤認を検出する。

使用方法:
  export ANTHROPIC_API_KEY=sk-ant-...
  python3 scripts/phase1_verify.py

オプション:
  --start N   N番目のバッチから開始（途中再開用）
  --end N     N番目のバッチで終了
  --batch N   バッチサイズ（デフォルト: 50）

出力: scripts/results/verification_results.json
"""

import json
import os
import sys
import time
import argparse

SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
RESULTS_DIR = os.path.join(SCRIPT_DIR, "results")
INPUT_FILE  = os.path.join(RESULTS_DIR, "word_data_phase3.json")
OUTPUT_FILE = os.path.join(RESULTS_DIR, "verification_results.json")

SYSTEM_PROMPT = """\
あなたは英語教育コンテンツの品質検査官です。日本人向け英単語学習アプリのデータを検査します。
各単語について、tips/confusables/trivia/etymologyの4フィールドを検査してください。

検出すべき問題：
1. 論理的矛盾（「Xは誤り」と言いつつ直後にXを使う例を出す等）
2. 事実誤認（語源の誤り、歴史的事実の間違い等）
3. 説明の自己矛盾（前半と後半で矛盾する主張）
4. 虚偽・空振り記述（「〜と関係がある…実は無関係」のような無意味な記述）
5. 誤解を招く不完全な説明
6. 混同パターンの論理破綻（対比自体が間違っている等）

問題がない単語はスキップし、問題がある単語だけ報告してください。

出力はJSON配列のみ（他のテキスト一切なし）：
[{"id": 数値, "word": "語", "field": "tips|confusables|trivia|etymology", "issue": "問題の簡潔な説明", "severity": "error|warning"}]

問題がなければ空配列 [] を返してください。\
"""


def make_batch_prompt(entries: list[dict]) -> str:
    items = []
    for e in entries:
        p = e.get("passive", {})
        items.append(json.dumps({
            "id":          e["id"],
            "word":        e["word"],
            "pos":         e.get("pos", ""),
            "meanings":    "; ".join(m.get("meaning", "") for m in e.get("meanings", [])),
            "tips":        p.get("tips", ""),
            "confusables": p.get("confusables", ""),
            "trivia":      p.get("trivia", ""),
            "etymology":   p.get("etymology", ""),
        }, ensure_ascii=False))
    return "\n".join(items)


def call_api_with_retry(client, prompt: str, max_retries: int = 3) -> list[dict]:
    for attempt in range(max_retries):
        try:
            response = client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=4096,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": prompt}],
            )
            text = response.content[0].text.strip()
            return json.loads(text)
        except json.JSONDecodeError as e:
            print(f"  [WARN] JSON parse error (attempt {attempt+1}): {e}")
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)
        except Exception as e:
            print(f"  [WARN] API error (attempt {attempt+1}): {e}")
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)
    return []


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--start",  type=int, default=0,  help="開始バッチインデックス（0始まり）")
    parser.add_argument("--end",    type=int, default=-1, help="終了バッチインデックス（-1=全件）")
    parser.add_argument("--batch",  type=int, default=50, help="バッチサイズ")
    args = parser.parse_args()

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY environment variable not set")
        print("  export ANTHROPIC_API_KEY=sk-ant-...")
        sys.exit(1)

    try:
        import anthropic
    except ImportError:
        print("ERROR: anthropic パッケージが未インストールです")
        print("  pip install anthropic")
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)

    with open(INPUT_FILE, encoding="utf-8") as f:
        data = json.load(f)
    data.sort(key=lambda x: x.get("id", 0))

    # バッチ分割
    batches = [data[i:i+args.batch] for i in range(0, len(data), args.batch)]
    total_batches = len(batches)
    end_idx = args.end if args.end >= 0 else total_batches

    print(f"=== Phase 1: API検証 ===")
    print(f"  対象: {len(data)} 語 / バッチサイズ: {args.batch}")
    print(f"  実行範囲: batch {args.start}〜{end_idx-1} / 全 {total_batches} バッチ")

    # 既存結果を読み込んで追記モードに
    all_results: list[dict] = []
    if os.path.exists(OUTPUT_FILE) and args.start > 0:
        with open(OUTPUT_FILE, encoding="utf-8") as f:
            all_results = json.load(f)
        print(f"  既存結果 {len(all_results)} 件をロード（追記モード）")

    for batch_idx in range(args.start, min(end_idx, total_batches)):
        batch = batches[batch_idx]
        id_range = f"{batch[0]['id']}〜{batch[-1]['id']}"
        print(f"  Batch {batch_idx+1}/{total_batches} (id {id_range}) ...", end=" ", flush=True)

        prompt  = make_batch_prompt(batch)
        results = call_api_with_retry(client, prompt)

        if results:
            print(f"{len(results)} 件の問題検出")
            for r in results:
                print(f"    [id={r.get('id')} {r.get('word')}] {r.get('field')}: {r.get('issue')} [{r.get('severity')}]")
            all_results.extend(results)
        else:
            print("問題なし")

        # 途中経過を保存
        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
            json.dump(all_results, f, ensure_ascii=False, indent=2)

        # レート制限対策
        if batch_idx < end_idx - 1:
            time.sleep(1)

    print(f"\n=== Phase 1 完了 ===")
    print(f"  検出された問題: {len(all_results)} 件")
    print(f"  出力: {OUTPUT_FILE}")

    # サマリー
    errors   = [r for r in all_results if r.get("severity") == "error"]
    warnings = [r for r in all_results if r.get("severity") == "warning"]
    print(f"  error: {len(errors)} 件 / warning: {len(warnings)} 件")

    if errors:
        print("\n  [error 一覧]")
        for r in errors:
            print(f"    id={r['id']} '{r['word']}' ({r['field']}): {r['issue']}")


if __name__ == "__main__":
    main()
