import { playReelStop, playWin } from './audio';
import { getBetTier, getBetTierFromWager } from './game/bets';
import {
  BONUS_WHEEL_OUTCOMES,
  BONUS_WHEEL_SECTIONS,
  UPGRADE_WHEEL_OUTCOMES,
  UPGRADE_WHEEL_SECTIONS,
  describeBonusWheelOutcome,
  getBonusWheelLandingRotation,
  getBonusWheelSectionById,
  labelJackpotWheelSections,
  pickBonusWheelSectionIndex,
  type BonusWheelSection,
} from './game/bonusWheel';
import {
  HAT_BLUE_REDIRECT_GAP_MS,
  HAT_BLUE_REDIRECT_MS,
  HAT_BONUS_FREE_SPINS,
  HAT_BONUS_REVEAL_DELAY_MS,
  HAT_COLOR_TRANSITION_MS,
  POWER_SAW_STEP_MS,
  POWER_SAW_SWEEP_GAP_MS,
  REEL_COUNT,
  ROWS,
  SUPER_HAT_PAYLINES,
  SUPER_HAT_ROWS,
  type GridPosition,
  type JackpotId,
} from './game/config';
import { evaluateSpin, type SpinEvaluation } from './game/evaluate';
import { spinReelsForcedBonus, spinReelsForcedHat } from './game/forcedSpin';
import {
  applyHatBonusSpin,
  applyPowerSawPaint,
  buildTallBonusIntroGrid,
  createHatBonusState,
  describeHatBonusMode,
  excludeRedirectTargetTransitions,
  expandBonusPositionsForTallGrid,
  findBonusPositions,
  getFlagNeighborPositions,
  getHatBonusRowCount,
  isBonusKeepingMode,
  isBuzzSawBonusMode,
  isTallBonusMode,
  resolveHatBonusPrizes,
  sortBonusPositionsReadingOrder,
  type HatBonusCell,
  type HatBonusMode,
  type HatBonusState,
} from './game/hatBonus';
import { formatJackpotShortLabel, getJackpotPayout } from './game/jackpots';
import {
  SUPER_HAT_SIZES,
  cellsCoveredByMegaHat,
  pickMegaHatSize,
  randomMegaHatPlacement,
} from './game/megaHat';
import { formatWin, formatWinCredits } from './game/money';
import {
  contributeToProgressiveJackpots,
  isProgressiveJackpot,
  resetProgressiveJackpot,
  type ProgressiveJackpotPool,
} from './game/progressiveJackpots';
import {
  SIMULATION_SPIN_COUNT_LARGE,
  simulatePaidSpins,
} from './game/simulate';
import { spinReels, type SpinResult } from './game/spin';
import { renderSimulationReport } from './simulationReport';
import type { SymbolId } from './game/symbols';
import {
  addFreeSpins,
  addHatBonusSessionWon,
  consumeFreeSpin,
  setBalance,
  setFreeSpinSession,
  setHatBonus,
  setProgressiveJackpots,
  setSpinning,
  state,
} from './state/store';
import {
  animateReels,
  animateWheel,
  columnHas,
  drawGrid,
  drawWheel,
  getActiveRows,
  getWinBannerTitle,
  hideBanner,
  hideWheel,
  isTestMode,
  setActiveRows,
  setControlsLocked,
  setSpinLabel,
  setStatus,
  setupTestMode,
  showBanner,
  showWheel,
  updateHud,
} from './view';

export type ForcedSpinKind = 'bonus' | 'hat';

const auto = { active: false, remaining: 0, total: 0 };
let revealing = false;
let wheelOpen = false;
let hatBonusSessionCompleted = false;
const openingSpin = spinReels();
let displayGrid: SymbolId[][] = openingSpin.grid;
let displayStops: number[] = openingSpin.stops;
let forcedSpin: ForcedSpinKind | null = null;
let forcedWheelSectionId: string | null = null;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function awardJackpotPayout(
  jackpot: JackpotId,
  bet: number,
  pool: ProgressiveJackpotPool,
  denomination: number
): { payout: number; pool: ProgressiveJackpotPool } {
  const payout = getJackpotPayout(jackpot, bet, 1, pool, denomination);
  return {
    payout,
    pool: isProgressiveJackpot(jackpot)
      ? resetProgressiveJackpot(pool, jackpot, denomination)
      : pool,
  };
}

function formatPrize(
  value: number,
  denomination: number,
  options?: { creditsOnly?: boolean; sign?: boolean }
): string {
  if (options?.creditsOnly) {
    return formatWinCredits(value, denomination, {
      sign: options.sign ?? false,
    });
  }

  return formatWin(value, denomination, { sign: options?.sign ?? true });
}

