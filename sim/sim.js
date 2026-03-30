// sim/sim.js — シミュレーターUI制御

import { runScenario } from './sim-runner.js';
import { SCENARIOS } from './scenarios.js';
import { SimCharts } from './charts.js';

let currentResults = null;
let charts = null;

function init() {
  charts = new SimCharts();

  document.querySelectorAll('input[name="scenario"]').forEach(radio => {
    radio.addEventListener('change', updateScenarioDescription);
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

function setView(mode) {
  // mode: 'welcome' | 'results'
  document.getElementById('welcome-msg').style.display = mode === 'welcome' ? '' : 'none';
  document.getElementById('results-area').style.display = mode === 'results' ? 'block' : 'none';
}

async function onRun() {
  const sel = document.querySelector('input[name="scenario"]:checked')?.value ?? 'A';
  const scenario = SCENARIOS[sel];
  const btnRun = document.getElementById('btn-run');
  btnRun.disabled = true;
  btnRun.textContent = '実行中...';

  const progressEl = document.getElementById('progress');
  progressEl.style.display = 'block';
  progressEl.querySelector('.progress-bar').style.width = '0%';

  // UIを描画させてから重い処理を開始
  await new Promise(resolve => setTimeout(resolve, 16));

  try {
    currentResults = runScenario(sel, (day, total, snap) => {
      const pct = Math.round((day / total) * 100);
      progressEl.querySelector('.progress-bar').style.width = pct + '%';
      progressEl.querySelector('.progress-label').textContent =
        `${pct}% — 定着: ${snap.masteredCount}語`;
    });

    document.getElementById('results-title').textContent =
      `シナリオ ${sel}: ${scenario.name}`;

    charts.render(currentResults, scenario);
    setView('results');
  } finally {
    btnRun.disabled = false;
    btnRun.textContent = '▶ 実行';
    progressEl.style.display = 'none';
  }
}

function onReset() {
  currentResults = null;
  charts.clear();
  setView('welcome');
  document.getElementById('heatmap-day').value = 1;
}

document.addEventListener('DOMContentLoaded', init);
