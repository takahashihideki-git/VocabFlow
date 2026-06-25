// core/feed-generator.js — フィード生成

import { Card } from './models.js';

export class FeedGenerator {
  constructor(config, srsEngine, waveManager) {
    this.config = config;
    this.engine = srsEngine;
    this.waveManager = waveManager;
    // オラクル検証用フック（sim 限定）。null のとき本番挙動（word.pRecall / word.h）と完全一致。
    // recallFn(word, t) → 保持率の推定（オラクルは真のカーブを返す）。
    // dueHFn(word, t)   → due 判定に使う半減期（オラクルは真の半減期を返す）。
    this.recallFn = null;
    this.dueHFn = null;
  }

  // 保持率の推定（オラクル注入時は真のカーブ・既定は word.pRecall）
  _recall(word, t) {
    return this.recallFn ? this.recallFn(word, t) : word.pRecall(t);
  }

  // due 判定の半減期（オラクル注入時は真の半減期・既定は dueSampling 連動の点推定）
  _dueH(word, t) {
    if (this.dueHFn) return this.dueHFn(word, t);
    return this.config.dueSampling ? word.effectiveH(t, this.config) : word.h;
  }

  // -------------------------------------------------------
  // 1セッション分のカード列を生成 → Session の cards[] を返す
  // -------------------------------------------------------
  generateSession(learnerState, currentTime, { handwriteMode = true } = {}) {
    const cfg = this.config;

    // ウェーブ解放チェック（即時トリガー）
    this.waveManager.checkUnlock(currentTime);
    learnerState.handwriteModeEnabled = handwriteMode;
    learnerState.handwriteCountThisSession = 0;

    // 候補プール構築
    const pools = this._buildCandidatePools(learnerState, currentTime);

    // セッション早期終了条件（spec §4.4）
    // urgent + due + new + skipped がすべて空 → filler だけで埋めない
    if (pools.skipped.length === 0 && pools.urgent.length === 0 && pools.due.length === 0 && pools.new.length === 0) {
      return [];
    }

    // グリーディ優先順位方式でスロット割当（spec §4.2）
    let remaining = cfg.sessionSize;

    // 0. Skipped（最優先: 前セッションでスキップされた語）
    const selectedSkipped = pools.skipped.slice(0, remaining);
    selectedSkipped.forEach(w => { w.skipped = false; }); // 出題時にフラグをクリア
    remaining -= selectedSkipped.length;

    // 新語枠の予約（reserveNewSlots）: 復習負荷が新語を締め出さないよう先に確保する。
    // 実アプリ（Anki/Duolingo 等）は「1日N新語」を復習と独立に確保する＝この方式。
    // 既定 false では reservedNew=0 となり、従来の「復習優先・新語は余りスロット」挙動と一致。
    const supplyCap = Math.min(pools.new.length, Math.min(remaining, cfg.maxNewPerSession));
    let reservedNew = 0;
    if (cfg.adaptiveNew) {
      let frac;
      if (cfg.adaptiveNewSignal === 'success') {
        // 観測成功率が高いほど満額・低いほど 0（線形）。コア推定に依存しない頑健な負荷信号。
        const r = this.engine?.successRate ?? cfg.targetRetention;
        const span = cfg.adaptiveNewSuccHigh - cfg.adaptiveNewSuccLow;
        frac = span > 0 ? Math.max(0, Math.min(1, (r - cfg.adaptiveNewSuccLow) / span)) : (r >= cfg.adaptiveNewSuccHigh ? 1 : 0);
      } else {
        // urgent(p<0.5) 滞留が少ないほど満額・多いほど 0（線形・コア依存）。
        const u = pools.urgent.length;
        const span = cfg.adaptiveNewHard - cfg.adaptiveNewSoft;
        frac = span > 0 ? Math.max(0, Math.min(1, (cfg.adaptiveNewHard - u) / span)) : (u <= cfg.adaptiveNewSoft ? 1 : 0);
      }
      reservedNew = Math.round(supplyCap * frac);
      // 最低導入フロア: 成功率が低くても最低 floor 語は導入を保証する。
      // throttle は上限（reservedNew の伸び）だけに効かせ、前進そのものは止めない。
      // exponential×novice では success が低く frac→0 になり新語ゼロ＝一切前進しない崖が出る。
      // フロアはこの崖を消しつつ、余裕があるときの絞り（上限 throttle）は維持する。
      if (cfg.adaptiveNewFloor > 0) {
        reservedNew = Math.max(reservedNew, Math.min(cfg.adaptiveNewFloor, supplyCap));
      }
    } else if (cfg.reserveNewSlots) {
      reservedNew = supplyCap;
    }
    const reviewBudget = remaining - reservedNew;

    // 1. Urgent（最優先: 忘れかけている語）— 復習予算の範囲で
    const selectedUrgent = this._pickSorted(pools.urgent, reviewBudget, 'pRecall_asc', currentTime);
    // 2. Due（最適復習時刻を過ぎた語）
    const selectedDue = this._pickSorted(pools.due, reviewBudget - selectedUrgent.length, 'pRecall_asc', currentTime);
    remaining -= selectedUrgent.length + selectedDue.length;

    // 3. New（新語。予約枠 + 復習が余らせた分。上限 maxNewPerSession）
    const newCount = Math.min(pools.new.length, Math.min(remaining, cfg.maxNewPerSession));
    const selectedNew = pools.new.slice(0, newCount);
    remaining -= newCount;

    // 4. Filler（箸休め。残りスロットを埋める）
    const selectedFiller = this._pickRandom(pools.filler, remaining);

    // カード種別を割り当て
    const cards = [];

    for (const w of selectedSkipped) {
      cards.push(new Card(w, this._assignCardType(w, learnerState, 'skipped')));
    }
    for (const w of selectedUrgent) {
      cards.push(new Card(w, this._assignCardType(w, learnerState, 'urgent')));
    }
    for (const w of selectedDue) {
      cards.push(new Card(w, this._assignCardType(w, learnerState, 'due')));
    }
    for (const w of selectedNew) {
      // 新語は Intro + Recognition のペアとして追加
      cards.push(new Card(w, 'intro'));
      cards.push(new Card(w, 'recognition'));
    }
    for (const w of selectedFiller) {
      cards.push(new Card(w, 'passive'));
    }

    // 配置最適化
    return this._arrangeCards(cards, currentTime);
  }

