// app/ui-wordwave.js — Word Wave 全画面ビュー

import { getMeaning } from './ui-cards.js';
import { ProfileRenderer } from './ui-profile.js';
import { LABELS, formatH, formatPRecall, CONFIDENCE_MIN_REVIEWS, PROFILE_FAB_MIN_LEARNED } from '../core/labels.js';

// -------------------------------------------------------
// カラーティア（spec §2.3） — 階層別クラスを返す
// 配色・コントラスト調整は app.css 側で定義
// -------------------------------------------------------
const WW_TIER_CLASSES = [
  'ww-word--excluded',
  'ww-word--new',
  'ww-word--young',
  'ww-word--t0',
  'ww-word--t1',
  'ww-word--t2',
  'ww-word--t3',
  'ww-word--t4',
  'ww-word--t5',
];

// 波の先端＝未学習との境目から遡った非定着語を何語だけ animate するか（presentational）
const WW_FRONTIER_SIZE = 20;

// 信頼度卒業の閾値（CONFIDENCE_MIN_REVIEWS）は core/labels.js に一元化し
// Wave Heatmap（ui-heatmap.js）と共有する。rc がこの値未満の導入済み語は
// h ティア（水深ランプ）ではなく「出会ったばかり」の泡（ww-word--young）で一律表示。
// uncertaintyWidth ではなく reviewCount を使うのは、前者の staleFactor が
// 放置された熟知語を泡に再降格させ「確認された記憶強度」の意味と矛盾するため。
function getTierClass(word) {
  if (word.excluded) return 'ww-word--excluded';
  if (word.stage === 'new') return 'ww-word--new';
  if (word.reviewCount < CONFIDENCE_MIN_REVIEWS) return 'ww-word--young';
  const h = word.h;
  if (h < 1)  return 'ww-word--t0';
  if (h < 3)  return 'ww-word--t1';
  if (h < 7)  return 'ww-word--t2';
  if (h < 14) return 'ww-word--t3';
  if (h < 30) return 'ww-word--t4';
  return 'ww-word--t5';
}

// -------------------------------------------------------
// WordWaveRenderer
// -------------------------------------------------------
export class WordWaveRenderer {
  /**
   * @param {HTMLElement} overlayEl — #wordwave-overlay
   * @param {LearnerState} learnerState
   */
  constructor(overlayEl, learnerState, onStateChange = null) {
    this.overlay        = overlayEl;
    this.state          = learnerState;
    this._onStateChange = onStateChange;
    this._spanMap   = new Map(); // wordId → span element
    this._built     = false;
    this._bulkMode  = false;
    this._selected  = new Set(); // wordId（一括除外選択中）

    // 学習プロファイル（FAB から開く別 overlay）。state を共有し可視化のみ行う。
    const profileEl = document.getElementById('profile-overlay');
    this.profile = profileEl ? new ProfileRenderer(profileEl, learnerState) : null;

    this._bindEvents();
  }

  // -------------------------------------------------------
  // 公開 API
  // -------------------------------------------------------

  open() {
    if (!this._built) {
      this._build();
    } else {
      this._refreshAll();
    }
    this._updateStats();
    this._updateProfileFab();
    this.overlay.style.display = 'flex';
  }

  // 学習がある程度進んだら（learnedCount が PROFILE_FAB_MIN_LEARNED 以上）プロファイル FAB を出す。
  // プロファイルの中身は learned 全体から算出するため gate も learned で測る（mastered ではない）。
  // それ未満では誤答の渦チャートが疎で読み取れないため隠す。
  _updateProfileFab() {
    const fab = this.overlay.querySelector('#ww-profile-fab');
    if (!fab) return;
    const learned = this.state.words.filter(w => w.stage !== 'new' && !w.excluded).length;
    fab.style.display = learned >= PROFILE_FAB_MIN_LEARNED ? 'flex' : 'none';
  }

