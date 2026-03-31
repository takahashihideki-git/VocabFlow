// app/ui-cards.js — カード種別ごとのUI描画・インタラクション処理

import { WORD_DATA } from '../core/word-data.js';

// -------------------------------------------------------
// 日本語意味辞書（Wave 1-2: id 1〜100）
// -------------------------------------------------------
const JP_MEANINGS = {
  "create":"作る・創造する", "increase":"増やす・増加する",
  "improve":"改善する・向上する", "mean":"意味する・〜のつもりである",
  "own":"所有する・自分の", "include":"含む・包含する",
  "consider":"検討する・考慮する", "allow":"許可する・可能にする",
  "suggest":"提案する・示唆する", "produce":"生産する・製造する",
  "decide":"決定する・決める", "offer":"提供する・申し出る",
  "require":"必要とする・要求する", "share":"共有する・分かち合う",
  "store":"保存する・蓄える", "tend":"傾向がある・世話をする",
  "concern":"関係する・心配させる", "describe":"説明する・描写する",
  "involve":"含む・巻き込む", "reduce":"減らす・削減する",
  "design":"設計する・デザインする", "force":"強制する・力",
  "limit":"制限する・限定する", "bear":"耐える・運ぶ",
  "affect":"影響を与える", "deal":"対処する・取引する",
  "avoid":"避ける・回避する", "relate":"関連する・話す",
  "realize":"気づく・実現する", "encourage":"励ます・促進する",
  "compare":"比較する・比べる", "measure":"測定する・測る",
  "exist":"存在する", "mark":"印をつける・示す",
  "challenge":"挑戦する・難問", "depend":"依存する・頼る",
  "object":"反対する・物体", "demand":"要求する・需要",
  "found":"設立する・創設する", "complete":"完了する・完全な",
  "idea":"考え・アイデア", "accord":"一致する・協定",
  "company":"会社・仲間", "interest":"興味・利子",
  "research":"研究する・調査", "cause":"引き起こす・原因",
  "reason":"理由・推論する", "effect":"効果・影響",
  "influence":"影響を与える・影響力", "situation":"状況・場面",
  "environment":"環境・状況", "skill":"技術・スキル",
  "matter":"重要である・問題", "view":"見る・見解",
  "type":"種類・タイプ", "period":"期間・時代",
  "provide":"提供する・与える", "result":"結果・もたらす",
  "process":"過程・処理する", "lead":"導く・リードする",
  "change":"変える・変化", "develop":"発展する・開発する",
  "move":"動く・移動する", "report":"報告する・報告書",
  "control":"制御する・コントロール", "support":"支援する・サポート",
  "build":"建てる・構築する", "maintain":"維持する・保持する",
  "establish":"設立する・確立する", "identify":"特定する・識別する",
  "conduct":"行う・実施する", "achieve":"達成する・成し遂げる",
  "apply":"適用する・申し込む", "define":"定義する",
  "ensure":"確実にする・保証する", "reveal":"明らかにする",
  "obtain":"得る・取得する", "treat":"扱う・治療する",
  "focus":"集中する・焦点", "assume":"仮定する・引き受ける",
  "enable":"可能にする", "manage":"管理する・何とかする",
  "organize":"整理する・組織する", "analyze":"分析する",
  "access":"アクセスする・利用する", "communicate":"伝える・連絡する",
  "evaluate":"評価する", "transform":"変換する・変える",
  "generate":"生成する・生み出す", "implement":"実施する・実装する",
  "respond":"応答する・反応する", "adapt":"適応する・調整する",
  "indicate":"示す・指摘する", "determine":"決定する・判断する",
  "significant":"重要な・著しい", "major":"主要な・大きな",
  "specific":"具体的な・特定の",
};

// -------------------------------------------------------
// 意味を取得（JP辞書 or フォールバック）
// -------------------------------------------------------
export function getMeaning(wordStr, pos) {
  if (JP_MEANINGS[wordStr]) return JP_MEANINGS[wordStr];
  const posMap = { verb:"〜する（動詞）", noun:"名詞", adjective:"形容詞", adverb:"副詞" };
  return `[${wordStr}] ${posMap[pos] || ''}`;
}