  // -------------------------------------------------------
  // 候補プール構築
  //
  // 復習タイミングの計算:
  //   最適復習時刻 = lastReviewed + h * log2(1/targetRetention)
  //   これを過ぎたら "due"（要復習）扱い
  // -------------------------------------------------------
  _buildCandidatePools(learnerState, currentTime) {
    const cfg = this.config;
    const skipped = [];   // 前セッションでスキップされた語（最優先）
    const urgent = [];    // p < 0.5（忘れかけ）
    const due = [];       // p < targetRetention（最適復習時刻を過ぎた）
    const filler = [];    // p >= targetRetention の定着済み（箸休め）
    const newWords = this.waveManager.getNewWordsFromActiveWaves().filter(w => !w.excluded);

    // 最適復習間隔 = h * log2(1/r) ≈ h * 0.234 (r=0.85)
    const retentionFactor = Math.log2(1 / cfg.targetRetention);

    for (const w of learnerState.words) {
      // 除外された語はフィード生成から完全にスキップ
      if (w.excluded) continue;

      // スキップされた語は stage に関わらず最優先プールへ（逃げ切り不可）
      if (w.skipped) {
        skipped.push(w);
        continue;
      }

      if (w.stage === 'new') continue;

      const p = this._recall(w, currentTime);

      if (w.stage === 'mastered') {
        if (p >= cfg.targetRetention) filler.push(w);
        else if (p < 0.5) urgent.push(w); // 定着済みでも忘れていれば urgent
        else due.push(w); // targetRetention 未満（0.5以上）→ 最適タイミングで due として維持
        continue;
      }

      // 最適復習時刻を過ぎているか。
      // dueSampling 有効時は点推定 h ではなく不確実性の幅から引いた effectiveH で判定し、
      // 同日導入語の位相同期（同時 due → 同時復習 → 同時 due）を散らす（提案書 §3）。
      const hForDue = this._dueH(w, currentTime);
      const optimalNextReview = w.lastReviewed + (hForDue > 0 ? hForDue * retentionFactor : 0);
      const isDue = currentTime >= optimalNextReview;

      if (p < 0.5) {
        urgent.push(w);
      } else if (isDue) {
        due.push(w);
      } else if (p >= cfg.targetRetention) {
        filler.push(w);
      }
      // 0.5 ≤ p < targetRetention でまだ due でない → 次の機会まで待つ
    }

    // urgent/due を p 昇順でソート（最も忘れかけているものを優先）
    urgent.sort((a, b) => this._recall(a, currentTime) - this._recall(b, currentTime));
    due.sort((a, b) => this._recall(a, currentTime) - this._recall(b, currentTime));

    return { skipped, urgent, due, new: newWords, filler };
  }

