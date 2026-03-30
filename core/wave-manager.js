// core/wave-manager.js — ウェーブ管理

export class WaveManager {
  constructor(config, learnerState) {
    this.config = config;
    this.state = learnerState;
  }

  // -------------------------------------------------------
  // 現在のアクティブウェーブ番号リスト
  // -------------------------------------------------------
  getActiveWaves() {
    return [...this.state.activeWaves];
  }

  // -------------------------------------------------------
  // 総ウェーブ数
  // -------------------------------------------------------
  get totalWaves() {
    return Math.ceil(this.config.totalWords / this.config.waveSize);
  }

  // -------------------------------------------------------
  // ウェーブ番号 → 単語インデックス範囲 [start, end)
  // -------------------------------------------------------
  waveRange(waveNumber) {
    const size = this.config.waveSize;
    const start = (waveNumber - 1) * size;
    const end = Math.min(start + size, this.state.words.length);
    return [start, end];
  }

  // -------------------------------------------------------
  // ウェーブ内の単語を返す
  // -------------------------------------------------------
  getWordsInWave(waveNumber) {
    const [start, end] = this.waveRange(waveNumber);
    return this.state.words.slice(start, end);
  }

  // -------------------------------------------------------
  // ウェーブの解放判定 → 必要なら activeWaves を更新
  // -------------------------------------------------------
  checkUnlock(currentTime) {
    const cfg = this.config;
    const maxWave = this.totalWaves;
    const events = [];

    // graduation チェック（アクティブ枠を空ける）
    const newActive = this.state.activeWaves.filter(wn => !this._isGraduated(wn));
    if (newActive.length < this.state.activeWaves.length) {
      this.state.activeWaves = newActive;
    }

    // 次ウェーブ解放チェック
    // 「最後に追加されたウェーブ番号」を追跡して、activeWaves が空でも継続できるようにする
    const highestEverActive = this.state.waveUnlockEvents.length > 0
      ? Math.max(...this.state.waveUnlockEvents.map(e => e.waveNumber))
      : Math.max(...this.state.activeWaves, 1);

    let candidateNext = highestEverActive;

    while (this.state.activeWaves.length < cfg.maxActiveWaves) {
      const nextWave = candidateNext + 1;
      if (nextWave > maxWave) break;

      // candidateNext の解放条件を確認（in active か graduated かで判断）
      if (!this._meetsUnlockCondition(candidateNext) && !this._isGraduated(candidateNext)) break;

      if (!this.state.activeWaves.includes(nextWave)) {
        this.state.activeWaves.push(nextWave);
        events.push({ waveNumber: nextWave, day: currentTime });
        this.state.waveUnlockEvents.push({ waveNumber: nextWave, day: currentTime });
        candidateNext = nextWave;
      } else {
        candidateNext = nextWave;
      }
    }

    return events;
  }

  // -------------------------------------------------------
  // ウェーブの解放条件を満たすか
  // -------------------------------------------------------
  _meetsUnlockCondition(waveNumber) {
    const cfg = this.config;
    const words = this.getWordsInWave(waveNumber);
    if (words.length === 0) return false;
    // peakH で判定（h の振動によるチラつきを防ぐ）
    const qualified = words.filter(w => w.peakH >= cfg.waveUnlockH && w.stage !== 'new').length;
    return qualified / words.length >= cfg.waveUnlockRatio;
  }

  // -------------------------------------------------------
  // ウェーブ卒業判定（大半がh > graduationH）
  // -------------------------------------------------------
  _isGraduated(waveNumber) {
    const cfg = this.config;
    const words = this.getWordsInWave(waveNumber);
    if (words.length === 0) return false;
    const graduated = words.filter(w => w.h >= cfg.graduationH).length;
    // 90%以上が卒業基準を超えたらアクティブ枠を解放
    return graduated / words.length >= 0.9;
  }

  // -------------------------------------------------------
  // アクティブウェーブ内の未学習単語を返す
  // -------------------------------------------------------
  getNewWordsFromActiveWaves() {
    const result = [];
    for (const wn of this.state.activeWaves) {
      const words = this.getWordsInWave(wn);
      result.push(...words.filter(w => w.stage === 'new'));
    }
    return result;
  }

  // -------------------------------------------------------
  // 全単語のウェーブ状態サマリー（ヒートマップ用）
  // -------------------------------------------------------
  getWaveSummary() {
    const summaries = [];
    for (let wn = 1; wn <= this.totalWaves; wn++) {
      const words = this.getWordsInWave(wn);
      summaries.push({
        waveNumber: wn,
        isActive: this.state.activeWaves.includes(wn),
        words,
      });
    }
    return summaries;
  }
}
