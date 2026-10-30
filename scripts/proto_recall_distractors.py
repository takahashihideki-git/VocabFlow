#!/usr/bin/env python3
"""
Recall 誤答生成のプロトタイプ（distractor-generation-notes.md の方針の検証用）

各対象語について、同品詞の全語を候補にし、次の2つを並べて出す:
  - sim   : 正解語との単語埋め込みのコサイン類似（もっともらしさの目安）
  - fit   : 候補を正解と同じ活用形にして例文の空欄に入れたときの当てはまり度
            （正解語の値との差 Δfit。0 に近い／正なら「正解として通る」疑い）
            --scorer mlm   : BERT で空欄だけを予測（複数トークン語は左から順に埋める）
            --scorer causal: GPT-2 で文全体の対数確率（既定）。fitN は語そのものの
                             出にくさ（log p(語)）を差し引いた値＝頻度補正
  - ant   : WordNet の反義語（直接＋類義 synset 経由）。反義語は1文の例文では空欄に入るので除外対象

データは書き換えない。レポートを scripts/results/proto_recall_distractors.json に出す。

使い方:
  .venv-dg/bin/python scripts/proto_recall_distractors.py --words install,vital,error
  .venv-dg/bin/python scripts/proto_recall_distractors.py --words install --scorer mlm --model bert-base-uncased
  .venv-dg/bin/python scripts/proto_recall_distractors.py --sample 30 --seed 1 --sim-top 100 \
      --out scripts/results/proto_recall_sample30.json   # 無作為抽出・候補を類似上位に限定
  .venv-dg/bin/python scripts/proto_recall_distractors.py --all --sim-top 100 --quiet \
      --out scripts/results/recall_scores.jsonl   # 全語。.jsonl は1語ずつ追記し、再実行で続きから
"""

import argparse
import json
import random
import subprocess
from pathlib import Path

import numpy as np
import torch
from lemminflect import getAllInflections, getAllInflectionsOOV, getInflection
from nltk.corpus import wordnet as wn
from transformers import AutoModelForCausalLM, AutoModelForMaskedLM, AutoTokenizer

ROOT = Path(__file__).resolve().parent.parent
OUT_DEFAULT = ROOT / 'scripts' / 'results' / 'proto_recall_distractors.json'

UPOS = {'verb': 'VERB', 'noun': 'NOUN', 'adjective': 'ADJ', 'adverb': 'ADV'}
BASE_TAG = {'verb': 'VB', 'noun': 'NN', 'adjective': 'JJ', 'adverb': 'RB'}
WN_POS = {'verb': wn.VERB, 'noun': wn.NOUN, 'adjective': wn.ADJ, 'adverb': wn.ADV}


