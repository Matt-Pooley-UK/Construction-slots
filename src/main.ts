import { SIMULATION_SPIN_COUNT, SIMULATION_SPIN_COUNT_LARGE } from './game/simulate';
import {
  setBetMultiplier,
  setDenomination,
} from './state/store';
import { loadSymbolImages, hidePaytable, showPaytable, updateHud } from './view';
import {
  canStartSpin,
  initPlay,
  isAutoSpinning,
  queueForcedSpin,
  runSimulation,
  runSpin,
  startAutoSpin,
  syncUi,
} from './play';

loadSymbolImages();
initPlay();

document.querySelector('#spin')?.addEventListener('click', () => {
  if (!canStartSpin()) {
    return;
  }
  void runSpin();
});

document.querySelector('#auto')?.addEventListener('click', () => {
  startAutoSpin();
});

document.querySelector('#coin')?.addEventListener('change', (event) => {
  const value = Number((event.target as HTMLSelectElement).value);
  if (Number.isFinite(value)) {
    setDenomination(value);
    updateHud();
    syncUi();
  }
});

document.querySelector('#bet')?.addEventListener('change', (event) => {
  const value = Number((event.target as HTMLSelectElement).value);
  if (Number.isFinite(value)) {
    setBetMultiplier(value);
    updateHud();
    syncUi();
  }
});

document.querySelector('#paytable-btn')?.addEventListener('click', () => {
  showPaytable();
});

document.querySelector('#paytable-close')?.addEventListener('click', () => {
  hidePaytable();
});

document.querySelector('#paytable')?.addEventListener('click', (event) => {
  if (event.target === event.currentTarget) {
    hidePaytable();
  }
});

document.querySelector('#force-bonus')?.addEventListener('click', () => {
  queueForcedSpin('bonus');
});

document.querySelector('#force-hat')?.addEventListener('click', () => {
  queueForcedSpin('hat');
});

document.querySelector('#sim-10k')?.addEventListener('click', () => {
  if (isAutoSpinning()) {
    return;
  }
  runSimulation(SIMULATION_SPIN_COUNT);
});

document.querySelector('#sim-1m')?.addEventListener('click', () => {
  if (isAutoSpinning()) {
    return;
  }
  runSimulation(SIMULATION_SPIN_COUNT_LARGE);
});