  close() {
    if (this._bulkMode) this._exitBulkMode();
    this.overlay.style.display = 'none';
    this._hidePopover();
  }

  isOpen() {
    return this.overlay.style.display !== 'none';
  }

  // カード回答後に単語の色を更新（overlay が非表示でもマップを更新しておく）
  updateWord(wordId) {
    const span = this._spanMap.get(wordId);
    if (!span) return;
    const word = this.state.words.find(w => w.wordId === wordId);
    if (!word) return;
    this._applyColor(span, word);
    this._updateWaveCleared(word.waveNumber);
    if (this.isOpen()) this._updateStats();
  }

  // wave 内の非除外語が全 mastered ならクリア
  _isWaveCleared(waveNumber) {
    const waveWords = this.state.words.filter(w => w.waveNumber === waveNumber && !w.excluded);
    return waveWords.length > 0 && waveWords.every(w => w.stage === 'mastered');
  }

  _updateWaveCleared(waveNumber) {
    const cleared = this._isWaveCleared(waveNumber);
    // クリア解除中: 過去に一度クリアした（everClearedWaves）が、降格で今は未達。
    // 金ラベルを剥がし ⚠ 破線に。旧 h ベースの色では降格語が深部マスター風に見えて
    // クリア解除が隠れていた（例: patient h=40 dictation 止まりで Wave1 が金のまま）。
    const ever = (this.state.everClearedWaves || []).includes(waveNumber);
    this.overlay.querySelectorAll(`.ww-wave-label[data-wave="${waveNumber}"]`).forEach(el => {
      el.classList.toggle('cleared', cleared);
      el.classList.toggle('revoked', ever && !cleared);
    });
  }

  _refreshAllWavesCleared() {
    const waveNumbers = [...new Set(this.state.words.map(w => w.waveNumber))];
    for (const wn of waveNumbers) this._updateWaveCleared(wn);
  }