function formatSpinResult(
  evaluation: SpinEvaluation,
  denomination: number,
  options: { includeHatTrigger?: boolean } = {}
): string | null {
  const { includeHatTrigger = true } = options;
  const parts: string[] = [];

  for (const win of evaluation.paylineWins) {
    const wildBoost =
      win.wildMultiplier > 1 ? ` x${win.wildMultiplier} wild` : '';
    parts.push(
      `${win.paylineName}: ${win.matchCount}x ${win.symbol}${wildBoost} (${formatWin(win.payout, denomination, { sign: true })})`
    );
  }

  if (evaluation.bonusWin) {
    parts.push(
      `BONUS x${evaluation.bonusWin.count} (${formatWin(evaluation.bonusWin.payout, denomination, { sign: true })}) — Bonus Wheel!`
    );
  }

  if (includeHatTrigger && evaluation.hatTrigger) {
    parts.push(`Crown x${evaluation.hatTrigger.count} — Crown Bonus!`);
  }

  if (parts.length === 0) {
    return null;
  }

  return `Win! ${parts.join(' | ')} — Total ${formatWin(evaluation.totalPayout, denomination, { sign: true })}`;
}

function joinSpinStatus(
  ...parts: Array<string | null | undefined>
): string | null {
  const message = parts.filter((part): part is string => Boolean(part)).join(' | ');
  return message || null;
}

function paintGrid(
  grid: SymbolId[][] = displayGrid,
  hatCells: HatBonusCell[] = state.hatBonus?.cells ?? [],
  highlights: GridPosition[] = []
) {
  displayGrid = grid;
  drawGrid(grid, hatCells, highlights);
}

function usingHatBonus() {
  return Boolean(state.hatBonus && state.hatBonus.spinsRemaining > 0);
}

function usingFreeSpin() {
  return !usingHatBonus() && state.freeSpinsRemaining > 0;
}

function canAffordSpin() {
  return usingHatBonus() || usingFreeSpin() || state.balance >= state.bet;
}

export function isBusy() {
  return state.spinning || revealing || wheelOpen;
}

export function isAutoSpinning() {
  return auto.active;
}

export function canStartSpin() {
  return !isBusy() && canAffordSpin();
}

export function getSpinLabel() {
  if (wheelOpen) {
    return 'BONUS WHEEL';
  }
  if (revealing) {
    return 'REVEALING...';
  }
  if (state.spinning) {
    return 'SPINNING...';
  }
  if (usingHatBonus()) {
    return 'CROWN SPIN';
  }
  if (usingFreeSpin()) {
    return 'FREE SPIN';
  }
  if (!canAffordSpin()) {
    return 'NO FUNDS';
  }
  return 'SPIN';
}

export function getAutoLabel() {
  if (!auto.active) {
    return 'AUTO SPIN';
  }
  return `${auto.total - auto.remaining + 1}/${auto.total}`;
}

export function syncUi() {
  updateHud();
  setSpinLabel(getSpinLabel());
  const autoButton = document.querySelector('#auto') as HTMLButtonElement | null;
  if (autoButton) {
    autoButton.textContent = getAutoLabel();
  }
  const lockChrome = isBusy() && !auto.active;
  setControlsLocked(lockChrome || auto.active);
  if (autoButton) {
    autoButton.disabled = !auto.active && !canStartSpin();
  }
  const spin = document.querySelector('#spin') as HTMLButtonElement | null;
  if (spin) {
    spin.disabled = !canStartSpin();
  }
}

function showWin(
  payout: number,
  bet: number,
  options?: { persist?: boolean; creditsOnly?: boolean; denomination?: number }
) {
  if (payout <= 0) {
    return;
  }

  const denomination = options?.denomination ?? state.denomination;
  showBanner(
    getWinBannerTitle(payout, bet),
    options?.creditsOnly
      ? formatPrize(payout, denomination, { creditsOnly: true })
      : formatPrize(payout, denomination),
    options?.persist
  );
}

function writeHatBonus(next: HatBonusState | null, resetSession = false) {
  if (resetSession) {
    setHatBonus(null);
  }
  setHatBonus(next);
}

function beginFreeSpinSession() {
  setFreeSpinSession({ active: true, totalWon: 0 });
}

function clearFreeSpinSession() {
  setFreeSpinSession({ active: false, totalWon: 0 });
}

function addToFreeSpinSession(amount: number) {
  if (!state.freeSpinSession.active || amount === 0) {
    return;
  }
  setFreeSpinSession({
    active: true,
    totalWon: state.freeSpinSession.totalWon + amount,
  });
}