def load_words():
    """core/word-data.js から必要なフィールドだけ取り出す（データの正は JS 側）"""
    js = """
    import { WORD_DATA } from './core/word-data.js';
    console.log(JSON.stringify(WORD_DATA.map(w => ({
      id: w.id, word: w.word, pos: w.pos, categoryId: w.categoryId,
      blank: w.examples?.[0]?.blank, blankAnswer: w.examples?.[0]?.blankAnswer,
    }))));
    """
    out = subprocess.run(['node', '--input-type=module', '-e', js],
                         cwd=ROOT, capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


# -------------------------------------------------------
# 活用: 空欄の正解（blankAnswer）が原形から見てどの活用形かを求め、候補を同じ形にする
# -------------------------------------------------------
def inflection_tag(lemma, pos, surface):
    """surface が lemma のどの活用タグか。原形なら BASE_TAG、見つからなければ None"""
    s = surface.lower()
    if s == lemma.lower():
        return BASE_TAG.get(pos)
    upos = UPOS.get(pos)
    if not upos:
        return None
    infl = getAllInflections(lemma, upos=upos) or getAllInflectionsOOV(lemma, upos=upos)
    for tag, forms in infl.items():
        if s in (f.lower() for f in forms):
            return tag
    return None


def inflect(lemma, tag):
    if tag is None or tag in BASE_TAG.values():
        return lemma
    forms = getInflection(lemma, tag=tag)
    return forms[0] if forms else lemma


def wordnet_synonyms(lemma, pos):
    p = WN_POS.get(pos)
    names = set()
    for syn in wn.synsets(lemma, pos=p):
        for l in syn.lemmas():
            names.add(l.name().lower().replace('_', ' '))
    names.discard(lemma.lower())
    return names


def wordnet_antonyms(lemma, pos):
    """直接の反義語＋類義 synset（similar_tos）の反義語とその類義。eager→reluctant は後者で拾う"""
    p = WN_POS.get(pos)
    names = set()
    for syn in wn.synsets(lemma, pos=p):
        for s2 in [syn] + syn.similar_tos():
            for l in s2.lemmas():
                for a in l.antonyms():
                    names.add(a.name())
                    for s3 in a.synset().similar_tos():
                        names.update(x.name() for x in s3.lemmas())
    return {n.lower().replace('_', ' ') for n in names}


# -------------------------------------------------------
# BERT の当てはまり度
# -------------------------------------------------------
class FitScorer:
    """空欄に語を入れたときの対数確率（複数トークン語は左から順に埋める PLL）"""

    def __init__(self, model_name):
        self.tok = AutoTokenizer.from_pretrained(model_name)
        self.model = AutoModelForMaskedLM.from_pretrained(model_name).eval()
        self.mask = self.tok.mask_token

    @torch.no_grad()
    def _logprobs(self, texts):
        enc = self.tok(texts, return_tensors='pt', padding=True)
        logits = self.model(**enc).logits
        return enc, torch.log_softmax(logits, dim=-1)

    def score(self, blank_sentence, fillers, batch=64):
        """各 filler（活用済みの語）について sum log p(トークン列 | 文脈)"""
        pieces = {f: self.tok.tokenize(' ' + f) for f in fillers}
        # 1本の要求 = (filler, j): j 番目のトークンを予測。j より前は埋め、j 以降はマスク
        reqs = []
        for f, toks in pieces.items():
            for j in range(len(toks)):
                filled = self.tok.convert_tokens_to_string(toks[:j]).strip()
                masks = ' '.join([self.mask] * (len(toks) - j))
                text = blank_sentence.replace('___', (filled + ' ' + masks).strip(), 1)
                reqs.append((f, j, text, toks[j]))
        total = {f: 0.0 for f in fillers}
        for i in range(0, len(reqs), batch):
            chunk = reqs[i:i + batch]
            enc, lp = self._logprobs([r[2] for r in chunk])
            for k, (f, j, _, tok) in enumerate(chunk):
                pos = (enc['input_ids'][k] == self.tok.mask_token_id).nonzero()[0].item()
                total[f] += lp[k, pos, self.tok.convert_tokens_to_ids(tok)].item()
        return total, {f: len(t) for f, t in pieces.items()}


class CausalScorer:
    """空欄に語を入れた文全体の対数確率（GPT-2 系）。空欄より右の文脈も確率に入る"""

    def __init__(self, model_name):
        self.tok = AutoTokenizer.from_pretrained(model_name)
        self.model = AutoModelForCausalLM.from_pretrained(model_name).eval()
        self.bos = self.tok.bos_token_id

    @torch.no_grad()
    def _seq_logprob(self, texts, batch=64):
        out = []
        for i in range(0, len(texts), batch):
            ids = [[self.bos] + self.tok.encode(t) for t in texts[i:i + batch]]
            n = max(map(len, ids))
            x = torch.tensor([r + [self.bos] * (n - len(r)) for r in ids])
            lp = torch.log_softmax(self.model(x).logits[:, :-1], dim=-1)
            tgt = lp.gather(2, x[:, 1:, None])[..., 0]
            out += [tgt[k, :len(r) - 1].sum().item() for k, r in enumerate(ids)]
        return out

    def score(self, blank_sentence, fillers):
        """(文全体の log p, 語そのものの log p) を返す。前者−後者が頻度補正した当てはまり度"""
        sent = self._seq_logprob([blank_sentence.replace('___', f, 1) for f in fillers])
        word = self._seq_logprob([' ' + f for f in fillers])
        return dict(zip(fillers, sent)), dict(zip(fillers, word))


def load_embeddings(name):
    import gensim.downloader as api
    return api.load(name)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--words', default='', help='対象語（カンマ区切り）')
    ap.add_argument('--sample', type=int, default=0, help='対象語を無作為に N 語選ぶ（--words の代わり）')
    ap.add_argument('--all', action='store_true', help='採点できる全語（--words の代わり）')
    ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--sim-top', type=int, default=0, help='候補を埋め込み類似の上位 K 語に限定（0=同品詞の全語）')
    ap.add_argument('--out', default=str(OUT_DEFAULT))
    ap.add_argument('--quiet', action='store_true', help='語ごとの一覧を出さない')
    ap.add_argument('--scorer', choices=['causal', 'mlm'], default='causal')
    ap.add_argument('--model', default=None, help='既定: causal=gpt2-medium / mlm=bert-base-uncased')
    ap.add_argument('--emb', default='glove-wiki-gigaword-300')
    ap.add_argument('--show', type=int, default=15, help='一覧に出す件数')
    ap.add_argument('--watch', default='', help='順位を必ず表示する候補（例: delete）')
    args = ap.parse_args()

    words = load_words()
    by_word = {w['word'].lower(): w for w in words}
    args.model = args.model or ('gpt2-medium' if args.scorer == 'causal' else 'bert-base-uncased')
    scorer = CausalScorer(args.model) if args.scorer == 'causal' else FitScorer(args.model)
    emb = load_embeddings(args.emb)
    watch = [w.strip().lower() for w in args.watch.split(',') if w.strip()]

    pool = [w for w in words if w['pos'] in UPOS and w['blank'] and '___' in w['blank']
            and w['word'].lower() in emb]
    if args.all:
        targets = pool
    elif args.sample:
        targets = random.Random(args.seed).sample(pool, args.sample)
    else:
        targets = [by_word[w.strip().lower()] for w in args.words.split(',') if w.strip()]

    # .jsonl なら1語ずつ追記し、すでに書き出した語は飛ばす（中断しても続きから再開できる）
    out = Path(args.out)
    stream = out.suffix == '.jsonl'
    if stream:
        done = set()
        if out.exists():
            # 書き込み途中で落ちた最終行（改行で終わっていない）は切り落として採点し直す
            raw = out.read_bytes()
            if raw and not raw.endswith(b'\n'):
                out.write_bytes(raw[:raw.rfind(b'\n') + 1])
            for line in out.read_text(encoding='utf-8').splitlines():
                done.add(json.loads(line)['id'])
        if done:
            print(f'再開: 済み {len(done)}語 / 対象 {len(targets)}語', flush=True)
        targets = [t for t in targets if t['id'] not in done]
        sink = out.open('a', encoding='utf-8')

    report = []
    for n, t in enumerate(targets, 1):
        tag = inflection_tag(t['word'], t['pos'], t['blankAnswer'])
        cands = [w for w in words if w['pos'] == t['pos'] and w['id'] != t['id']]
        if args.sim_top:
            tw = t['word'].lower()
            cands = sorted([c for c in cands if c['word'].lower() in emb],
                           key=lambda c: -emb.similarity(tw, c['word'].lower()))[:args.sim_top]
        forms = {c['word']: inflect(c['word'], tag) for c in cands}
        target_form = t['blankAnswer']

        fillers = list(set(forms.values()) | {target_form})
        if args.scorer == 'causal':
            fit, wordlp = scorer.score(t['blank'], fillers)
            ntok = {f: len(scorer.tok.tokenize(' ' + f)) for f in fillers}
        else:
            fit, ntok = scorer.score(t['blank'], fillers)
            wordlp = {f: 0.0 for f in fillers}
        fitn = {f: fit[f] - wordlp[f] for f in fillers}
        target_fit, target_fitn = fit[target_form], fitn[target_form]
        syns = wordnet_synonyms(t['word'], t['pos'])
        ants = wordnet_antonyms(t['word'], t['pos'])

        rows = []
        for c in cands:
            w = c['word']
            f = forms[w]
            sim = float(emb.similarity(t['word'].lower(), w.lower())) \
                if t['word'].lower() in emb and w.lower() in emb else None
            rows.append({
                'word': w, 'form': f, 'tokens': ntok[f],
                'fit': round(fit[f], 3), 'dfit': round(fit[f] - target_fit, 3),
                'dfitN': round(fitn[f] - target_fitn, 3),
                'sim': None if sim is None else round(sim, 3),
                'wnSyn': w.lower() in syns, 'wnAnt': w.lower() in ants, 'sameCat': c['categoryId'] == t['categoryId'],
            })
        rows.sort(key=lambda r: -r['fit'])
        for i, r in enumerate(rows, 1):
            r['fitRank'] = i
        for i, r in enumerate(sorted(rows, key=lambda r: -r['dfitN']), 1):
            r['fitNRank'] = i
        by_sim = sorted([r for r in rows if r['sim'] is not None], key=lambda r: -r['sim'])
        for i, r in enumerate(by_sim, 1):
            r['simRank'] = i

        if args.quiet:
            print(f"[{n}/{len(targets)}] {t['word']} ({t['pos']}) 候補{len(rows)}語", flush=True)
        entry = {'id': t['id'], 'target': t['word'], 'pos': t['pos'], 'tag': tag, 'blank': t['blank'],
                 'wnAntonyms': sorted(ants),
                 'blankAnswer': target_form, 'targetFit': round(target_fit, 3),
                 'candidates': rows}
        if stream:
            sink.write(json.dumps(entry, ensure_ascii=False) + '\n')
            sink.flush()
        else:
            report.append(entry)
        if args.quiet:
            continue
        print(f"\n=== {t['word']} ({t['pos']}) tag={tag}  「{t['blank']}」 正解={target_form}"
              f"  fit={target_fit:.2f}  候補{len(rows)}語")
        print('  -- 当てはまり度の上位（正解として通る疑い） --')
        for r in rows[:args.show]:
            print(fmt(r))
        if args.scorer == 'causal':
            print('  -- 頻度補正した当てはまり度の上位 --')
            for r in sorted(rows, key=lambda r: -r['dfitN'])[:args.show]:
                print(fmt(r))
        print('  -- 埋め込み類似の上位20（Yeung の候補プール） --')
        for r in by_sim[:20]:
            print(fmt(r))
        for wv in watch:
            hit = next((r for r in rows if r['word'].lower() == wv), None)
            if hit:
                print('  -- watch --')
                print(fmt(hit))


    if stream:
        sink.close()
        print(f'\n→ {out}')
        return
    out.write_text(json.dumps({'scorer': args.scorer, 'model': args.model, 'emb': args.emb, 'targets': report},
                              ensure_ascii=False, indent=1))
    print(f'\n→ {out}')


def fmt(r):
    sim = '  -  ' if r['sim'] is None else f"{r['sim']:.2f}"
    flags = ('WN同義 ' if r['wnSyn'] else '') + ('WN反義 ' if r['wnAnt'] else '') \
        + ('同カテ' if r['sameCat'] else '')
    sim_rank = f"(#{r['simRank']})" if 'simRank' in r else ''
    return (f"  fit#{r['fitRank']:>4} Δ{r['dfit']:>7.2f}  N#{r['fitNRank']:>4} ΔN{r['dfitN']:>7.2f}"
            f"  sim{sim} {sim_rank:>6}"
            f"  {r['form']:<16} [{r['word']}] {flags}")


if __name__ == '__main__':
    main()