// -------------------------------------------------------
// 例文テンプレート生成
// -------------------------------------------------------
const SENTENCE_TEMPLATES = {
  verb: [
    () => `We need to <b>___</b> the situation carefully.`,
    () => `She decided to <b>___</b> the project from scratch.`,
    () => `It is important to <b>___</b> the results accurately.`,
    () => `They are trying to <b>___</b> a better solution.`,
  ],
  noun: [
    () => `The <b>___</b> plays a crucial role in this field.`,
    () => `This <b>___</b> has changed significantly over time.`,
    () => `We need to address the <b>___</b> immediately.`,
  ],
  adjective: [
    () => `The findings were quite <b>___</b>.`,
    () => `This approach is considered <b>___</b> by experts.`,
    () => `The results were <b>___</b> in many respects.`,
  ],
  other: [
    () => `The <b>___</b> was examined carefully.`,
    () => `This <b>___</b> is central to the discussion.`,
  ],
};

function getExample(wordStr, pos) {
  const templates = SENTENCE_TEMPLATES[pos] || SENTENCE_TEMPLATES.other;
  return templates[wordStr.length % templates.length]();
}

// -------------------------------------------------------
// distractors: 同POS の他の単語をランダムに選ぶ
// -------------------------------------------------------
function getDistractors(wordState, count = 3) {
  const rawWord = typeof wordState.word === 'object' ? wordState.word : { id: wordState.wordId, pos: 'other' };
  const pos = rawWord.pos || 'other';
  const candidates = WORD_DATA.filter(
    wd => wd.id !== rawWord.id && (wd.pos === pos || pos === 'other')
  );
  const shuffled = [...candidates].sort(() => Math.random() - 0.5);
  const result = [];
  for (const wd of shuffled) {
    if (result.length >= count) break;
    result.push(wd.word);
  }
  const extras = ['system','process','result','change','effect','period'];
  while (result.length < count) result.push(extras[result.length % extras.length]);
  return result;
}

// -------------------------------------------------------
// TTS（Web Speech API）
// -------------------------------------------------------
export function speak(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = 'en-US';
  utt.rate = 0.9;
  window.speechSynthesis.speak(utt);
}

// -------------------------------------------------------
// SVG アイコン
// -------------------------------------------------------
const SPEAKER_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
  <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