function restoreBaseReelLayout() {
  if (getActiveRows() !== ROWS) {
    setActiveRows(ROWS);
    displayGrid = displayGrid.map((column) => column.slice(0, ROWS));
    if ((displayGrid[0]?.length ?? 0) < ROWS) {
      const fresh = spinReels();
      displayGrid = fresh.grid;
      displayStops = fresh.stops;
    }
  }
}

function startHatBonusSession(
  positions: GridPosition[],
  betAmount: number,
  mode: HatBonusMode = 'hat'
) {
  const hatState = createHatBonusState(
    positions,
    betAmount,
    HAT_BONUS_FREE_SPINS,
    mode,
    state.denomination
  );
  writeHatBonus(hatState, true);
  paintGrid(displayGrid, hatState.cells);
  return hatState;
}

async function startMegaHatSession(betAmount: number, tall = false) {
  revealing = true;
  const mode: HatBonusMode = tall ? 'superHat' : 'megaHat';
  setStatus(`${describeHatBonusMode(mode)} — spinning...`);
  syncUi();

  try {
    if (tall) {
      setActiveRows(SUPER_HAT_ROWS);
    }
    const size = pickMegaHatSize(tall ? SUPER_HAT_SIZES : undefined);
    const placement = randomMegaHatPlacement(
      size,
      tall ? SUPER_HAT_ROWS : ROWS
    );
    const covered = cellsCoveredByMegaHat(placement);
    const intro: SymbolId[][] = Array.from({ length: REEL_COUNT }, () =>
      Array.from({ length: tall ? SUPER_HAT_ROWS : ROWS }, () => 'HAT' as SymbolId)
    );
    paintGrid(intro);
    await delay(800);
    const hatState = startHatBonusSession(covered, betAmount, mode);
    setStatus(
      `${describeHatBonusMode(mode)} — ${covered.length} cells locked — ${hatState.spinsRemaining} free spins`
    );
    return hatState;
  } finally {
    revealing = false;
    syncUi();
  }
}

async function paintSweepCells(
  starts: GridPosition[],
  mode: HatBonusMode,
  existing: HatBonusCell[] = []
) {
  let cells = existing;
  const rowCount = getHatBonusRowCount(mode);
  for (const start of sortBonusPositionsReadingOrder(starts)) {
    const neighbors = getFlagNeighborPositions(start, REEL_COUNT, rowCount);
    for (const position of neighbors) {
      cells = applyPowerSawPaint(cells, position, mode);
      paintGrid(displayGrid, cells);
      await delay(POWER_SAW_STEP_MS);
    }
    await delay(POWER_SAW_SWEEP_GAP_MS);
  }
  return cells;
}

async function startBuzzSawSession(
  grid: SymbolId[][],
  betAmount: number,
  mode: Extract<HatBonusMode, 'buzzSaw' | 'superBuzzSaw'>,
  stops: number[],
  isFreeSpin: boolean
) {
  revealing = true;
  const triggerPositions = findBonusPositions(grid);
  setStatus(`${describeHatBonusMode(mode)} — waving...`);
  syncUi();

  try {
    if (mode === 'superBuzzSaw') {
      setActiveRows(SUPER_HAT_ROWS);
      displayGrid = buildTallBonusIntroGrid(grid, stops, isFreeSpin);
      paintGrid(displayGrid);
    }
    const starts =
      mode === 'superBuzzSaw'
        ? expandBonusPositionsForTallGrid(triggerPositions)
        : triggerPositions;
    const cells = await paintSweepCells(starts, mode);
    const buzzState: HatBonusState = {
      bet: betAmount,
      denomination: state.denomination,
      spinsRemaining: HAT_BONUS_FREE_SPINS,
      cells,
      blueHitPayout: 0,
      mode,
    };
    writeHatBonus(buzzState, true);
    paintGrid(displayGrid, buzzState.cells);
    return buzzState;
  } finally {
    revealing = false;
    syncUi();
  }
}

function waitForWheelClick(): Promise<void> {
  return new Promise((resolve) => {
    const button = document.querySelector('#wheel-spin') as HTMLButtonElement;
    const onClick = () => {
      button.removeEventListener('click', onClick);
      resolve();
    };
    button.addEventListener('click', onClick);
  });
}

function sectionIndex(sections: BonusWheelSection[], target: BonusWheelSection) {
  const exact = sections.findIndex((section) => section.id === target.id);
  if (exact >= 0) {
    return exact;
  }
  const base = target.id.replace(/-b$/, '');
  return Math.max(
    0,
    sections.findIndex(
      (section) => section.id === base || section.id.replace(/-b$/, '') === base
    )
  );
}