  // -------------------------------------------------------
  // ステージに応じたカード種別を割り当て
  //
  // pool: 'skipped'|'urgent'|'due' （リトライ等の呼び出しでは未指定）
  // mastered 語は出題プールで種別が変わる（spec §4.4）:
  //   - urgent (p<0.5): Dictation 固定 — 久しぶりだね。本当に覚えてる？
  //   - due / skipped:  Recognition/Recall/Dictation/Passive からランダム選出
  // -------------------------------------------------------
  _assignCardType(word, learnerState, pool) {
    const cfg = this.config;

    // Handwrite 介入チェック：停滞語かつ手書きモード有効かつ上限未達
    if (word.needsHandwrite && learnerState.handwriteModeEnabled) {
      if (learnerState.handwriteCountThisSession < cfg.maxHandwritePerSession) {
        learnerState.handwriteCountThisSession++;
        return 'handwrite';
      }
    }

    if (word.stage === 'mastered') {
      if (pool === 'urgent') return 'dictation';
      const variants = ['recognition', 'recall', 'dictation', 'passive'];
      const rng = cfg.rng ?? Math.random;
      return variants[Math.floor(rng() * variants.length)];
    }

    switch (word.stage) {
      case 'recognition': return 'recognition';
      case 'recall':      return 'recall';
      case 'dictation':
        if (word.h >= cfg.dictationThresholdH) return 'dictation';
        return 'recall';
      default:            return 'recall';
    }
  }

  // -------------------------------------------------------
  // 配置最適化（spec Section 4.3）
  // -------------------------------------------------------
  _arrangeCards(cards, currentTime) {
    const intro        = cards.filter(c => c.cardType === 'intro');
    const recognition  = cards.filter(c => c.cardType === 'recognition');
    const recall       = cards.filter(c => c.cardType === 'recall');
    const dictation    = cards.filter(c => c.cardType === 'dictation');
    const handwrite    = cards.filter(c => c.cardType === 'handwrite');
    const passive      = cards.filter(c => c.cardType === 'passive');

    // urgent なカード（p < targetRetention）を前半に
    const urgentRecall    = recall.filter(c => this._recall(c.word, currentTime) < 0.5);
    const nonUrgentRecall = recall.filter(c => this._recall(c.word, currentTime) >= 0.5);

    // 配置ルール（Spec §4.3）:
    // 1. 同じカード種別は最大2枚まで連続可（最重要）
    // 2. 新語（Intro）は連続させず2〜3枚の復習カードを挟む
    // 3. 同一新語の Intro → 数枚後に Recognition
    // 4. Urgent → 前半
    // 5. 箸休め（passive）を等間隔

    const result = [];

    // recognition カードを「intro とペアの新語」と「単独の復習」に分ける
    // 復習 recognition（urgent/due から来る stage='recognition' の語）は recall と同列に扱う
    const introWordIds = new Set(intro.map(c => c.word.wordId));
    const pairedRecognition  = recognition.filter(c =>  introWordIds.has(c.word.wordId));
    const reviewRecognition  = recognition.filter(c => !introWordIds.has(c.word.wordId));

    // urgent → intro（挟み込み）→ 残りの復習カード（dictation/handwrite も統合）
    result.push(...urgentRecall);
    this._interleaveIntroRecognition(result, intro, pairedRecognition,
      [...nonUrgentRecall, ...reviewRecognition, ...dictation, ...handwrite]);

    // 同種カード最大2連続ルールを適用してから passive を散布
    return this._scatterPassive(this._enforceMaxConsecutive(result), passive);
  }