  // -------------------------------------------------------
  // 初回 DOM 構築
  // -------------------------------------------------------
  _build() {
    const body  = this.overlay.querySelector('#wordwave-body');
    const words = this.state.words;

    let currentWave    = -1;
    let waveContainer  = null;

    for (const word of words) {
      const waveNum = word.waveNumber;

      if (waveNum !== currentWave) {
        currentWave = waveNum;

        // Wave ラベル（先頭に "W1" 等）
        const label = document.createElement('span');
        label.className  = 'ww-wave-label';
        label.innerHTML = `<span class="wave-icon"></span> Wave ${waveNum}`;
        label.dataset.wave = waveNum;
        body.appendChild(label);

        // Wave グループ（inline-block のラッパー）
        waveContainer = document.createElement('span');
        waveContainer.className   = 'ww-wave-group';
        waveContainer.dataset.wave = waveNum;
        body.appendChild(waveContainer);
      }

      const span = document.createElement('span');
      span.className = 'ww-word';
      span.textContent = word.wordString;
      span.dataset.wordId = word.wordId;
      this._applyColor(span, word);

      span.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this._bulkMode) {
          this._toggleBulkSelect(word.wordId, span);
        } else {
          this._showPopover(word);
        }
      });

      waveContainer.appendChild(span);
      this._spanMap.set(word.wordId, span);
    }

    this._refreshAllWavesCleared();
    this._applyFrontier();
    this._built = true;
  }

  _refreshAll() {
    for (const word of this.state.words) {
      const span = this._spanMap.get(word.wordId);
      if (span) this._applyColor(span, word);
    }
    this._refreshAllWavesCleared();
  }

  _applyColor(span, word) {
    span.classList.remove(...WW_TIER_CLASSES);
    span.classList.add(getTierClass(word));
    const isMastered = word.stage === 'mastered';
    span.classList.toggle('mastered', isMastered);
    // マスター済みを 2 状態に分岐（色＝確認された記憶「強度」→「現在の想起可能性」へ）:
    //   復習待ち（due）＝記憶が半減し復習ライン（pRecall < targetRetention）を割った＝泡リングで浮上
    //   安定（dormant）＝まだ復習ライン下に沈んでいる＝文字を落として休眠（深海で眠る）
    // 未マスター（学習中）はここに入らず、底の波（frontier ripple）で「まだ水面」を示す。
    const cfg = this.state.config;
    const due = isMastered && cfg &&
      word.pRecall(this.state.currentTime) < cfg.targetRetention;
    span.classList.toggle('ww-word--due', !!due);
    span.classList.toggle('ww-word--dormant', isMastered && !due);
  }

  // 波の先端: 未学習との境目（最後の学習済語）から遡って、非定着
  // （非mastered・非new・非excluded）の語を WW_FRONTIER_SIZE 個だけ ww-word--active に。
  // その語の波だけ生きて左右に傾く。深く沈んだ mastered は静止。
  _applyFrontier() {
    const words = this.state.words;
    this._spanMap.forEach(s => s.classList.remove('ww-word--active'));
    let frontier = -1;
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (w.stage !== 'new' && !w.excluded) frontier = i;
    }
    let count = 0;
    for (let i = frontier; i >= 0 && count < WW_FRONTIER_SIZE; i--) {
      const w = words[i];
      if (w.stage !== 'mastered' && w.stage !== 'new' && !w.excluded) {
        const span = this._spanMap.get(w.wordId);
        if (span) { span.classList.add('ww-word--active'); count++; }
      }
    }
  }

  // -------------------------------------------------------
  // Stats ヘッダ更新
  // -------------------------------------------------------
  _updateStats() {
    const words    = this.state.words;
    const total    = words.length;
    const learned  = words.filter(w => w.stage !== 'new' && !w.excluded).length;
    // 定着定義は stage === 'mastered' に統一（ヘッダ統計・Wave クリア判定・波の消失と一致）
    const mastered = words.filter(w => w.stage === 'mastered').length;
    const maxWave  = words.reduce(
      (max, w) => w.stage !== 'new' ? Math.max(max, w.waveNumber) : max, 1
    );
    // マスターを 2 分岐: 安定（復習ライン下に沈黙）/ 復習待ち（半減して浮上）。
    // avgH は熟達すると飽和して無意味化するため撤去（色チャネルが死ぬのと同根）。
    const cfg = this.state.config;
    const t   = this.state.currentTime;
    const dueMastered = cfg
      ? words.filter(w => w.stage === 'mastered' && w.pRecall(t) < cfg.targetRetention).length
      : 0;
    const stable = mastered - dueMastered;

    const statsEl = this.overlay.querySelector('#wordwave-stats');
    if (statsEl) {
      const L = LABELS.wordwave;
      statsEl.innerHTML =
        `<span>${L.reached}: <b>${learned}/${total}</b></span>` +
        `<span class="ww-stat-mastered">${L.mastered}: <b>${mastered}</b></span>` +
        `<span class="ww-stat-sub">` +
          `<span class="ww-stat-stable">${L.stable} <b>${stable}</b></span>` +
          `<span class="ww-stat-due">${L.reviewWait} <b>${dueMastered}</b></span>` +
        `</span>`;
    }

    const waveEl = this.overlay.querySelector('#wordwave-wave');
    if (waveEl) {
      waveEl.textContent = `Wave ${maxWave}`;
    }

    const timeEl = this.overlay.querySelector('#wordwave-time');
    if (timeEl) {
      timeEl.textContent = `Day ${Math.floor(this.state.currentTime)}`;
    }

    // アクティブウェーブのラベルを強調
    const activeSet = new Set(this.state.activeWaves);
    this.overlay.querySelectorAll('.ww-wave-label').forEach(el => {
      el.classList.toggle('active', activeSet.has(parseInt(el.dataset.wave)));
    });

    // 波の先端アニメを現在の stage 分布に追従させる（定着が進むと前線が前進）
    this._applyFrontier();

    // ペース予測セクション更新（潮の状態 + 全Wave クリア予測）
    const paceEl = this.overlay.querySelector('#ww-pace-section');
    if (paceEl) {
      // 定着判定は stage === 'mastered' に統一（全Wave クリア予測を Wave クリア判定と一致させる）
      const target      = words.filter(w => !w.excluded).length;
      const masteredNow = words.filter(w => !w.excluded && w.stage === 'mastered').length;
      const currentDay  = this.state.currentTime;
      const remaining   = target - masteredNow;

      if (remaining === 0) {
        paceEl.innerHTML = `<span class="ww-pace-complete">🏆 全Wave クリア</span>`;
      } else {
        // --- 潮の状態（足元のリズム）→ 水位・波の荒さ/向きにマッピング ---
        const tide  = this._computeTide();
        const state = tide ? tide.state : 'slack';
        const cfg   = this.state.config;
        let tideInner;
        // 引き潮の水位を「満ち潮までの距離」で連続化: 復習需要が重いほど低い水位
        // （旧: ebb は一律 52%。これだと需要 20 でも 107 でも同じ見た目でハードルが見えなかった）
        let lvlStyle = '';
        if (state === 'flood') {
          tideInner = `<span class="wave-icon"></span> いまは満ち潮 — 新しい単語が次々と入ってくる時期です`;
        } else if (state === 'ebb' && tide) {
          // 正直予測: 「待てば満ちる」ではなく「復習を片づけると満ちる」。
          // 主＝作業量（あとN語・約Mセッション）、従＝直近実測ペースの日数（減らなければ明示）。
          const hurdle   = tide.hurdle;
          const sessions = Math.max(1, Math.ceil(hurdle / cfg.sessionSize));
          const netDrain = tide.throughput - tide.influx;   // 1日あたり正味の消化（湧き水を差引）
          let cal;
          if (netDrain > 0.5) {
            const d = Math.max(1, Math.round(hurdle / netDrain));
            cal = `（現ペースだと約${d}日）`;
          } else {
            cal = `（現ペースでは復習待ちが減りません — 1日の学習量を増やすと満ちます）`;
          }
          tideInner = `🐚 いまは引き潮 — 復習待ち <b>${tide.reviewDemand}語</b>。`
            + `<span class="ww-tide-hurdle">満ち潮まで あと約${hurdle}語（約${sessions}セッション）</span>${cal}`;
          // 連続水位: 需要 floodThresh(=17) で満ち潮直前(60%)、深い渋滞(3セッション超)で 44%
          const floodThresh = cfg.sessionSize - tide.floodSlots;
          const deepDemand  = cfg.sessionSize * 3;
          const prog = Math.min(1, Math.max(0,
            (deepDemand - tide.reviewDemand) / (deepDemand - floodThresh)));
          lvlStyle = ` style="--lvl:${(44 + 16 * prog).toFixed(0)}%"`;
        } else {
          tideInner = `🌙 いまは凪 — 復習も新語もおだやかな時期です`;
        }

        // --- 全Wave クリア予測（遠くの目的地・海底に沈める） ---
        // Tide の正直予測と整合させる: 引き潮で復習待ちが減らない（netDrain≤0）＝新語が入らない
        // ＝マスターが伸びない＝現ペースでは到達しない。生涯平均 masteredNow/currentDay で
        // 楽観外挿すると「復習は減らないが156日で全クリア」という自己矛盾になる（Tide と同じ不正直）。
        const netDrain = tide ? tide.throughput - tide.influx : 1;
        const stalled  = state === 'ebb' && netDrain <= 0.5;
        let goalInner;
        if (stalled) {
          // Tide 行が既に「復習待ちが減りません — 復習を崩せ」と言うため、全Wave 予測は出さない
          // （出すと同じ趣旨の繰り返し＋生涯平均での楽観外挿は自己矛盾になる）。
          goalInner = '';
        } else if (masteredNow < 10 || currentDay < 1) {
          goalInner = `<span class="ww-pace-waiting">定着語が増えると 全Wave クリアまでの予測が表示されます</span>`;
        } else {
          const pace     = masteredNow / currentDay;
          const daysLeft = Math.round(remaining / pace);
          const estDay   = Math.round(currentDay + daysLeft);
          goalInner =
            `<span class="ww-pace-label">このペースなら</span> ` +
            `<span class="wave-icon"></span> 全Wave クリアまで<b>約${daysLeft}日</b>（Day ${estDay} 頃）`;
        }

        // --- 一枚の水中シーンに組み立て ---
        const P = 'M-160 44c30 0 58-18 88-18s 58 18 88 18 58-18 88-18 58 18 88 18 v44h-352z';
        paceEl.innerHTML =
          `<div class="ww-tide-scene ww-tide--${state}"${lvlStyle}>` +
            `<div class="ww-tide-water"></div>` +
            `<svg class="ww-tide-waves" viewBox="0 24 150 28" preserveAspectRatio="none" shape-rendering="auto" xmlns="http://www.w3.org/2000/svg">` +
              `<defs><path id="ww-tide-wave" d="${P}"/></defs>` +
              `<g class="parallax">` +
                `<use href="#ww-tide-wave" x="48" y="0" fill="rgba(180,232,240,0.55)"/>` +
                `<use href="#ww-tide-wave" x="48" y="3" fill="rgba(110,196,214,0.45)"/>` +
                `<use href="#ww-tide-wave" x="48" y="5" fill="rgba(58,120,180,0.45)"/>` +
                `<use href="#ww-tide-wave" x="48" y="7" fill="#1d4a86"/>` +
              `</g>` +
            `</svg>` +
            `<span class="ww-tide-bubble"></span><span class="ww-tide-bubble"></span><span class="ww-tide-bubble"></span>` +
            `<div class="ww-sea-floor"></div>` +
            `<div class="ww-tide-line">${tideInner}</div>` +
            (goalInner ? `<div class="ww-goal-line">${goalInner}</div>` : '') +
          `</div>`;
      }
    }
  }

  // -------------------------------------------------------
  // 潮の状態判定（次セッションの新語枠の埋まり方から）
  //
  // feed-generator の貪欲割当（skipped→urgent→due→new）を先読みし、
  // 次セッションで新語が何枠入るか（newSlots）を見積もる:
  //   満ち潮 (flood): newSlots >= 3 — 新語が入ってくる時期
  //   引き潮 (ebb)  : 復習需要が枠を埋め、新語が押し出されている時期
  //   凪    (slack) : 復習も新語も少ない穏やかな時期（終盤など）
  // -------------------------------------------------------
  _computeTide() {
    const cfg = this.state.config;
    if (!cfg) return null;

    const t  = this.state.currentTime;
    const rf = Math.log2(1 / cfg.targetRetention);
    const activeSet = new Set(this.state.activeWaves);

    // 正直予測の材料も同時に集める:
    //   influx      = 明日 due になる学習済語数（optimalNextReview ∈ (t, t+1]）＝復習の湧き水
    //   recentDone  = 直近 RK 日に触れた学習済語数 → 実処理速度 throughput（生涯平均でなく直近実測）
    const RK = 7, winStart = t - RK;
    let skipped = 0, urgent = 0, due = 0, newAvail = 0, influx = 0, recentDone = 0;
    for (const w of this.state.words) {
      if (w.excluded) continue;
      if (w.skipped)  { skipped++; continue; }
      if (w.stage === 'new') {
        if (activeSet.has(w.waveNumber)) newAvail++;
        continue;
      }
      // 学習済語（optimalNextReview は pRecall=targetRetention の交点＝全 stage 共通）
      const optimalNextReview = w.lastReviewed + (w.h > 0 ? w.h * rf : 0);
      if (w.lastReviewed > winStart) recentDone++;
      if (optimalNextReview > t && optimalNextReview <= t + 1) influx++;
      const p = w.pRecall(t);
      if (w.stage === 'mastered') {
        if (p < 0.5) urgent++;
        else if (p < cfg.targetRetention) due++;
        continue;
      }
      if (p < 0.5) { urgent++; continue; }
      if (t >= optimalNextReview) due++;
    }

    const floodSlots   = 3;
    const reviewDemand = skipped + urgent + due;
    const newSlots = Math.min(
      newAvail,
      Math.max(0, cfg.sessionSize - reviewDemand),
      cfg.maxNewPerSession
    );

    let state;
    if (newSlots >= floodSlots) state = 'flood';
    else if (reviewDemand >= cfg.sessionSize - (floodSlots - 1)) state = 'ebb';
    else state = 'slack';

    // 満ち潮に必要な残り復習量（作業量・語）と直近実測の消化速度
    const hurdle     = Math.max(0, reviewDemand - (cfg.sessionSize - floodSlots));
    const throughput = recentDone / Math.min(RK, Math.max(1, t));  // 語/日（直近実測）

    return { state, reviewDemand, newSlots, floodSlots, influx, throughput, hurdle };
  }

  // -------------------------------------------------------
  // 単語ポップオーバー
  // -------------------------------------------------------
  _showPopover(word) {
    const rawWord  = typeof word.word === 'object' ? word.word : { word: word.wordString, pos: 'other' };
    const pos      = rawWord.pos || 'other';
    const phonetic = rawWord.phonetic || '';
    const meaning  = getMeaning(word.wordString, pos);

    const stageName = LABELS.cardTypes[word.stage]
      ?? (word.stage === 'new' ? '未学習' : word.stage === 'mastered' ? 'Mastered' : word.stage);

    const popover = this.overlay.querySelector('#word-popover');
    popover.innerHTML = `
      <div class="ww-pop-word">${word.wordString}</div>
      ${phonetic ? `<div class="ww-pop-phonetic">${phonetic}</div>` : ''}
      <div class="ww-pop-meaning">${meaning}</div>
      <div class="ww-pop-divider"></div>
      <div class="ww-pop-row"><span>Stage</span><span>${stageName}</span></div>
      <div class="ww-pop-row"><span>${LABELS.params.h}</span><span>${formatH(word.h)}</span></div>
      <div class="ww-pop-row"><span>${LABELS.params.peakH}</span><span>${formatH(word.peakH)}</span></div>
      <div class="ww-pop-row"><span>${LABELS.params.pRecall}</span><span>${word.stage === 'new' ? '—' : formatPRecall(word.pRecall(this.state.currentTime))}</span></div>
      <div class="ww-pop-row"><span>最終復習</span><span>${word.lastReviewed > 0 ? `Day ${Math.floor(word.lastReviewed)}` : '—'}</span></div>
      <div class="ww-pop-row"><span>${LABELS.params.reviewCount}</span><span>${word.reviewCount}回 (正解${word.correctCount})</span></div>
      <div class="ww-pop-divider"></div>
      <button class="ww-pop-exclude-btn${word.excluded ? ' restore' : ''}" id="ww-pop-exclude-btn">
        ${word.excluded ? '除外を解除' : '除外する'}
      </button>
      <button class="ww-pop-close-btn" id="ww-pop-close-btn">閉じる</button>
    `;
    popover.style.display = 'flex';

    popover.querySelector('#ww-pop-exclude-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleExclude(word);
    });

    popover.querySelector('#ww-pop-close-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      this._hidePopover();
    });
  }

  _hidePopover() {
    const popover = this.overlay.querySelector('#word-popover');
    if (popover) popover.style.display = 'none';
  }

  _toggleExclude(word) {
    if (!word.excluded) {
      if (!confirm(`"${word.wordString}" を学習対象から除外しますか？（後から戻せます）`)) return;
      word.excluded = true;
    } else {
      word.excluded = false;
    }
    this._onStateChange?.();
    this.updateWord(word.wordId);
    // ポップオーバーのボタンテキストを更新
    this._showPopover(word);
  }

  // -------------------------------------------------------
  // 一括除外モード
  // -------------------------------------------------------
  _enterBulkMode() {
    this._bulkMode = true;
    this._selected.clear();
    this._hidePopover();
    this.overlay.classList.add('bulk-mode');
    this.overlay.querySelector('#wordwave-bulk-bar').style.display = 'flex';
    this._updateBulkCount();
  }

  _exitBulkMode() {
    this._bulkMode = false;
    this._selected.clear();
    this.overlay.classList.remove('bulk-mode');
    this.overlay.querySelector('#wordwave-bulk-bar').style.display = 'none';
    // 選択ハイライトを解除
    this._spanMap.forEach((span) => span.classList.remove('selected'));
  }

  _toggleBulkSelect(wordId, span) {
    const word = this.state.words.find(w => w.wordId === wordId);
    // すでに除外済みの語は選択不可
    if (word?.excluded) return;

    if (this._selected.has(wordId)) {
      this._selected.delete(wordId);
      span.classList.remove('selected');
    } else {
      this._selected.add(wordId);
      span.classList.add('selected');
    }
    this._updateBulkCount();
  }

  _updateBulkCount() {
    const el = this.overlay.querySelector('#ww-bulk-count');
    if (el) el.textContent = `${this._selected.size}語を選択中`;
  }

  _confirmBulk() {
    if (this._selected.size === 0) { this._exitBulkMode(); return; }
    if (!confirm(`選択中の ${this._selected.size} 語を学習対象から除外しますか？`)) return;
    for (const wordId of this._selected) {
      const word = this.state.words.find(w => w.wordId === wordId);
      if (word) {
        word.excluded = true;
        const span = this._spanMap.get(wordId);
        if (span) {
          span.classList.remove('selected');
          this._applyColor(span, word);
        }
      }
    }
    this._onStateChange?.();
    this._exitBulkMode();
    this._updateStats();
  }

  // -------------------------------------------------------
  // イベントバインド
  // -------------------------------------------------------
  _bindEvents() {
    // 閉じるボタン
    const closeBtn = this.overlay.querySelector('#wordwave-close');
    if (closeBtn) closeBtn.addEventListener('click', () => this.close());

    // 学習プロファイル FAB
    const profileFab = this.overlay.querySelector('#ww-profile-fab');
    if (profileFab && this.profile) profileFab.addEventListener('click', (e) => {
      e.stopPropagation();
      this.profile.open();
    });

    // 一括除外ボタン（モード中はもう一度押すとキャンセル）
    const bulkBtn = this.overlay.querySelector('#ww-bulk-btn');
    if (bulkBtn) bulkBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this._bulkMode) this._exitBulkMode();
      else this._enterBulkMode();
    });

    // 一括除外バー: OK / Cancel
    const bulkOk = this.overlay.querySelector('#ww-bulk-ok');
    if (bulkOk) bulkOk.addEventListener('click', (e) => {
      e.stopPropagation();
      this._confirmBulk();
    });

    const bulkCancel = this.overlay.querySelector('#ww-bulk-cancel');
    if (bulkCancel) bulkCancel.addEventListener('click', (e) => {
      e.stopPropagation();
      this._exitBulkMode();
    });

    // ズームスライダー
    const slider = this.overlay.querySelector('#zoom-slider');
    if (slider) {
      slider.addEventListener('input', (e) => {
        const body = this.overlay.querySelector('#wordwave-body');
        body.style.fontSize = `${e.target.value}px`;
      });
    }

    // overlay クリック（単語以外）でポップオーバーを閉じる
    this.overlay.addEventListener('click', () => this._hidePopover());

    // ESC キーで閉じる
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) {
        e.preventDefault();
        this.close();
      }
    });
  }
}