async function openBonusWheel(
  sections: BonusWheelSection[],
  title: string,
  hint: string,
  forced?: BonusWheelSection
): Promise<BonusWheelSection> {
  const betTier = getBetTier(state.denomination, state.betMultiplier);
  const labeled = labelJackpotWheelSections(sections, betTier);
  wheelOpen = true;
  hideBanner();
  showWheel(title, hint);
  syncUi();

  try {
    const index = forced
      ? sectionIndex(labeled, forced)
      : pickBonusWheelSectionIndex(labeled);
    drawWheel(labeled, 0);
    await waitForWheelClick();
    const landing = getBonusWheelLandingRotation(index, labeled.length, 0);
    await animateWheel(labeled, landing);
    await delay(500);
    return labeled[index];
  } finally {
    hideWheel();
    wheelOpen = false;
    syncUi();
  }
}

async function playBonusWheel(): Promise<BonusWheelSection> {
  const forcedId = forcedWheelSectionId;
  forcedWheelSectionId = null;

  if (forcedId) {
    const forced = getBonusWheelSectionById(forcedId);
    if (forced && forced.outcome.type !== 'upgrade') {
      return openBonusWheel(
        BONUS_WHEEL_SECTIONS,
        'Bonus Wheel',
        'Spin the wheel to choose your bonus!',
        forced
      );
    }
    if (forced?.outcome.type === 'upgrade') {
      return openBonusWheel(
        UPGRADE_WHEEL_SECTIONS,
        'Upgrade Wheel',
        'Spin for an upgraded bonus!'
      );
    }
  }

  const main = await openBonusWheel(
    BONUS_WHEEL_SECTIONS,
    'Bonus Wheel',
    'Spin the wheel to choose your bonus!'
  );
  if (main.outcome.type !== 'upgrade') {
    return main;
  }
  return openBonusWheel(
    UPGRADE_WHEEL_SECTIONS,
    'Upgrade Wheel',
    'Spin for an upgraded bonus!'
  );
}

async function playHatBonusReveal(hatState: HatBonusState): Promise<number> {
  revealing = true;
  const bonusLabel = describeHatBonusMode(hatState.mode);
  syncUi();

  try {
    const result = resolveHatBonusPrizes(hatState, state.progressiveJackpots);
    setProgressiveJackpots(result.progressivePool);
    const revealed = new Map<string, HatBonusCell>();
    for (const cell of hatState.cells) {
      revealed.set(`${cell.reel}:${cell.row}`, { ...cell, prize: null });
    }
    paintGrid(displayGrid, [...revealed.values()]);
    setStatus(`${bonusLabel} — revealing prizes...`);

    for (let index = 0; index < result.reveals.length; index++) {
      const reveal = result.reveals[index];
      for (const cell of reveal.cells) {
        revealed.set(`${cell.reel}:${cell.row}`, cell);
      }
      paintGrid(displayGrid, [...revealed.values()]);
      if (reveal.payout > 0) {
        setBalance((prev) => prev + reveal.payout);
        playWin();
      }
      const jackpotHits = reveal.cells.filter((cell) => cell.jackpot);
      const jackpotText =
        jackpotHits.length > 0
          ? ` incl. ${jackpotHits
              .map((cell) =>
                formatJackpotShortLabel(
                  cell.jackpot as JackpotId,
                  getBetTierFromWager(hatState.denomination, hatState.bet)
                )
              )
              .join(', ')}`
          : '';
      setStatus(
        `${bonusLabel} — ${reveal.color} prizes ${formatPrize(reveal.payout, hatState.denomination, { creditsOnly: true })}${jackpotText}`
      );
      syncUi();
      if (index < result.reveals.length - 1) {
        await delay(HAT_BONUS_REVEAL_DELAY_MS);
      }
    }

    return result.endPrizePayout;
  } finally {
    revealing = false;
    syncUi();
  }
}

async function animateHatColorBatches(
  cellsBefore: HatBonusCell[],
  batches: ReturnType<typeof excludeRedirectTargetTransitions>,
  highlights: GridPosition[]
) {
  if (batches.length === 0) {
    return;
  }

  const live = new Map(
    cellsBefore.map((cell) => [`${cell.reel}:${cell.row}`, { ...cell }])
  );
  paintGrid(displayGrid, [...live.values()], highlights);

  for (const batch of batches) {
    for (const transition of batch.transitions) {
      live.set(`${transition.reel}:${transition.row}`, {
        reel: transition.reel,
        row: transition.row,
        color: transition.toColor,
        prize: null,
        jackpot: null,
      });
    }
    await delay(HAT_COLOR_TRANSITION_MS);
    paintGrid(displayGrid, [...live.values()], highlights);
  }
}

export function stopAutoSpin() {
  auto.active = false;
  auto.remaining = 0;
  auto.total = 0;
  syncUi();
}