</svg>`;

// -------------------------------------------------------
// CardRenderer クラス
//
// アーキテクチャ:
//   render(card) でカードを描画する。
//   カードが「スワイプ可能」になったら onReady(result) を呼ぶ。
//   実際の画面遷移は app.js のスワイプジェスチャーが担当する。
//   app.js は isSwipeReady() を確認してから遷移を実行する。
// -------------------------------------------------------
export class CardRenderer {
  /**
   * @param {HTMLElement} wrapper   — #card-wrapper
   * @param {SRSEngine}   engine    — judgeDictation 用
   * @param {function}    onReady   — (result: string) => void  スワイプ可能になったとき
   */
  constructor(wrapper, engine, onReady, onSkip) {
    this.wrapper      = wrapper;
    this.engine       = engine;
    this.onReady      = onReady;
    this.onSkip       = onSkip;    // () => void  スキップボタン押下時
    this._ready       = false;
    this._result      = null;
    this._cardEl      = null;
    this._historyMode = false;
  }

  isSwipeReady() { return this._ready; }
  getPendingResult() { return this._result; }
  isHistoryMode() { return this._historyMode; }

  // -------------------------------------------------------
  // 外部から呼ぶメインエントリ
  // -------------------------------------------------------
  render(card) {
    this._ready       = false;
    this._result      = null;
    this._historyMode = false;

    const wordStr = card.word.wordString;
    const rawWord = typeof card.word.word === 'object' ? card.word.word : { word: wordStr, pos: 'other' };
    const pos     = rawWord.pos || 'other';
    const meaning = getMeaning(wordStr, pos);

    let el;
    switch (card.cardType) {
      case 'intro':       el = this._renderIntro(card, wordStr, pos, meaning); break;
      case 'recognition': el = this._renderRecognition(card, wordStr, pos, meaning); break;
      case 'recall':      el = this._renderRecall(card, wordStr, pos, meaning); break;
      case 'dictation':   el = this._renderDictation(card, wordStr, pos); break;
      case 'handwrite':   el = this._renderHandwrite(card, wordStr, pos); break;
      case 'passive':     el = this._renderPassive(card, wordStr, pos, meaning); break;
      default:            el = this._renderPassive(card, wordStr, pos, meaning);
    }

    this._animateIn(el);
  }

  // -------------------------------------------------------
  // スワイプ可能状態にする（内部用）
  // -------------------------------------------------------
  _markReady(result) {
    this._ready  = true;
    this._result = result;
    this.onReady(result);

    // スワイプヒントを表示
    const hint = this._cardEl?.querySelector('.swipe-hint');
    if (hint) hint.classList.add('visible');
  }

  // -------------------------------------------------------
  // Intro カード: 見る → スワイプで次へ
  // -------------------------------------------------------
  _renderIntro(card, wordStr, pos, meaning) {
    const example = getExample(wordStr, pos);
    const el = this._baseCard('intro', card.isRetry);

    el.insertAdjacentHTML('beforeend', `
      <div class="word-main">${wordStr}</div>
      <div class="word-pos">${pos}</div>
      <div class="word-meaning">${meaning}</div>
      <div class="word-example">${example.replace('<b>___</b>', `<b>${wordStr}</b>`)}</div>
      <button class="tts-btn" id="tts-btn">${SPEAKER_ICON} 発音を聞く</button>
      <div class="swipe-hint visible">
        <span class="swipe-arrow">↑</span>
        <span class="swipe-label">スワイプして次へ</span>
      </div>
    `);

    setTimeout(() => speak(wordStr), 300);
    el.querySelector('#tts-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      speak(wordStr);
    });

    // Intro は即スワイプ可能
    this._markReady('perfect');
    return el;
  }

  // -------------------------------------------------------
  // Recognition カード: 単語を見て意味を選ぶ
  // -------------------------------------------------------
  _renderRecognition(card, wordStr, pos, meaning) {
    const distractorWords    = getDistractors(card.word, 3);
    const distractorMeanings = distractorWords.map(w => getMeaning(w, pos));
    const choices = this._shuffle([
      { text: meaning,               isCorrect: true },
      { text: distractorMeanings[0], isCorrect: false },
      { text: distractorMeanings[1], isCorrect: false },
      { text: distractorMeanings[2], isCorrect: false },
    ]);

    const el = this._baseCard('recognition', card.isRetry);
    el.insertAdjacentHTML('beforeend', `
      <div class="word-main">${wordStr}</div>
      <div class="word-pos">${pos} — 意味を選んでください</div>
      <div class="choices" id="choices"></div>
      <div class="swipe-hint">
        <span class="swipe-arrow">↑</span>
        <span class="swipe-label">スワイプして次へ</span>
      </div>
    `);

    const grid = el.querySelector('#choices');
    choices.forEach((c, i) => {
      const btn = document.createElement('button');
      btn.className = 'choice-btn';
      btn.textContent = c.text;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._handleChoice(el, btn, choices, i, c.isCorrect);
      });
      grid.appendChild(btn);
    });

    return el;
  }

  // -------------------------------------------------------
  // Recall カード: 例文の空欄を埋める
  // -------------------------------------------------------
  _renderRecall(card, wordStr, pos, meaning) {
    const example        = getExample(wordStr, pos);
    const distractorWords = getDistractors(card.word, 3);
    const choices = this._shuffle([
      { text: wordStr,             isCorrect: true },
      { text: distractorWords[0], isCorrect: false },
      { text: distractorWords[1], isCorrect: false },
      { text: distractorWords[2], isCorrect: false },
    ]);

    const el = this._baseCard('recall', card.isRetry);
    el.insertAdjacentHTML('beforeend', `
      <div class="word-pos">例文の空欄を埋めてください</div>
      <div class="word-example">${example}</div>
      <div class="choices" id="choices"></div>
      <div class="swipe-hint">
        <span class="swipe-arrow">↑</span>
        <span class="swipe-label">スワイプして次へ</span>
      </div>
    `);

    const grid = el.querySelector('#choices');
    choices.forEach((c, i) => {
      const btn = document.createElement('button');
      btn.className = 'choice-btn';
      btn.textContent = c.text;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._handleChoice(el, btn, choices, i, c.isCorrect);
      });
      grid.appendChild(btn);
    });

    return el;
  }

  // -------------------------------------------------------
  // Dictation カード: 音声を聞いてスペルを入力
  // -------------------------------------------------------
  _renderDictation(card, wordStr, pos) {
    const el = this._baseCard('dictation', card.isRetry);
    el.insertAdjacentHTML('beforeend', `
      <div class="word-pos">音声を聞いてスペルを入力してください</div>
      <button class="tts-btn" id="tts-btn">${SPEAKER_ICON} 音声を再生</button>
      <div class="dictation-input-area">
        <input class="word-input" id="word-input" type="text" autocomplete="off"
               autocorrect="off" autocapitalize="off" spellcheck="false"
               placeholder="スペルを入力...">
        <button class="btn-primary" id="card-submit">送信</button>
      </div>
      <div id="feedback-area"></div>
      <div class="swipe-hint">
        <span class="swipe-arrow">↑</span>
        <span class="swipe-label">スワイプして次へ</span>
      </div>
    `);

    setTimeout(() => speak(wordStr), 300);
    el.querySelector('#tts-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      speak(wordStr);
    });

    const input  = el.querySelector('#word-input');
    const submit = el.querySelector('#card-submit');
    const fbArea = el.querySelector('#feedback-area');
    let answered = false;

    const doSubmit = () => {
      if (answered) return;
      const val = input.value.trim();
      if (!val) return;
      answered = true;

      const result    = this.engine.judgeDictation(val, wordStr);
      const isCorrect = result !== 'wrong';

      input.className = `word-input ${isCorrect ? 'correct' : 'wrong'}`;
      input.disabled  = true;
      submit.disabled = true;

      let fbClass, fbText;
      if      (result === 'perfect')   { fbClass = 'correct'; fbText = '✓ Perfect!'; }
      else if (result === 'near_miss') { fbClass = 'near';    fbText = `△ Near miss — 正解: ${wordStr}`; }
      else if (result === 'phonetic')  { fbClass = 'near';    fbText = `△ Phonetic match — 正解: ${wordStr}`; }
      else                             { fbClass = 'wrong';   fbText = `✗ 不正解 — 正解: ${wordStr}`; }

      fbArea.innerHTML = `<div class="answer-feedback ${fbClass}">${fbText}</div>`;

      if (!isCorrect) {
        el.classList.add('card-shake');
        el.addEventListener('animationend', () => el.classList.remove('card-shake'), { once: true });
      }

      this._markReady(result);
    };

    submit.addEventListener('click', (e) => { e.stopPropagation(); doSubmit(); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSubmit(); });
    setTimeout(() => input.focus(), 350);

    return el;
  }

  // -------------------------------------------------------
  // Handwrite カード（プロトタイプ: タイピング代替）
  // -------------------------------------------------------
  _renderHandwrite(card, wordStr, pos) {
    const el = this._baseCard('handwrite', card.isRetry);
    el.insertAdjacentHTML('beforeend', `
      <div class="word-pos">音声を聞いて単語を書いてください<br>
        <small style="color:var(--text-muted)">(プロトタイプ: タイピングで代替)</small>
      </div>
      <button class="tts-btn" id="tts-btn">${SPEAKER_ICON} 音声を再生</button>
      <div class="dictation-input-area">
        <input class="word-input" id="word-input" type="text" autocomplete="off"
               autocorrect="off" autocapitalize="off" spellcheck="false"
               placeholder="スペルを入力...">
        <button class="btn-primary" id="card-submit">送信</button>
      </div>
      <div id="feedback-area"></div>
      <div class="swipe-hint">
        <span class="swipe-arrow">↑</span>
        <span class="swipe-label">スワイプして次へ</span>
      </div>
    `);

    setTimeout(() => speak(wordStr), 300);
    el.querySelector('#tts-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      speak(wordStr);
    });

    const input  = el.querySelector('#word-input');
    const submit = el.querySelector('#card-submit');
    const fbArea = el.querySelector('#feedback-area');
    let answered = false;

    const doSubmit = () => {
      if (answered) return;
      const val = input.value.trim();
      if (!val) return;
      answered = true;

      const isCorrect = val.toLowerCase() === wordStr.toLowerCase();
      const result    = isCorrect ? 'perfect' : 'wrong';

      input.className = `word-input ${isCorrect ? 'correct' : 'wrong'}`;
      input.disabled  = true;
      submit.disabled = true;

      fbArea.innerHTML = isCorrect
        ? `<div class="answer-feedback correct">✓ 正解!</div>`
        : `<div class="answer-feedback wrong">✗ 不正解 — 正解: ${wordStr}</div>`;

      if (!isCorrect) {
        el.classList.add('card-shake');
        el.addEventListener('animationend', () => el.classList.remove('card-shake'), { once: true });
      }

      this._markReady(result);
    };

    submit.addEventListener('click', (e) => { e.stopPropagation(); doSubmit(); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSubmit(); });
    setTimeout(() => input.focus(), 350);

    return el;
  }

  // -------------------------------------------------------
  // Passive カード: 例文表示のみ → スワイプで通過
  // -------------------------------------------------------
  _renderPassive(card, wordStr, pos, meaning) {
    const example = getExample(wordStr, pos);
    const el      = this._baseCard('passive', card.isRetry);
    el.insertAdjacentHTML('beforeend', `
      <div class="passive-label">既知語 — 流し読み</div>
      <div class="word-example" style="font-size:16px">${
        example.replace('<b>___</b>', `<b style="color:var(--accent)">${wordStr}</b>`)
      }</div>
      <div class="word-pos">${wordStr} — ${meaning}</div>
      <div class="swipe-hint visible">
        <span class="swipe-arrow">↑</span>
        <span class="swipe-label">スワイプして次へ</span>
      </div>
    `);

    this._markReady('perfect');
    return el;
  }

  // -------------------------------------------------------
  // 選択肢クリック共通処理
  // -------------------------------------------------------
  _handleChoice(cardEl, clickedBtn, choices, clickedIdx, isCorrect) {
    const btns = cardEl.querySelectorAll('.choice-btn');
    btns.forEach(b => (b.disabled = true));
    clickedBtn.classList.add(isCorrect ? 'correct' : 'wrong');

    if (!isCorrect) {
      choices.forEach((c, i) => { if (c.isCorrect) btns[i].classList.add('correct'); });
      cardEl.classList.add('card-shake');
      cardEl.addEventListener('animationend', () => cardEl.classList.remove('card-shake'), { once: true });
    }

    this._markReady(isCorrect ? 'perfect' : 'wrong');
  }

  // -------------------------------------------------------
  // ベースカード DOM 生成
  // -------------------------------------------------------
  _baseCard(type, isRetry = false) {
    const el = document.createElement('div');
    el.className = 'card';
    this._cardEl = el;

    const badge = document.createElement('div');
    badge.className = `card-type-badge badge-${type}`;
    badge.textContent = this._typeName(type);
    el.appendChild(badge);

    if (isRetry) {
      const rb = document.createElement('div');
      rb.className = 'card-type-badge badge-retry';
      rb.style.cssText = 'position:absolute;top:16px;right:16px';
      rb.textContent = 'リトライ';
      el.style.position = 'relative';
      el.appendChild(rb);
    }

    // 回答が必要なカード種別にはスキップボタンを追加
    const skippable = ['recognition', 'recall', 'dictation', 'handwrite'];
    if (skippable.includes(type) && this.onSkip) {
      const skipBtn = document.createElement('button');
      skipBtn.className = 'btn-skip';
      skipBtn.id = 'btn-skip';
      skipBtn.textContent = 'スキップ →';
      skipBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!this._ready) this.onSkip();
      });
      el.appendChild(skipBtn);
    }

    return el;
  }

  _typeName(type) {
    return { intro:'Intro', recognition:'Recognition', recall:'Recall',
             dictation:'Dictation', handwrite:'Handwrite', passive:'Passive' }[type] ?? type;
  }

  // -------------------------------------------------------
  // アニメーション
  // -------------------------------------------------------
  _animateIn(el) {
    const old = this.wrapper.querySelector('.card');
    if (old) old.remove();
    this.wrapper.appendChild(el);
    el.classList.add('card-enter');
    el.addEventListener('animationend', () => el.classList.remove('card-enter'), { once: true });
  }

  animateOut(callback) {
    const el = this.wrapper.querySelector('.card');
    if (!el) { callback(); return; }
    el.classList.add('card-exit');
    el.addEventListener('animationend', () => { el.remove(); callback(); }, { once: true });
  }

  animateOutDown(callback) {
    const el = this.wrapper.querySelector('.card');
    if (!el) { callback(); return; }
    el.classList.add('card-exit-down');
    el.addEventListener('animationend', () => { el.remove(); callback(); }, { once: true });
  }

  // -------------------------------------------------------
  // 履歴ビュー（戻りスワイプで表示。回答済み / スキップ済みカードの読み取り専用表示）
  // -------------------------------------------------------
  renderHistoryView(card) {
    this._ready       = false;
    this._result      = null;
    this._historyMode = true;

    const wordStr  = card.word.wordString;
    const rawWord  = typeof card.word.word === 'object' ? card.word.word : { word: wordStr, pos: 'other' };
    const pos      = rawWord.pos || 'other';
    const meaning  = getMeaning(wordStr, pos);

    const el = document.createElement('div');
    el.className = 'card';
    this._cardEl = el;

    // カード種別バッジ
    const badge = document.createElement('div');
    badge.className = `card-type-badge badge-${card.cardType}`;
    badge.textContent = this._typeName(card.cardType);
    el.appendChild(badge);

    // 履歴バッジ
    const histBadge = document.createElement('div');
    histBadge.className = 'card-type-badge badge-skipped';
    histBadge.style.cssText = 'position:absolute;top:16px;right:16px';
    histBadge.textContent = '履歴';
    el.style.position = 'relative';
    el.appendChild(histBadge);

    // 結果ラベル
    let resultClass, resultText;
    if (card.done && !card.word.skipped && card.result === null) {
      // スキップ済み（skipped フラグはすでに次セッションのため feed 側でクリアされた可能性あり）
      resultClass = 'was-skipped';
      resultText  = 'スキップ済み — 次セッションで優先再出題';
    } else if (card.result === 'wrong') {
      resultClass = 'was-wrong';
      resultText  = `不正解 — 正解: ${wordStr}`;
    } else if (card.result === null) {
      resultClass = 'was-skipped';
      resultText  = 'スキップ済み — 次セッションで優先再出題';
    } else {
      resultClass = 'was-correct';
      resultText  = '正解済み';
    }

    el.insertAdjacentHTML('beforeend', `
      <div class="history-card-body">
        <div class="word-main">${wordStr}</div>
        <div class="word-pos">${pos}</div>
        <div class="word-meaning">${meaning}</div>
        <div class="history-result ${resultClass}">${resultText}</div>
      </div>
      <div class="swipe-hint visible">
        <span class="swipe-arrow">↑</span>
        <span class="swipe-label">スワイプして先へ</span>
      </div>
    `);

    this._animateInFromTop(el);
    // 履歴ビューは常にスワイプ可能（前に進むだけ）
    this._markReady('history');
  }

  _animateInFromTop(el) {
    const old = this.wrapper.querySelector('.card');
    if (old) old.remove();
    this.wrapper.appendChild(el);
    el.classList.add('card-enter-from-top');
    el.addEventListener('animationend', () => el.classList.remove('card-enter-from-top'), { once: true });
  }

  // -------------------------------------------------------
  // ユーティリティ
  // -------------------------------------------------------
  _shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}
