import { spinReels } from './spin';
import { evaluateSpin } from './evaluate';
import {
  applyFlagAdvances,
  applyHatBonusSpin,
  applyPowerSawPaint,
  buildBuzzSawInitialState,
  buildPowerSawInitialState,
  createHatBonusState,
  describeHatBonusMode,
  findBonusPositions,
  getHatBonusRowCount,
  isBonusKeepingMode,
  isBuzzSawBonusMode,
  resolveHatBonusPrizes,
  sortBonusPositionsRightmostFirst,
  type HatBonusState,
} from './hatBonus';
import { getJackpotPayout } from './jackpots';
import {
  contributeToProgressiveJackpots,
  createProgressiveJackpotPool,
  isProgressiveJackpot,
  resetProgressiveJackpot,
} from './progressiveJackpots';
import {
  BONUS_WHEEL_OUTCOMES,
  UPGRADE_WHEEL_OUTCOMES,
  pickBonusWheelSectionIndex,
} from './bonusWheel';
import { formatMoneyRange, roundMoney } from './money';
import { DEFAULT_DENOMINATION, SUPER_HAT_ROWS, REEL_COUNT } from './config';
import {
  cellsCoveredByMegaHat,
  pickMegaHatSize,
  randomMegaHatPlacement,
  SUPER_HAT_SIZES,
} from './megaHat';
import type { SymbolId } from './symbols';

export const SIMULATION_SPIN_COUNT = 10_000;
export const SIMULATION_SPIN_COUNT_LARGE = 1_000_000;
export const VOLATILITY_WINDOW_SPINS = 100;
export const VOLATILITY_MULTIPLIER_TARGET_BINS = 32;
export const VOLATILITY_MULTIPLIER_MIN_BIN_SIZE = 5;

export type SymbolCountFrequency = Record<number, number>;
export type WinAmountFrequency = Record<number, number>;

export interface WinAmountHistogramBin {
  label: string;
  count: number;
}

export interface ReturnMultiplierHistogramBin extends WinAmountHistogramBin {
  minMultiplier: number;
  maxMultiplier: number;
}

export interface SimulationWheelSectionStat {
  id: string;
  label: string;
  hits: number;
}

export interface SimulationBonusTypeStat {
  id: string;
  label: string;
  hits: number;
  totalPayout: number;
  averagePayout: number;
}

export interface SimulationVolatility {
  windowSpins: number;
  windowCount: number;
  /** Mean return of each complete window, as a multiple of the bet. */
  averageReturnMultiplier: number;
  /** Median return of each complete window, as a multiple of the bet. */
  medianReturnMultiplier: number;
  /**
   * Return of each complete window as a multiple of the bet. For a 100-spin
   * window this is numerically equal to that window's RTP percentage.
   */
  returnMultipliers: number[];
}

export interface SimulationResult {
  spinCount: number;
  bet: number;
  totalWagered: number;
  totalPayout: number;
  payRate: number;
  winningSpins: number;
  deadSpins: number;
  longestDeadSpinStreak: number;
  bonusHits: number;
  freeSpinsTriggered: number;
  freeSpinsPlayed: number;
  freeSpinPayout: number;
  hatBonusHits: number;
  hatBonusPayout: number;
  totalSimulatedSpins: number;
  hatCountFrequency: SymbolCountFrequency;
  bonusCountFrequency: SymbolCountFrequency;
  hatBonusWinFrequency: WinAmountFrequency;
  freeSpinWinFrequency: WinAmountFrequency;
  spinsBetweenBonusFrequency: SymbolCountFrequency;
  longestSpinsBetweenBonuses: number;
  averageSpinsBetweenBonuses: number;
  freeSpinRetriggerHits: number;
  freeSpinHatBonusHits: number;
  /** Main bonus-wheel landings (including Upgrade). */
  wheelSectionStats: SimulationWheelSectionStat[];
  /** Upgrade-wheel landings after the main wheel hits Upgrade. */
  upgradeWheelSectionStats: SimulationWheelSectionStat[];
  /** Regular bonus features (main wheel + natural hat). */
  bonusTypeStats: SimulationBonusTypeStat[];
  /** Features awarded from the upgrade wheel. */
  upgradeBonusTypeStats: SimulationBonusTypeStat[];
  volatility: SimulationVolatility;
}