export async function runSpin() {
  if (isBusy()) {
    return;
  }

  const activeHat = state.hatBonus;
  const isHatBonusSpin = Boolean(activeHat && activeHat.spinsRemaining > 0);
  const isUltraHatSpin = isHatBonusSpin && activeHat?.mode === 'ultraHat';
  const isBuzzSawSpin = isHatBonusSpin && isBuzzSawBonusMode(activeHat?.mode);
  const isSuperBuzzSawSpin =
    isHatBonusSpin && activeHat?.mode === 'superBuzzSaw';
  const isSuperHatSpin = isHatBonusSpin && activeHat?.mode === 'superHat';
  const isTallBonusSpin = isHatBonusSpin && isTallBonusMode(activeHat?.mode);
  const keepsBonus = isHatBonusSpin && isBonusKeepingMode(activeHat?.mode);
  const hatRowCount = isHatBonusSpin
    ? getHatBonusRowCount(activeHat?.mode)
    : undefined;
  const hatPaylines = isTallBonusSpin ? SUPER_HAT_PAYLINES : undefined;
  const isFreeSpin = !isHatBonusSpin && state.freeSpinsRemaining > 0;

  if (!isHatBonusSpin && !isFreeSpin && state.balance < state.bet) {
    stopAutoSpin();
    return;
  }

  const forced = forcedSpin;
  forcedSpin = null;
  hatBonusSessionCompleted = false;
  setSpinning(true);
  hideBanner();
  setStatus('');
  syncUi();

  try {
    if (!isTallBonusSpin) {
      restoreBaseReelLayout();
    }

    if (isHatBonusSpin) {
      // Feature spin — no wager.
    } else if (isFreeSpin) {
      if (!state.freeSpinSession.active) {
        beginFreeSpinSession();
      }
      consumeFreeSpin();
    } else {
      clearFreeSpinSession();
      setBalance((prev) => prev - state.bet);
      setProgressiveJackpots(
        contributeToProgressiveJackpots(
          state.progressiveJackpots,
          state.bet,
          state.denomination
        )
      );
    }

    const spinOptions = {
      isFreeSpin: isFreeSpin || isHatBonusSpin,
      isHatBonus: isHatBonusSpin && !keepsBonus,
      isUltraHat: isUltraHatSpin,
      isBuzzSaw: isBuzzSawSpin && !isSuperBuzzSawSpin,
      isSuperHat: isSuperHatSpin,
      isSuperBuzzSaw: isSuperBuzzSawSpin,
      rowCount: hatRowCount,
    };

    let result: SpinResult;
    if (forced === 'bonus') {
      result = spinReelsForcedBonus(
        spinOptions.isFreeSpin,
        false,
        false,
        spinOptions.isBuzzSaw,
        hatRowCount,
        isSuperHatSpin,
        isSuperBuzzSawSpin
      );
    } else if (forced === 'hat') {
      result = spinReelsForcedHat(
        spinOptions.isFreeSpin,
        spinOptions.isHatBonus,
        isUltraHatSpin,
        spinOptions.isBuzzSaw,
        hatRowCount,
        isSuperHatSpin,
        isSuperBuzzSawSpin
      );
    } else {
      result = spinReels(spinOptions);
    }

    const currentBet = state.bet;
    const currentDenomination = state.denomination;
    const currentBetTier = getBetTier(currentDenomination, state.betMultiplier);

    await animateReels(
      {
        fromGrid: displayGrid,
        fromStops: displayStops,
        result,
        hatCells: isHatBonusSpin ? (state.hatBonus?.cells ?? []) : [],
      },
      (reel) => {
        playReelStop(
          columnHas(result.grid, reel, 'bonus'),
          columnHas(result.grid, reel, 'hat')
        );
      }
    );
    displayStops = result.stops;
    displayGrid = result.grid;

    const evaluation = evaluateSpin(
      result.grid,
      currentBet,
      undefined,
      isFreeSpin,
      hatPaylines,
      currentDenomination
    );

    let resultText = formatSpinResult(evaluation, currentDenomination, {
      includeHatTrigger: !isHatBonusSpin,
    });

    if (isHatBonusSpin && state.hatBonus) {
      const previousHatCells = state.hatBonus.cells;
      const hatSpinResult = applyHatBonusSpin(state.hatBonus, result.grid);
      writeHatBonus(hatSpinResult.state);
      const paylinePositions = evaluation.paylineWins.flatMap(
        (win) => win.positions
      );

      let cellsBeforeColorBatches = previousHatCells;
      if (hatSpinResult.redirects.length > 0) {
        const live = new Map(
          previousHatCells.map((cell) => [
            `${cell.reel}:${cell.row}`,
            { ...cell },
          ])
        );
        paintGrid(displayGrid, [...live.values()], paylinePositions);
        for (const redirect of hatSpinResult.redirects) {
          await delay(HAT_BLUE_REDIRECT_MS);
          live.set(`${redirect.to.reel}:${redirect.to.row}`, {
            reel: redirect.to.reel,
            row: redirect.to.row,
            color: redirect.color,
            prize: null,
            jackpot: null,
          });
          paintGrid(displayGrid, [...live.values()], paylinePositions);
          await delay(HAT_BLUE_REDIRECT_GAP_MS);
        }
        cellsBeforeColorBatches = [...live.values()];
      }

      await animateHatColorBatches(
        cellsBeforeColorBatches,
        excludeRedirectTargetTransitions(
          hatSpinResult.colorBatches,
          hatSpinResult.redirects
        ),
        paylinePositions
      );
      paintGrid(displayGrid, hatSpinResult.state.cells, paylinePositions);

      let buzzCutCount = 0;
      if (isBuzzSawBonusMode(state.hatBonus?.mode)) {
        const bonusPositions = findBonusPositions(result.grid);
        if (bonusPositions.length > 0 && state.hatBonus) {
          buzzCutCount = bonusPositions.length;
          const painted = await paintSweepCells(
            bonusPositions,
            state.hatBonus.mode ?? 'buzzSaw',
            state.hatBonus.cells
          );
          writeHatBonus({ ...state.hatBonus, cells: painted });
          paintGrid(displayGrid, painted, paylinePositions);
        }
      }

      if (evaluation.totalPayout > 0) {
        playWin();
        setBalance((prev) => prev + evaluation.totalPayout);
        addToFreeSpinSession(evaluation.totalPayout);
        showWin(evaluation.totalPayout, currentBet);
      }

      if (hatSpinResult.blueHitPayout > 0) {
        setBalance((prev) => prev + hatSpinResult.blueHitPayout);
        playWin();
        addHatBonusSessionWon(hatSpinResult.blueHitPayout);
        addToFreeSpinSession(hatSpinResult.blueHitPayout);
      }

      const extras: string[] = [];
      if (evaluation.bonusWin && !isBonusKeepingMode(state.hatBonus?.mode)) {
        await delay(900);
        const wheelSection = await playBonusWheel();
        const outcome = wheelSection.outcome;
        if (outcome.type === 'freeSpins') {
          addFreeSpins(outcome.count);
          extras.push(
            `Wheel: ${describeBonusWheelOutcome(outcome, currentBetTier)}`
          );
        } else if (outcome.type === 'jackpot') {
          const awarded = awardJackpotPayout(
            outcome.jackpot,
            currentBet,
            state.progressiveJackpots,
            currentDenomination
          );
          setProgressiveJackpots(awarded.pool);
          setBalance((prev) => prev + awarded.payout);
          playWin();
          showWin(awarded.payout, currentBet);
          addHatBonusSessionWon(awarded.payout);
          addToFreeSpinSession(awarded.payout);
          extras.push(
            `Wheel: ${describeBonusWheelOutcome(outcome, currentBetTier)} ${formatPrize(awarded.payout, currentDenomination)}`
          );
        } else {
          extras.push(
            `Wheel: ${describeBonusWheelOutcome(outcome, currentBetTier)} (already active)`
          );
        }
      } else if (buzzCutCount > 0) {
        extras.push(`${buzzCutCount} flag${buzzCutCount === 1 ? '' : 's'}`);
      }

      if (hatSpinResult.extraSpinAwarded) {
        extras.push('+1 free spin');
      }
      if (hatSpinResult.redirects.length > 0) {
        extras.push(
          `${hatSpinResult.redirects.length} crown move${hatSpinResult.redirects.length === 1 ? '' : 's'}`
        );
      }
      if (hatSpinResult.blueHitPayout > 0) {
        extras.push(
          `${state.hatBonus?.mode === 'ultraHat' ? 'Blue hit' : 'Red hit'} ${formatPrize(hatSpinResult.blueHitPayout, currentDenomination)}`
        );
      }
      if (hatSpinResult.upgradedPositions.length > 0) {
        extras.push(
          `${hatSpinResult.upgradedPositions.length} crown upgrade${hatSpinResult.upgradedPositions.length === 1 ? '' : 's'}`
        );
      }

      resultText =
        extras.length > 0
          ? joinSpinStatus(
              formatSpinResult(evaluation, currentDenomination, {
                includeHatTrigger: false,
              }),
              `Crown: ${extras.join(', ')}`
            )
          : formatSpinResult(evaluation, currentDenomination, {
              includeHatTrigger: false,
            });

      addHatBonusSessionWon(evaluation.totalPayout);

      if (hatSpinResult.state.spinsRemaining === 0) {
        const endPrizePayout = await playHatBonusReveal(
          state.hatBonus ?? hatSpinResult.state
        );
        addHatBonusSessionWon(endPrizePayout);
        addToFreeSpinSession(endPrizePayout);
        const totalWon = state.hatBonusSessionWon;
        const completedMode = state.hatBonus?.mode ?? 'hat';
        writeHatBonus(null);
        const remainingFreeSpins = state.freeSpinsRemaining;
        const bonusLabel = describeHatBonusMode(completedMode);
        if (state.freeSpinSession.active && remainingFreeSpins === 0) {
          const freeSpinTotal = state.freeSpinSession.totalWon;
          clearFreeSpinSession();
          setStatus(
            `Free spins complete — Total won: ${formatPrize(freeSpinTotal, currentDenomination)}`
          );
        } else if (state.freeSpinSession.active) {
          setStatus(
            `${bonusLabel} complete — ${formatPrize(totalWon, currentDenomination, { creditsOnly: true })} (Free spin won: ${formatPrize(state.freeSpinSession.totalWon, currentDenomination)})`
          );
        } else {
          setStatus(
            `${bonusLabel} complete — Total won: ${formatPrize(totalWon, currentDenomination, { creditsOnly: true })}`
          );
        }
        resultText = joinSpinStatus(
          formatSpinResult(evaluation, currentDenomination, {
            includeHatTrigger: false,
          }),
          `${bonusLabel} ${formatPrize(totalWon, currentDenomination, { creditsOnly: true })}`
        );
        showWin(totalWon, currentBet, {
          persist: true,
          creditsOnly: true,
          denomination: currentDenomination,
        });
        hatBonusSessionCompleted = true;
      }
    } else {
      paintGrid(result.grid, [], evaluation.winningPositions);

      if (evaluation.totalPayout > 0) {
        playWin();
        setBalance((prev) => prev + evaluation.totalPayout);
        showWin(evaluation.totalPayout, currentBet);
      }

      if (evaluation.bonusWin) {
        await delay(900);
        const wheelSection = await playBonusWheel();
        const outcome = wheelSection.outcome;
        if (outcome.type === 'freeSpins') {
          addFreeSpins(outcome.count);
          resultText = joinSpinStatus(
            formatSpinResult(evaluation, currentDenomination),
            `Wheel: ${describeBonusWheelOutcome(outcome, currentBetTier)}`
          );
        } else if (outcome.type === 'jackpot') {
          const awarded = awardJackpotPayout(
            outcome.jackpot,
            currentBet,
            state.progressiveJackpots,
            currentDenomination
          );
          setProgressiveJackpots(awarded.pool);
          setBalance((prev) => prev + awarded.payout);
          playWin();
          showWin(awarded.payout, currentBet);
          resultText = joinSpinStatus(
            formatSpinResult(evaluation, currentDenomination),
            `Wheel: ${describeBonusWheelOutcome(outcome, currentBetTier)} ${formatPrize(awarded.payout, currentDenomination)}`
          );
        } else if (outcome.type === 'buzzSaw' && !state.hatBonus) {
          const buzz = await startBuzzSawSession(
            result.grid,
            currentBet,
            'buzzSaw',
            result.stops,
            result.isFreeSpin
          );
          resultText = joinSpinStatus(
            formatSpinResult(evaluation, currentDenomination),
            `Wheel: ${describeHatBonusMode('buzzSaw')} — ${buzz.spinsRemaining} free spins`
          );
        } else if (outcome.type === 'superBuzzSaw' && !state.hatBonus) {
          const superBuzz = await startBuzzSawSession(
            result.grid,
            currentBet,
            'superBuzzSaw',
            result.stops,
            result.isFreeSpin
          );
          resultText = joinSpinStatus(
            formatSpinResult(evaluation, currentDenomination),
            `Wheel: ${describeHatBonusMode('superBuzzSaw')} — ${superBuzz.spinsRemaining} free spins`
          );
        } else if (outcome.type === 'megaHat' && !state.hatBonus) {
          const mega = await startMegaHatSession(currentBet);
          resultText = joinSpinStatus(
            formatSpinResult(evaluation, currentDenomination),
            `Wheel: Mega Crown — ${mega.spinsRemaining} free spins`
          );
        } else if (outcome.type === 'superHat' && !state.hatBonus) {
          const superHat = await startMegaHatSession(currentBet, true);
          resultText = joinSpinStatus(
            formatSpinResult(evaluation, currentDenomination),
            `Wheel: Super Crown — ${superHat.spinsRemaining} free spins`
          );
        } else if (
          (outcome.type === 'ultraHat' || outcome.type === 'mansions') &&
          !state.hatBonus
        ) {
          const mode: HatBonusMode =
            outcome.type === 'ultraHat' ? 'ultraHat' : 'mansions';
          const hatState = startHatBonusSession(
            findBonusPositions(result.grid),
            currentBet,
            mode
          );
          resultText = joinSpinStatus(
            formatSpinResult(evaluation, currentDenomination),
            `Wheel: ${describeHatBonusMode(mode)} — ${hatState.spinsRemaining} free spins`
          );
        }
      } else if (evaluation.hatTrigger && !state.hatBonus) {
        const hatState = startHatBonusSession(
          evaluation.hatTrigger.positions,
          currentBet
        );
        resultText = joinSpinStatus(
          formatSpinResult(evaluation, currentDenomination),
          `Crown Bonus started — ${hatState.spinsRemaining} free spins`
        );
      }

      if (isFreeSpin) {
        addToFreeSpinSession(evaluation.totalPayout);
        if (state.freeSpinsRemaining === 0 && !usingHatBonus()) {
          const totalWon = state.freeSpinSession.totalWon;
          clearFreeSpinSession();
          setStatus(
            `Free spins complete — Total won: ${formatPrize(totalWon, currentDenomination)}`
          );
        }
      }
    }

    if (resultText) {
      setStatus(resultText);
    }

    if (auto.active) {
      if (auto.remaining > 0) {
        auto.remaining -= 1;
      }
      if (auto.remaining === 0) {
        stopAutoSpin();
        return;
      }
      const hatSpinsLeft = state.hatBonus?.spinsRemaining ?? 0;
      const canContinue =
        !hatBonusSessionCompleted &&
        (hatSpinsLeft > 0 ||
          state.freeSpinsRemaining > 0 ||
          state.balance >= state.bet);
      if (canContinue) {
        window.setTimeout(() => {
          void runSpin();
        }, 600);
      } else {
        stopAutoSpin();
      }
    }
  } finally {
    setSpinning(false);
    syncUi();
  }
}

