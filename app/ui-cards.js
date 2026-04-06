// app/ui-cards.js — カード種別ごとのUI描画・インタラクション処理

import { WORD_DATA } from '../core/word-data.js';
import { LABELS } from '../core/labels.js';
import { BackgroundManager } from './ui-background.js';

// -------------------------------------------------------
// WORD_DATA 高速ルックアップ
// -------------------------------------------------------
const WORD_MAP = new Map(WORD_DATA.map(wd => [wd.word, wd]));

// 末尾に句点がなければ補う
const ensureKuten = (s) => (s && !s.endsWith('。') ? s + '。' : s ?? '');

// -------------------------------------------------------
// 意味を取得（WORD_DATA.meanings[0] → フォールバック）
// -------------------------------------------------------
export function getMeaning(wordStr, pos) {
  const wd = WORD_MAP.get(wordStr);
  if (wd?.meanings?.[0]) return wd.meanings[0].meaning;
  const posMap = { verb:"〜する（動詞）", noun:"名詞", adjective:"形容詞", adverb:"副詞" };
  return `[${wordStr}] ${posMap[pos] || ''}`;
}

// -------------------------------------------------------
// 例文を取得（WORD_DATA.examples[0] → フォールバック）
// 戻り値: { full: string, blank: string }
//   full  — 完成文（blankAnswer を <b> でハイライト）
//   blank — 穴埋め文（___ を <b>___</b> に変換）
// -------------------------------------------------------
function getExample(wordStr, pos) {
  const wd = WORD_MAP.get(wordStr);
  if (wd?.examples?.[0]) {
    const ex = wd.examples[0];
    const escaped = ex.blankAnswer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const full  = ex.en.replace(new RegExp(`\\b${escaped}\\b`, 'i'), `<b>${ex.blankAnswer}</b>`);
    const blank = ex.blank.replace('___', '<b>___</b>');
    return { full, blank, ja: ex.ja || '' };
  }
  // フォールバック（WORD_DATA に未収録の語）
  return {
    full:  `The word <b>${wordStr}</b> is used in various contexts.`,
    blank: `The word <b>___</b> is used in various contexts.`,
    ja: '',
  };
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
   * @param {HTMLElement}      wrapper     — #card-wrapper
   * @param {SRSEngine}        engine      — judgeDictation 用
   * @param {function}         onReady     — (result: string) => void  スワイプ可能になったとき
   * @param {BackgroundManager} [bgManager] — カード背景画像管理（省略可）
   */
  constructor(wrapper, engine, onReady, bgManager = null) {
    this.wrapper      = wrapper;
    this.engine       = engine;
    this.onReady      = onReady;
    this._bg          = bgManager;
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

    const wordStr    = card.word.wordString;
    const rawWord    = typeof card.word.word === 'object' ? card.word.word : { word: wordStr, pos: 'other' };
    const pos        = rawWord.pos || 'other';
    const meaning    = getMeaning(wordStr, pos);
    const categoryId = rawWord.categoryId ?? 0;

    let el;
    switch (card.cardType) {
      case 'intro':       el = this._renderIntro(card, wordStr, pos, meaning, categoryId); break;
      case 'recognition': el = this._renderRecognition(card, wordStr, pos, meaning, categoryId); break;
      case 'recall':      el = this._renderRecall(card, wordStr, pos, meaning, categoryId); break;
      case 'dictation':   el = this._renderDictation(card, wordStr, pos, categoryId); break;
      case 'handwrite':   el = this._renderHandwrite(card, wordStr, pos, categoryId); break;
      case 'passive':     el = this._renderPassive(card, wordStr, pos, meaning, categoryId); break;
      default:            el = this._renderPassive(card, wordStr, pos, meaning, categoryId);
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
  _renderIntro(card, wordStr, pos, meaning, categoryId) {
    const example = getExample(wordStr, pos);
    const el = this._baseCard('intro', card, categoryId);

    el.insertAdjacentHTML('beforeend', `
      <div class="word-main">${wordStr}</div>
      <div class="word-pos">${pos}</div>
      <div class="word-meaning">${meaning}</div>
      <div class="word-example">${example.full}</div>
      ${example.ja ? `
      <div class="ja-toggle-row">
        <button class="ja-toggle-btn">日本語訳</button>
        <div class="example-ja">${example.ja}</div>
      </div>` : ''}
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
    if (example.ja) {
      const toggleBtn = el.querySelector('.ja-toggle-btn');
      const jaDiv     = el.querySelector('.example-ja');
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const showing = jaDiv.classList.toggle('visible');
        toggleBtn.textContent = showing ? '日本語訳を隠す' : '日本語訳';
      });
    }

    // Intro は即スワイプ可能
    this._markReady('perfect');
    return el;
  }

  // -------------------------------------------------------
  // Recognition カード: 単語を見て意味を選ぶ
  // -------------------------------------------------------
  _renderRecognition(card, wordStr, pos, meaning, categoryId) {
    // WORD_DATA の distractors フィールド（意味文字列）を優先使用
    const wd = WORD_MAP.get(wordStr);
    const distractorMeanings = wd?.distractors?.length >= 3
      ? wd.distractors.slice(0, 3)
      : getDistractors(card.word, 3).map(w => getMeaning(w, pos));
    const choices = card.shuffledChoices ?? this._shuffle([
      { text: meaning,               isCorrect: true },
      { text: distractorMeanings[0], isCorrect: false },
      { text: distractorMeanings[1], isCorrect: false },
      { text: distractorMeanings[2], isCorrect: false },
    ]);
    if (!card.shuffledChoices) card.shuffledChoices = choices;

    const el = this._baseCard('recognition', card, categoryId);
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
        card.userAnswer = c.text;
        this._handleChoice(el, btn, choices, i, c.isCorrect, () => speak(wordStr));
      });
      grid.appendChild(btn);
    });

    return el;
  }

  // -------------------------------------------------------
  // Recall カード: 例文の空欄を埋める
  // -------------------------------------------------------
  _renderRecall(card, wordStr, pos, meaning, categoryId) {
    const example        = getExample(wordStr, pos);
    const examplePlain   = example.full.replace(/<[^>]+>/g, '');
    const distractorWords = getDistractors(card.word, 3);
    const choices = card.shuffledChoices ?? this._shuffle([
      { text: wordStr,             isCorrect: true },
      { text: distractorWords[0], isCorrect: false },
      { text: distractorWords[1], isCorrect: false },
      { text: distractorWords[2], isCorrect: false },
    ]);
    if (!card.shuffledChoices) card.shuffledChoices = choices;

    const el = this._baseCard('recall', card, categoryId);
    el.insertAdjacentHTML('beforeend', `
      <div class="word-pos">例文の空欄を埋めてください</div>
      <div class="word-example">${card.userAnswer ? example.full : example.blank}</div>
      ${example.ja ? `
      <div class="ja-toggle-row">
        <button class="ja-toggle-btn" disabled>日本語訳</button>
        <div class="example-ja">${example.ja}</div>
      </div>` : ''}
      <div class="choices" id="choices"></div>
      <div class="swipe-hint">
        <span class="swipe-arrow">↑</span>
        <span class="swipe-label">スワイプして次へ</span>
      </div>
    `);
    if (example.ja) {
      const toggleBtn = el.querySelector('.ja-toggle-btn');
      const jaDiv     = el.querySelector('.example-ja');
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const showing = jaDiv.classList.toggle('visible');
        toggleBtn.textContent = showing ? '日本語訳を隠す' : '日本語訳';
      });
    }

    const grid = el.querySelector('#choices');
    choices.forEach((c, i) => {
      const btn = document.createElement('button');
      btn.className = 'choice-btn';
      btn.textContent = c.text;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        card.userAnswer = c.text;
        el.querySelector('.word-example').innerHTML = example.full;
        this._handleChoice(el, btn, choices, i, c.isCorrect, () => speak(examplePlain));
      });
      grid.appendChild(btn);
    });

    return el;
  }

  // -------------------------------------------------------
  // Dictation カード: 音声を聞いてスペルを入力
  // -------------------------------------------------------
  _renderDictation(card, wordStr, pos, categoryId) {
    const el = this._baseCard('dictation', card, categoryId);
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

      card.userAnswer = val;
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
  // Handwrite カード: 音声を聞いて手書き → 写真送信（モック）
  // -------------------------------------------------------
  _renderHandwrite(card, wordStr, pos, categoryId) {
    const el = this._baseCard('handwrite', card, categoryId);
    el.insertAdjacentHTML('beforeend', `
      <div class="word-pos" style="text-align:left;line-height:1.6">
        音声を聞いて単語を紙に手書きで10回書き、それを写真に撮って送ってください。
      </div>
      <button class="tts-btn" id="tts-btn">${SPEAKER_ICON} 音声を再生</button>
      <div class="handwrite-photo-area">
        <label class="handwrite-photo-btn" id="camera-btn" title="カメラで撮影">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
          <span>カメラで撮影</span>
          <input type="file" accept="image/*" capture="environment" id="hw-camera-input" style="display:none">
        </label>
        <label class="handwrite-photo-btn" id="gallery-btn" title="写真を選択">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
          <span>写真を選択</span>
          <input type="file" accept="image/*" id="hw-gallery-input" style="display:none">
        </label>
      </div>
      <div id="hw-preview-area"></div>
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

    const previewArea = el.querySelector('#hw-preview-area');
    let submitted = false;

    const handleFile = (file) => {
      if (submitted || !file) return;
      submitted = true;

      // プレビューサムネイル表示
      const reader = new FileReader();
      reader.onload = (ev) => {
        previewArea.innerHTML = `
          <div class="hw-preview">
            <img src="${ev.target.result}" class="hw-thumb" alt="手書き写真">
            <div class="hw-status hw-sending">送信中...</div>
          </div>
        `;

        // ボタン無効化
        el.querySelector('#camera-btn').style.pointerEvents = 'none';
        el.querySelector('#gallery-btn').style.pointerEvents = 'none';

        const statusEl = previewArea.querySelector('.hw-status');

        // Step 1: 1.0秒後 → 送信完了
        setTimeout(() => {
          statusEl.textContent = '送信完了 — AI が認識中...';
          statusEl.classList.add('hw-recognizing');
        }, 1000);

        // Step 2: 2.5秒後 → AI認識中（文字スキャン風に文字が現れる）
        setTimeout(() => {
          const chars = wordStr.split('');
          let revealed = '';
          statusEl.classList.remove('hw-recognizing');
          statusEl.innerHTML = `<span class="hw-ocr-label">認識結果:</span> <span class="hw-ocr-word"></span>`;
          const ocrSpan = statusEl.querySelector('.hw-ocr-word');
          let i = 0;
          const revealInterval = setInterval(() => {
            revealed += chars[i];
            ocrSpan.textContent = revealed;
            i++;
            if (i >= chars.length) {
              clearInterval(revealInterval);
              // Step 3: 0.6秒後 → 認識成功
              setTimeout(() => {
                statusEl.innerHTML = `<div class="answer-feedback correct">✓ 「${wordStr}」を認識しました</div>`;
                card.userAnswer = wordStr;
                this._markReady('perfect');
              }, 600);
            }
          }, 120);
        }, 2500);
      };
      reader.readAsDataURL(file);
    };

    el.querySelector('#hw-camera-input').addEventListener('change', (e) => {
      e.stopPropagation();
      handleFile(e.target.files[0]);
    });
    el.querySelector('#hw-gallery-input').addEventListener('change', (e) => {
      e.stopPropagation();
      handleFile(e.target.files[0]);
    });

    // label のクリックがカードのスワイプジェスチャーに伝播しないようにする
    el.querySelector('#camera-btn').addEventListener('click', (e) => e.stopPropagation());
    el.querySelector('#gallery-btn').addEventListener('click', (e) => e.stopPropagation());

    return el;
  }

  // -------------------------------------------------------
  // Passive カード: 1回に1セクションをローテーション表示
  // -------------------------------------------------------
  _renderPassive(card, wordStr, pos, meaning, categoryId) {
    const wd      = WORD_MAP.get(wordStr);
    const passive = wd?.passive;
    const el      = this._baseCard('passive', card, categoryId);

    if (passive) {
      const SECTION_DEFS = [
        { key: 'etymology',    title: '語源',         available: () => !!passive.etymology },
        { key: 'tips',         title: '使い方のコツ', available: () => !!passive.tips },
        { key: 'confusables',  title: '紛らわしい語', available: () => !!passive.confusables },
        { key: 'collocations', title: 'よく使う表現', available: () => (passive.collocations || []).length > 0 },
        { key: 'trivia',       title: '豆知識',       available: () => !!passive.trivia },
      ];
      const available = SECTION_DEFS.filter(s => s.available());

      // 初回表示時にカーソルからセクションを確定し保存（履歴ビューは保存済みの値を使用）
      if (!card.passiveSection && available.length > 0) {
        const cursor = card.word.passiveCursor ?? 0;
        card.passiveSection = available[cursor % available.length].key;
        card.word.passiveCursor = cursor + 1;
      }

      const sectionDef = SECTION_DEFS.find(s => s.key === card.passiveSection) ?? available[0];
      let sectionBody;
      if (sectionDef?.key === 'collocations') {
        const colChips = passive.collocations.map(c => {
          const q = encodeURIComponent(c);
          return `<a class="collocation-chip" href="https://www.google.com/search?q=${q}" target="_blank" rel="noopener">${c}</a>`;
        }).join('');
        sectionBody = `<div class="collocation-chips">${colChips}</div>`;
      } else if (sectionDef) {
        sectionBody = `<div class="passive-section-body">${ensureKuten(passive[sectionDef.key])}</div>`;
      } else {
        sectionBody = '';
      }

      el.insertAdjacentHTML('beforeend', `
        <div class="passive-scroll">
          <div class="passive-word-header">
            <div class="passive-word-str">${wordStr}</div>
            <div class="passive-word-sub">${pos} — ${meaning}</div>
          </div>
          ${sectionDef ? `
          <div class="passive-section">
            <div class="passive-section-title">${sectionDef.title}</div>
            ${sectionBody}
          </div>` : ''}
        </div>
        <div class="swipe-hint visible">
          <span class="swipe-arrow">↑</span>
          <span class="swipe-label">スワイプして次へ</span>
        </div>
      `);
    } else {
      // フォールバック（passiveデータなし）
      const example = getExample(wordStr, pos);
      el.insertAdjacentHTML('beforeend', `
        <div class="passive-label">既知語 — 流し読み</div>
        <div class="word-example" style="font-size:16px">${example.full}</div>
        <div class="word-pos">${wordStr} — ${meaning}</div>
        <div class="swipe-hint visible">
          <span class="swipe-arrow">↑</span>
          <span class="swipe-label">スワイプして次へ</span>
        </div>
      `);
    }

    this._markReady('perfect');
    return el;
  }

  // -------------------------------------------------------
  // 選択肢クリック共通処理
  // -------------------------------------------------------
  _handleChoice(cardEl, clickedBtn, choices, clickedIdx, isCorrect, onAnswered) {
    const btns = cardEl.querySelectorAll('.choice-btn');
    btns.forEach(b => (b.disabled = true));
    clickedBtn.classList.add(isCorrect ? 'correct' : 'wrong');

    if (!isCorrect) {
      choices.forEach((c, i) => { if (c.isCorrect) btns[i].classList.add('correct'); });
      cardEl.classList.add('card-shake');
      cardEl.addEventListener('animationend', () => cardEl.classList.remove('card-shake'), { once: true });
    }

    // 日本語訳トグルを有効化（Recall カード）
    const jaToggleBtn = cardEl.querySelector('.ja-toggle-row .ja-toggle-btn');
    if (jaToggleBtn) jaToggleBtn.disabled = false;

    if (onAnswered) onAnswered();

    this._markReady(isCorrect ? 'perfect' : 'wrong');
  }

  // -------------------------------------------------------
  // ベースカード DOM 生成
  // card を渡すと bgUrl を保存/再利用する
  // -------------------------------------------------------
  _baseCard(type, card, categoryId = 0) {
    const isRetry = card?.isRetry ?? false;
    const el = document.createElement('div');
    el.className = `card card-${type}`;
    this._cardEl = el;

    // 背景画像（初回は取得して card.bgUrl に保存、履歴再表示時は保存済みURLを使用）
    if (this._bg) {
      const url = card?.bgUrl ?? this._bg.getUrl(categoryId);
      if (url) {
        if (card && !card.bgUrl) card.bgUrl = url;
        const bg = document.createElement('div');
        bg.className = 'card-bg';
        bg.style.backgroundImage = `url(${url})`;
        el.appendChild(bg);
      }
    }

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

    return el;
  }

  _typeName(type) {
    return LABELS.cardTypes[type] ?? type;
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
  // 履歴ビュー（戻りスワイプで表示）
  // 元のカード表示をそのまま再現し、SRS に影響するアクションだけ無効化する
  // -------------------------------------------------------
  renderHistoryView(card) {
    this._ready       = false;
    this._result      = null;
    this._historyMode = true;

    const wordStr    = card.word.wordString;
    const rawWord    = typeof card.word.word === 'object' ? card.word.word : { word: wordStr, pos: 'other' };
    const pos        = rawWord.pos || 'other';
    const meaning    = getMeaning(wordStr, pos);
    const categoryId = rawWord.categoryId ?? 0;

    // onReady を一時的に抑制（render メソッド内部の _markReady 呼び出しを無視）
    const savedOnReady = this.onReady;
    this.onReady = () => {};

    let el;
    switch (card.cardType) {
      case 'intro':       el = this._renderIntro(card, wordStr, pos, meaning, categoryId); break;
      case 'recognition': el = this._renderRecognition(card, wordStr, pos, meaning, categoryId); break;
      case 'recall':      el = this._renderRecall(card, wordStr, pos, meaning, categoryId); break;
      case 'dictation':   el = this._renderDictation(card, wordStr, pos, categoryId); break;
      case 'handwrite':   el = this._renderHandwrite(card, wordStr, pos, categoryId); break;
      default:            el = this._renderPassive(card, wordStr, pos, meaning, categoryId); break;
    }

    this.onReady = savedOnReady;
    this._ready  = false;
    this._result = null;

    // 選択肢・入力・送信ボタン を無効化
    el.querySelectorAll('.choice-btn, #card-submit, #word-input').forEach(b => { b.disabled = true; });
    // handwrite の label ボタンも無効化
    el.querySelectorAll('.handwrite-photo-btn').forEach(b => { b.style.pointerEvents = 'none'; b.style.opacity = '0.4'; });

    // ユーザーの回答を復元して表示
    if (card.userAnswer) {
      if (card.cardType === 'recognition' || card.cardType === 'recall') {
        // 選んだボタンを正誤で色付け、不正解なら正解ボタンも緑に
        const correctText = card.cardType === 'recognition' ? meaning : wordStr;
        el.querySelectorAll('.choice-btn').forEach(btn => {
          if (btn.textContent === card.userAnswer) {
            btn.classList.add(card.result === 'wrong' ? 'wrong' : 'correct');
          }
          if (card.result === 'wrong' && btn.textContent === correctText) {
            btn.classList.add('correct');
          }
        });
      } else if (card.cardType === 'dictation') {
        // 入力値を復元して色付け、フィードバックも再表示
        const input = el.querySelector('#word-input');
        if (input) {
          input.value = card.userAnswer;
          input.className = `word-input ${card.result !== 'wrong' ? 'correct' : 'wrong'}`;
        }
        const fbArea = el.querySelector('#feedback-area');
        if (fbArea) {
          let fbClass, fbText;
          if      (card.result === 'perfect')   { fbClass = 'correct'; fbText = '✓ Perfect!'; }
          else if (card.result === 'near_miss') { fbClass = 'near';    fbText = `△ Near miss — 正解: ${wordStr}`; }
          else if (card.result === 'phonetic')  { fbClass = 'near';    fbText = `△ Phonetic match — 正解: ${wordStr}`; }
          else                                  { fbClass = 'wrong';   fbText = `✗ 不正解 — 正解: ${wordStr}`; }
          fbArea.innerHTML = `<div class="answer-feedback ${fbClass}">${fbText}</div>`;
        }
      } else if (card.cardType === 'handwrite') {
        // 写真送信済みの結果を復元（写真は保持しないが認識結果を表示）
        const previewArea = el.querySelector('#hw-preview-area');
        if (previewArea) {
          previewArea.innerHTML = `<div class="hw-preview"><div class="answer-feedback correct">✓ 「${card.userAnswer}」を認識しました</div></div>`;
        }
      }
    }

    // recall/intro の ja トグルは回答済み扱いでアクティブに
    if (card.cardType === 'recall' || card.cardType === 'intro') {
      const jaBtn = el.querySelector('.ja-toggle-btn');
      if (jaBtn) jaBtn.disabled = false;
    }

    // 履歴バッジを追加
    const histBadge = document.createElement('div');
    histBadge.className = 'card-type-badge badge-skipped';
    histBadge.style.cssText = 'position:absolute;top:16px;right:16px';
    histBadge.textContent = '履歴';
    el.style.position = 'relative';
    el.appendChild(histBadge);

    // スワイプヒントを「先へ」に差し替え
    const hint = el.querySelector('.swipe-hint');
    if (hint) {
      hint.classList.add('visible');
      const label = hint.querySelector('.swipe-label');
      if (label) label.textContent = 'スワイプして先へ';
    }

    this._animateInFromTop(el);
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