function countSymbolOnGrid(grid: SymbolId[][], symbol: SymbolId): number {
  return grid.flat().filter((entry) => entry === symbol).length;
}

function incrementFrequency(
  frequencies: SymbolCountFrequency,
  count: number
): void {
  frequencies[count] = (frequencies[count] ?? 0) + 1;
}

function incrementWinFrequency(
  frequencies: WinAmountFrequency,
  amount: number
): void {
  const key = roundMoney(amount);
  frequencies[key] = (frequencies[key] ?? 0) + 1;
}

function averageFromFrequency(frequencies: SymbolCountFrequency): number {
  let totalSpins = 0;
  let intervalCount = 0;

  for (const [spins, count] of Object.entries(frequencies)) {
    const gap = Number(spins);
    totalSpins += gap * count;
    intervalCount += count;
  }

  return intervalCount > 0 ? totalSpins / intervalCount : 0;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

function emptyVolatility(windowSpins: number): SimulationVolatility {
  return {
    windowSpins,
    windowCount: 0,
    averageReturnMultiplier: 0,
    medianReturnMultiplier: 0,
    returnMultipliers: [],
  };
}

export function niceMultiplierBinSize(
  maxValue: number,
  targetBinCount = VOLATILITY_MULTIPLIER_TARGET_BINS,
  minBinSize = VOLATILITY_MULTIPLIER_MIN_BIN_SIZE
): number {
  if (maxValue <= 0) {
    return minBinSize;
  }

  const raw = maxValue / Math.max(targetBinCount, 1);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const residual = raw / magnitude;
  let binSize: number;

  if (residual <= 1) {
    binSize = magnitude;
  } else if (residual <= 2) {
    binSize = 2 * magnitude;
  } else if (residual <= 5) {
    binSize = 5 * magnitude;
  } else {
    binSize = 10 * magnitude;
  }

  return Math.max(minBinSize, binSize);
}

export function buildReturnMultiplierHistogramBins(
  multipliers: number[],
  binSize = niceMultiplierBinSize(
    multipliers.length > 0 ? Math.max(...multipliers) : 0
  )
): ReturnMultiplierHistogramBin[] {
  if (multipliers.length === 0) {
    return [];
  }

  const maxMultiplier = Math.max(...multipliers);
  const safeBinSize = binSize > 0 ? binSize : VOLATILITY_MULTIPLIER_MIN_BIN_SIZE;
  const binCount = Math.max(1, Math.floor(maxMultiplier / safeBinSize) + 1);
  const bins = Array.from({ length: binCount }, (_, index) => ({
    minMultiplier: index * safeBinSize,
    maxMultiplier: (index + 1) * safeBinSize,
    count: 0,
  }));

  for (const multiplier of multipliers) {
    const binIndex = Math.min(
      Math.floor(multiplier / safeBinSize),
      binCount - 1
    );
    bins[binIndex].count += 1;
  }

  return bins.map((bin) => ({
    label: `${formatMultiplierAxis(bin.minMultiplier)}-${formatMultiplierAxis(bin.maxMultiplier)}`,
    count: bin.count,
    minMultiplier: bin.minMultiplier,
    maxMultiplier: bin.maxMultiplier,
  }));
}

function formatMultiplierAxis(value: number): string {
  return `${value}x`;
}

export const WIN_HISTOGRAM_SEGMENT_MULTIPLIER = 10;

export function buildWinAmountHistogramBins(
  frequencies: WinAmountFrequency,
  bet: number,
  segmentMultiplier = WIN_HISTOGRAM_SEGMENT_MULTIPLIER
): WinAmountHistogramBin[] {
  const amounts = Object.keys(frequencies)
    .map(Number)
    .filter((amount) => (frequencies[amount] ?? 0) > 0);

  if (amounts.length === 0 || bet <= 0) {
    return [];
  }

  const segmentSize = bet * segmentMultiplier;
  const maxAmount = Math.max(...amounts);
  const binCount = Math.max(1, Math.floor(maxAmount / segmentSize) + 1);
  const bins = Array.from({ length: binCount }, (_, index) => ({
    minMultiplier: index * segmentMultiplier,
    maxMultiplier: (index + 1) * segmentMultiplier,
    count: 0,
  }));

  for (const amount of amounts) {
    const binIndex = Math.min(
      Math.floor(amount / segmentSize),
      binCount - 1
    );
    bins[binIndex].count += frequencies[amount] ?? 0;
  }

  return bins.map((bin) => ({
    label: formatMoneyRange(
      bin.minMultiplier * bet,
      bin.maxMultiplier * bet
    ),
    count: bin.count,
  }));
}

export const SPINS_BETWEEN_BONUS_HISTOGRAM_SEGMENT = 10;

export function buildSpinsBetweenBonusHistogramBins(
  frequencies: SymbolCountFrequency,
  segmentSize = SPINS_BETWEEN_BONUS_HISTOGRAM_SEGMENT
): WinAmountHistogramBin[] {
  const gaps = Object.keys(frequencies)
    .map(Number)
    .filter((gap) => (frequencies[gap] ?? 0) > 0);

  if (gaps.length === 0) {
    return [];
  }

  const maxGap = Math.max(...gaps);
  const binCount = Math.max(1, Math.floor(maxGap / segmentSize) + 1);
  const bins = Array.from({ length: binCount }, (_, index) => ({
    min: index * segmentSize,
    max: (index + 1) * segmentSize - 1,
    count: 0,
  }));

  for (const gap of gaps) {
    const binIndex = Math.min(Math.floor(gap / segmentSize), binCount - 1);
    bins[binIndex].count += frequencies[gap] ?? 0;
  }

  return bins.map((bin) => ({
    label:
      bin.min === bin.max
        ? bin.min.toLocaleString()
        : `${bin.min.toLocaleString()}-${bin.max.toLocaleString()}`,
    count: bin.count,
  }));
}

function simulateHatBonusSession(
  pool: ReturnType<typeof createProgressiveJackpotPool>,
  initialState: HatBonusState
): number {
  let state = initialState;
  let safety = 0;
  const isUltraHat = initialState.mode === 'ultraHat';
  const isBuzzSaw = isBuzzSawBonusMode(initialState.mode);
  const isSuperHat = initialState.mode === 'superHat';
  const isSuperBuzzSaw = initialState.mode === 'superBuzzSaw';
  const isSuperPowerSaw = initialState.mode === 'superPowerSaw';
  const rowCount = getHatBonusRowCount(initialState.mode);

  while (state.spinsRemaining > 0 && safety < 200) {
    safety++;
    const { grid } = spinReels({
      isFreeSpin: true,
      isHatBonus: !isBonusKeepingMode(initialState.mode),
      isUltraHat,
      isBuzzSaw: isBuzzSaw && !isSuperBuzzSaw,
      isSuperHat,
      isSuperBuzzSaw,
      isSuperPowerSaw,
      rowCount,
    });
    const spinResult = applyHatBonusSpin(state, grid);
    state = spinResult.state;

    if (isBuzzSaw) {
      state = {
        ...state,
        cells: applyFlagAdvances(
          state.cells,
          findBonusPositions(grid),
          state.mode,
          rowCount
        ),
      };
    } else if (isSuperPowerSaw) {
      const bonusPositions = sortBonusPositionsRightmostFirst(
        findBonusPositions(grid)
      );
      let cells = state.cells;
      for (const start of bonusPositions) {
        for (let reel = start.reel; reel < REEL_COUNT; reel++) {
          cells = applyPowerSawPaint(
            cells,
            { reel, row: start.row },
            'superPowerSaw'
          );
        }
      }
      state = { ...state, cells };
    }
  }

  const result = resolveHatBonusPrizes(state, pool);
  copyProgressivePool(pool, result.progressivePool);
  return result.totalPayout;
}

function copyProgressivePool(
  target: ReturnType<typeof createProgressiveJackpotPool>,
  source: ReturnType<typeof createProgressiveJackpotPool>
) {
  target.majorExtraByDenomination = {
    ...source.majorExtraByDenomination,
  };
  target.grandExtra = source.grandExtra;
}

interface BonusTypeAccumulator {
  id: string;
  label: string;
  hits: number;
  totalPayout: number;
}

function createBonusTypeAccumulator(
  id: string,
  label: string
): BonusTypeAccumulator {
  return { id, label, hits: 0, totalPayout: 0 };
}

function recordBonusTypeWin(
  stats: Record<string, BonusTypeAccumulator>,
  id: string,
  payout: number
): void {
  const entry = stats[id];

  if (!entry) {
    return;
  }

  entry.hits += 1;
  entry.totalPayout = roundMoney(entry.totalPayout + payout);
}

function finalizeBonusTypeStats(
  stats: Record<string, BonusTypeAccumulator>
): SimulationBonusTypeStat[] {
  return Object.values(stats).map((entry) => ({
    id: entry.id,
    label: entry.label,
    hits: entry.hits,
    totalPayout: entry.totalPayout,
    averagePayout: entry.hits > 0 ? roundMoney(entry.totalPayout / entry.hits) : 0,
  }));
}

export function simulatePaidSpins(
  spinCount: number,
  bet: number,
  denomination: number = DEFAULT_DENOMINATION
): SimulationResult {
  let totalPayout = 0;
  let freeSpinPayout = 0;
  let winningSpins = 0;
  let deadSpins = 0;
  let currentDeadStreak = 0;
  let longestDeadSpinStreak = 0;
  let bonusHits = 0;
  let freeSpinsTriggered = 0;
  let freeSpinsPlayed = 0;
  let freeSpinsRemaining = 0;
  let hatBonusHits = 0;
  let hatBonusPayout = 0;
  let totalSimulatedSpins = 0;
  const hatCountFrequency: SymbolCountFrequency = {};
  const bonusCountFrequency: SymbolCountFrequency = {};
  const hatBonusWinFrequency: WinAmountFrequency = {};
  const freeSpinWinFrequency: WinAmountFrequency = {};
  const spinsBetweenBonusFrequency: SymbolCountFrequency = {};
  let spinsSinceLastBonus = 0;
  let longestSpinsBetweenBonuses = 0;
  let freeSpinRetriggerHits = 0;
  let freeSpinHatBonusHits = 0;
  const wheelSectionHitCounts: Record<string, number> = Object.fromEntries(
    [...BONUS_WHEEL_OUTCOMES, ...UPGRADE_WHEEL_OUTCOMES].map((section) => [
      section.id,
      0,
    ])
  );
  const bonusTypeStats = {
    freeSpins: createBonusTypeAccumulator('freeSpins', 'Free Spins'),
    buzzSaw: createBonusTypeAccumulator(
      'buzzSaw',
      describeHatBonusMode('buzzSaw')
    ),
    powerSaw: createBonusTypeAccumulator(
      'powerSaw',
      describeHatBonusMode('powerSaw')
    ),
    megaHat: createBonusTypeAccumulator(
      'megaHat',
      describeHatBonusMode('megaHat')
    ),
    mansions: createBonusTypeAccumulator(
      'mansions',
      describeHatBonusMode('mansions')
    ),
    miniJackpot: createBonusTypeAccumulator('miniJackpot', 'Mini Jackpot'),
    minorJackpot: createBonusTypeAccumulator('minorJackpot', 'Minor Jackpot'),
    grandJackpot: createBonusTypeAccumulator('grandJackpot', 'Grand Jackpot'),
    naturalHat: createBonusTypeAccumulator('naturalHat', 'Natural Hat Bonus'),
  };
  const upgradeBonusTypeStats = {
    superBuzzSaw: createBonusTypeAccumulator(
      'superBuzzSaw',
      describeHatBonusMode('superBuzzSaw')
    ),
    superPowerSaw: createBonusTypeAccumulator(
      'superPowerSaw',
      describeHatBonusMode('superPowerSaw')
    ),
    superHat: createBonusTypeAccumulator(
      'superHat',
      describeHatBonusMode('superHat')
    ),
    ultraHat: createBonusTypeAccumulator(
      'ultraHat',
      describeHatBonusMode('ultraHat')
    ),
    majorJackpot: createBonusTypeAccumulator('majorJackpot', 'Major Jackpot'),
  };
  let windowPayout = 0;
  const returnMultipliers: number[] = [];
  const pool = createProgressiveJackpotPool();

  const runSpin = (isPaidSpin: boolean) => {
    if (isPaidSpin) {
      copyProgressivePool(
        pool,
        contributeToProgressiveJackpots(pool, bet, denomination)
      );
    }

    const { grid, isFreeSpin } = spinReels({ isFreeSpin: !isPaidSpin });
    const evaluation = evaluateSpin(
      grid,
      bet,
      undefined,
      isFreeSpin,
      undefined,
      denomination
    );
    let spinHatBonusPayout = 0;

    totalSimulatedSpins++;
    incrementFrequency(hatCountFrequency, countSymbolOnGrid(grid, 'HAT'));
    incrementFrequency(bonusCountFrequency, countSymbolOnGrid(grid, 'BONUS'));

    if (evaluation.bonusWin) {
      bonusHits++;

      const mainSection =
        BONUS_WHEEL_OUTCOMES[pickBonusWheelSectionIndex(BONUS_WHEEL_OUTCOMES)];
      wheelSectionHitCounts[mainSection.id] =
        (wheelSectionHitCounts[mainSection.id] ?? 0) + 1;

      let wheelSection = mainSection;

      if (mainSection.outcome.type === 'upgrade') {
        wheelSection =
          UPGRADE_WHEEL_OUTCOMES[
            pickBonusWheelSectionIndex(UPGRADE_WHEEL_OUTCOMES)
          ];
        wheelSectionHitCounts[wheelSection.id] =
          (wheelSectionHitCounts[wheelSection.id] ?? 0) + 1;
      }

      if (wheelSection.outcome.type === 'freeSpins') {
        freeSpinsTriggered += wheelSection.outcome.count;
        freeSpinsRemaining += wheelSection.outcome.count;
      } else if (wheelSection.outcome.type === 'jackpot') {
        const jackpotPayout = getJackpotPayout(
          wheelSection.outcome.jackpot,
          bet,
          1,
          pool,
          denomination
        );
        if (isProgressiveJackpot(wheelSection.outcome.jackpot)) {
          copyProgressivePool(
            pool,
            resetProgressiveJackpot(
              pool,
              wheelSection.outcome.jackpot,
              denomination
            )
          );
        }
        spinHatBonusPayout = jackpotPayout;
        hatBonusPayout += spinHatBonusPayout;
        incrementWinFrequency(hatBonusWinFrequency, spinHatBonusPayout);
        const jackpotStatId = `${wheelSection.outcome.jackpot}Jackpot`;
        if (jackpotStatId in upgradeBonusTypeStats) {
          recordBonusTypeWin(
            upgradeBonusTypeStats,
            jackpotStatId,
            spinHatBonusPayout
          );
        } else {
          recordBonusTypeWin(bonusTypeStats, jackpotStatId, spinHatBonusPayout);
        }
      } else if (wheelSection.outcome.type === 'powerSaw') {
        spinHatBonusPayout = simulateHatBonusSession(pool,
          buildPowerSawInitialState(
            findBonusPositions(grid),
            bet,
            undefined,
            'powerSaw',
            undefined,
            denomination
          )
        );
        hatBonusPayout += spinHatBonusPayout;
        incrementWinFrequency(hatBonusWinFrequency, spinHatBonusPayout);
        recordBonusTypeWin(bonusTypeStats, 'powerSaw', spinHatBonusPayout);
      } else if (wheelSection.outcome.type === 'superPowerSaw') {
        spinHatBonusPayout = simulateHatBonusSession(pool,
          buildPowerSawInitialState(
            findBonusPositions(grid),
            bet,
            undefined,
            'superPowerSaw',
            undefined,
            denomination
          )
        );
        hatBonusPayout += spinHatBonusPayout;
        incrementWinFrequency(hatBonusWinFrequency, spinHatBonusPayout);
        recordBonusTypeWin(
          upgradeBonusTypeStats,
          'superPowerSaw',
          spinHatBonusPayout
        );
      } else if (wheelSection.outcome.type === 'megaHat') {
        spinHatBonusPayout = simulateHatBonusSession(pool,
          createHatBonusState(
            cellsCoveredByMegaHat(randomMegaHatPlacement()),
            bet,
            undefined,
            'megaHat',
            denomination
          )
        );
        hatBonusPayout += spinHatBonusPayout;
        incrementWinFrequency(hatBonusWinFrequency, spinHatBonusPayout);
        recordBonusTypeWin(bonusTypeStats, 'megaHat', spinHatBonusPayout);
      } else if (wheelSection.outcome.type === 'superHat') {
        spinHatBonusPayout = simulateHatBonusSession(pool,
          createHatBonusState(
            cellsCoveredByMegaHat(
              randomMegaHatPlacement(
                pickMegaHatSize(SUPER_HAT_SIZES),
                SUPER_HAT_ROWS
              )
            ),
            bet,
            undefined,
            'superHat',
            denomination
          )
        );
        hatBonusPayout += spinHatBonusPayout;
        incrementWinFrequency(hatBonusWinFrequency, spinHatBonusPayout);
        recordBonusTypeWin(
          upgradeBonusTypeStats,
          'superHat',
          spinHatBonusPayout
        );
      } else if (wheelSection.outcome.type === 'ultraHat') {
        spinHatBonusPayout = simulateHatBonusSession(pool,
          createHatBonusState(
            findBonusPositions(grid),
            bet,
            undefined,
            'ultraHat',
            denomination
          )
        );
        hatBonusPayout += spinHatBonusPayout;
        incrementWinFrequency(hatBonusWinFrequency, spinHatBonusPayout);
        recordBonusTypeWin(
          upgradeBonusTypeStats,
          'ultraHat',
          spinHatBonusPayout
        );
      } else if (wheelSection.outcome.type === 'mansions') {
        spinHatBonusPayout = simulateHatBonusSession(pool,
          createHatBonusState(
            findBonusPositions(grid),
            bet,
            undefined,
            'mansions',
            denomination
          )
        );
        hatBonusPayout += spinHatBonusPayout;
        incrementWinFrequency(hatBonusWinFrequency, spinHatBonusPayout);
        recordBonusTypeWin(bonusTypeStats, 'mansions', spinHatBonusPayout);
      } else if (wheelSection.outcome.type === 'buzzSaw') {
        spinHatBonusPayout = simulateHatBonusSession(pool,
          buildBuzzSawInitialState(
            findBonusPositions(grid),
            bet,
            undefined,
            'buzzSaw',
            denomination
          )
        );
        hatBonusPayout += spinHatBonusPayout;
        incrementWinFrequency(hatBonusWinFrequency, spinHatBonusPayout);
        recordBonusTypeWin(bonusTypeStats, 'buzzSaw', spinHatBonusPayout);
      } else if (wheelSection.outcome.type === 'superBuzzSaw') {
        spinHatBonusPayout = simulateHatBonusSession(pool,
          buildBuzzSawInitialState(
            findBonusPositions(grid),
            bet,
            undefined,
            'superBuzzSaw',
            denomination
          )
        );
        hatBonusPayout += spinHatBonusPayout;
        incrementWinFrequency(hatBonusWinFrequency, spinHatBonusPayout);
        recordBonusTypeWin(
          upgradeBonusTypeStats,
          'superBuzzSaw',
          spinHatBonusPayout
        );
      }
    } else if (evaluation.hatTrigger) {
      hatBonusHits++;
      spinHatBonusPayout = simulateHatBonusSession(pool,
        createHatBonusState(
          evaluation.hatTrigger.positions,
          bet,
          undefined,
          'hat',
          denomination
        )
      );
      hatBonusPayout += spinHatBonusPayout;
      incrementWinFrequency(hatBonusWinFrequency, spinHatBonusPayout);
      recordBonusTypeWin(bonusTypeStats, 'naturalHat', spinHatBonusPayout);
    }

    const spinPayout = roundMoney(evaluation.totalPayout + spinHatBonusPayout);

    totalPayout = roundMoney(totalPayout + spinPayout);

    if (isPaidSpin) {
      if (spinPayout > 0) {
        winningSpins++;
        currentDeadStreak = 0;
      } else {
        deadSpins++;
        currentDeadStreak++;

        if (currentDeadStreak > longestDeadSpinStreak) {
          longestDeadSpinStreak = currentDeadStreak;
        }
      }
    } else {
      freeSpinPayout += spinPayout;
      freeSpinsPlayed++;

      if (evaluation.bonusWin) {
        freeSpinRetriggerHits++;
      }

      if (evaluation.hatTrigger) {
        freeSpinHatBonusHits++;
      }
    }

    const bonusTriggered =
      evaluation.bonusWin !== null || evaluation.hatTrigger !== null;

    if (bonusTriggered && isPaidSpin) {
      incrementFrequency(spinsBetweenBonusFrequency, spinsSinceLastBonus);

      if (spinsSinceLastBonus > longestSpinsBetweenBonuses) {
        longestSpinsBetweenBonuses = spinsSinceLastBonus;
      }

      spinsSinceLastBonus = 0;
    } else if (isPaidSpin) {
      spinsSinceLastBonus++;
    }
  };

  for (let spin = 0; spin < spinCount; spin++) {
    const payoutBefore = totalPayout;
    const freeSpinPayoutBefore = freeSpinPayout;
    const freeSpinsPlayedBefore = freeSpinsPlayed;

    runSpin(true);

    while (freeSpinsRemaining > 0) {
      freeSpinsRemaining--;
      runSpin(false);
    }

    windowPayout += totalPayout - payoutBefore;

    if ((spin + 1) % VOLATILITY_WINDOW_SPINS === 0) {
      returnMultipliers.push(bet > 0 ? windowPayout / bet : 0);
      windowPayout = 0;
    }

    const freeSpinsPlayedThisSession = freeSpinsPlayed - freeSpinsPlayedBefore;

    if (freeSpinsPlayedThisSession > 0) {
      const sessionPayout = freeSpinPayout - freeSpinPayoutBefore;
      incrementWinFrequency(freeSpinWinFrequency, sessionPayout);
      recordBonusTypeWin(bonusTypeStats, 'freeSpins', sessionPayout);
    }
  }

  const totalWagered = spinCount * bet;
  const payRate =
    totalWagered > 0 ? (totalPayout / totalWagered) * 100 : 0;

  return {
    spinCount,
    bet,
    totalWagered,
    totalPayout,
    payRate,
    winningSpins,
    deadSpins,
    longestDeadSpinStreak,
    bonusHits,
    freeSpinsTriggered,
    freeSpinsPlayed,
    freeSpinPayout,
    hatBonusHits,
    hatBonusPayout,
    totalSimulatedSpins,
    hatCountFrequency,
    bonusCountFrequency,
    hatBonusWinFrequency,
    freeSpinWinFrequency,
    spinsBetweenBonusFrequency,
    longestSpinsBetweenBonuses,
    averageSpinsBetweenBonuses: averageFromFrequency(
      spinsBetweenBonusFrequency
    ),
    freeSpinRetriggerHits,
    freeSpinHatBonusHits,
    wheelSectionStats: BONUS_WHEEL_OUTCOMES.map((section) => ({
      id: section.id,
      label: section.label,
      hits: wheelSectionHitCounts[section.id] ?? 0,
    })),
    upgradeWheelSectionStats: UPGRADE_WHEEL_OUTCOMES.map((section) => ({
      id: section.id,
      label: section.label,
      hits: wheelSectionHitCounts[section.id] ?? 0,
    })),
    bonusTypeStats: finalizeBonusTypeStats(bonusTypeStats),
    upgradeBonusTypeStats: finalizeBonusTypeStats(upgradeBonusTypeStats),
    volatility:
      returnMultipliers.length > 0
        ? {
            windowSpins: VOLATILITY_WINDOW_SPINS,
            windowCount: returnMultipliers.length,
            averageReturnMultiplier: average(returnMultipliers),
            medianReturnMultiplier: median(returnMultipliers),
            returnMultipliers,
          }
        : emptyVolatility(VOLATILITY_WINDOW_SPINS),
  };
}