  _interleaveIntroRecognition(result, intros, recognitions, fillerCards) {
    // Spec §4.3 ルール3: Intro → 最低 MIN_GAP 枚後に Recognition を配置
    //
    // アルゴリズム（キュー方式）:
    //   - Intro を配置するたびに Recognition を pending キューに追加（readyAt = 現位置 + MIN_GAP）
    //   - pending をドレインするのは「全 Intro 配置済み」か「フィラーが使える」ときだけ。
    //     ← これにより Intro 自身が別の Intro-Recog ペアのスペーサーとして機能する。
    //   - フィラーも Intro も尽きた場合のみ、readyAt を諦めて残 pending を押し出す。

    const MIN_GAP = 2;
    const recMap  = new Map(recognitions.map(r => [r.word.wordId, r]));
    const output  = [];
    const pending = []; // { card, readyAt } — readyAt 昇順で追加されることが保証される
    let fi = 0; // fillerCards インデックス
    let ii = 0; // intros インデックス

    const drainPending = () => {
      while (pending.length > 0 && pending[0].readyAt <= output.length) {
        output.push(pending.shift().card);
      }
    };

    while (ii < intros.length || fi < fillerCards.length || pending.length > 0) {
      // pending ドレインは「Intro が尽きた」か「フィラーが使える」場合のみ行う。
      // Intro がまだあってフィラーもない状態では Recognition を早出しせず、
      // 後続 Intro がスペーサーとして機能するのを待つ。
      const canDrain = ii >= intros.length || fi < fillerCards.length;
      if (canDrain) drainPending();

      if (ii < intros.length) {
        output.push(intros[ii]);
        const rec = recMap.get(intros[ii].word.wordId);
        if (rec) pending.push({ card: rec, readyAt: output.length + MIN_GAP });
        ii++;
        // Intro 直後にフィラーを1枚（あれば MIN_GAP 確保に貢献）
        if (fi < fillerCards.length) output.push(fillerCards[fi++]);
      } else if (fi < fillerCards.length) {
        output.push(fillerCards[fi++]);
      } else if (pending.length > 0) {
        // Intro もフィラーも尽きた → 残 pending を順に押し出す（gap を諦める）
        output.push(pending.shift().card);
      }
    }

    result.push(...output);
  }

  _enforceMaxConsecutive(cards, max = 2) {
    // Spec §4.3 ルール1: 同種カードが max+1 枚連続しそうなとき、
    // 別種カードを割り込ませる（best effort — 他種が尽きた場合は諦めて積む）。
    const remaining = [...cards];
    const result = [];

    while (remaining.length > 0) {
      const tail = result.slice(-max);
      const blocked = (tail.length === max && tail.every(c => c.cardType === tail[0].cardType))
        ? tail[0].cardType : null;

      if (blocked === null) {
        result.push(remaining.shift());
      } else {
        const idx = remaining.findIndex(c => c.cardType !== blocked);
        if (idx === -1) { result.push(...remaining); break; }
        result.push(remaining.splice(idx, 1)[0]);
      }
    }
    return result;
  }

  _scatterPassive(cards, passiveCards) {
    if (passiveCards.length === 0) return cards;

    const result = [...cards];
    const interval = Math.max(3, Math.floor(result.length / (passiveCards.length + 1)));

    let inserted = 0;
    for (let i = 0; i < passiveCards.length; i++) {
      const pos = Math.min(interval * (i + 1) + inserted, result.length);
      result.splice(pos, 0, passiveCards[i]);
      inserted++;
    }

    return result;
  }

  // -------------------------------------------------------
  // ユーティリティ: ソート順選出（貪欲方式用）
  // -------------------------------------------------------
  _pickSorted(arr, n, sortKey, currentTime) {
    if (arr.length === 0 || n <= 0) return [];
    const sorted = [...arr];
    if (sortKey === 'pRecall_asc') {
      sorted.sort((a, b) => this._recall(a, currentTime) - this._recall(b, currentTime));
    }
    return sorted.slice(0, Math.min(n, sorted.length));
  }

  // -------------------------------------------------------
  // ユーティリティ: ランダム選出
  // -------------------------------------------------------
  _pickRandom(arr, n) {
    if (n >= arr.length) return [...arr];
    const rng = this.config.rng ?? Math.random;
    const copy = [...arr];
    const result = [];
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(rng() * copy.length);
      result.push(copy.splice(idx, 1)[0]);
    }
    return result;
  }
}
