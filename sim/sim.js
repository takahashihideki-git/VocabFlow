// sim/sim.js — シミュレーターUI制御

import { runSimulation, runScenario } from './sim-runner.js';
import { SCENARIOS } from './scenarios.js';
import { SimCharts } from './charts.js';

// -------------------------------------------------------
// UI 制御
// -------------------------------------------------------
let currentResults = null;
let charts = null;

function init() {
  charts = new SimCharts();

  // シナリオラジオボタン
  document.querySelectorAll('input[name="scenario"]').forEach(radio => {
    radio.addEventListener('change', () => updateScenarioDescription());
  });

  document.getElementById('btn-run').addEventListener('click', onRun);
  document.getElementById('btn-reset').addEventListener('click', onReset);

  updateScenarioDescription();
}

function updateScenarioDescription() {
  const sel = document.querySelector('input[name="scenario"]:checked')?.value ?? 'A';
  const sc = SCENARIOS[sel];
  document.getElementById('scenario-desc').textContent = sc?.description ?? '';
}

async function onRun() {
  const sel = document.querySelector('input[name="scenario"]:checked')?.value ?? 'A';
  const btnRun = document.getElementById('btn-run');
  btnRun.disabled = true;
  btnRun.textContent = '実行中...';

  const progressEl = document.getElementById('progress');
  progressEl.style.display = 'block';

  // 非同期で実行（UIをブロックしない）
  await new Promise(resolve => setTimeout(resolve, 10));

  try {
    currentResults = runScenario(sel, (day, total, snap) => {
      const pct = Math.round((day / total) * 100);
      progressEl.querySelector('.progress-bar').style.width = pct + '%';
      progressEl.querySelector('.progress-label').textContent = `Day ${day}/${total} — 定着: ${snap.masteredCount}語`;
    });

    charts.render(currentResults, SCENARIOS[sel]);
    document.getElementById('results-area').style.display = 'block';
  } finally {
    btnRun.disabled = false;
    btnRun.textContent = '実行';
    progressEl.style.display = 'none';
  }
}

function onReset() {
  currentResults = null;
  charts.clear();
  document.getElementById('results-area').style.display = 'none';
  document.getElementById('heatmap-day').value = 1;
}

document.addEventListener('DOMContentLoaded', init);