export function startAutoSpin() {
  if (auto.active) {
    stopAutoSpin();
    return;
  }
  if (!canStartSpin()) {
    return;
  }
  const select = document.querySelector('#auto-count') as HTMLSelectElement;
  const count = Number(select?.value ?? 10);
  auto.active = true;
  auto.remaining = count;
  auto.total = count;
  syncUi();
  void runSpin();
}

export function queueForcedSpin(kind: ForcedSpinKind) {
  if (!canStartSpin()) {
    return;
  }
  forcedSpin = kind;
  if (kind === 'bonus') {
    const select = document.querySelector('#force-wheel') as HTMLSelectElement;
    forcedWheelSectionId =
      select?.value && select.value !== 'spin-wheel' ? select.value : null;
  }
  void runSpin();
}

export function runSimulation(spinCount: number) {
  const out = document.querySelector('#sim-out');
  if (!out) {
    return;
  }
  if (spinCount >= SIMULATION_SPIN_COUNT_LARGE) {
    const ok = window.confirm(
      '1,000,000 spins can freeze the tab for a while. Continue?'
    );
    if (!ok) {
      return;
    }
  }
  out.textContent = `Running ${spinCount.toLocaleString()} spins...`;
  window.setTimeout(() => {
    const result = simulatePaidSpins(spinCount, state.bet, state.denomination);
    out.innerHTML = renderSimulationReport(result);
  }, 20);
}

export function initPlay() {
  setupTestMode([
    ...BONUS_WHEEL_OUTCOMES.map((section) => ({
      id: section.id,
      label: `Bonus · ${section.label}`,
    })),
    ...UPGRADE_WHEEL_OUTCOMES.map((section) => ({
      id: section.id,
      label: `Upgrade · ${section.label}`,
    })),
  ]);

  if (state.hatBonus && isTallBonusMode(state.hatBonus.mode)) {
    setActiveRows(SUPER_HAT_ROWS);
    const fresh = spinReels({
      isSuperHat: state.hatBonus.mode === 'superHat',
      isSuperBuzzSaw: state.hatBonus.mode === 'superBuzzSaw',
      isFreeSpin: true,
      rowCount: SUPER_HAT_ROWS,
    });
    displayGrid = fresh.grid;
    displayStops = fresh.stops;
    setStatus(
      `${describeHatBonusMode(state.hatBonus.mode)} — ${state.hatBonus.spinsRemaining} free spins remaining`
    );
  } else if (state.hatBonus) {
    setStatus(
      `${describeHatBonusMode(state.hatBonus.mode)} — ${state.hatBonus.spinsRemaining} free spins remaining`
    );
  }

  paintGrid(displayGrid, state.hatBonus?.cells ?? []);
  syncUi();

  if (!isTestMode()) {
    document.querySelector('#sim-10k')?.classList.add('hidden');
    document.querySelector('#sim-1m')?.classList.add('hidden');
  }
}
