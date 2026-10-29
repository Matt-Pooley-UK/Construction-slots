import type { SymbolId } from './symbols';
import { getHatUpgradeSteps } from './symbols';
import {
  DEFAULT_DENOMINATION,
  HAT_BONUS_BLUE_HIT_MULTIPLIER,
  HAT_BONUS_EXTRA_SPIN_HAT_COUNT,
  HAT_BONUS_FREE_SPINS,
  HAT_BONUS_RED_HIT_MULTIPLIER,
  HAT_CELL_COLOR_ORDER,
  HAT_CELL_PRIZE_RANGES,
  HAT_TRIGGER_COUNT,
  REEL_COUNT,
  REEL_LENGTH,
  ROWS,
  SUPER_HAT_ROWS,
  type GridPosition,
  type HatCellColor,
  type JackpotId,
} from './config';
import { getReelSet, getStripSlice } from './reels';
import { rollHatCellJackpot } from './jackpots';
import { snapToDenomination } from './money';
import {
  cloneProgressiveJackpotPool,
  createProgressiveJackpotPool,
  isProgressiveJackpot,
  resetProgressiveJackpot,
  type ProgressiveJackpotPool,
} from './progressiveJackpots';

export type HatBonusMode =
  | 'hat'
  | 'megaHat'
  | 'ultraHat'
  | 'superHat'
  | 'mansions'
  | 'buzzSaw'
  | 'superBuzzSaw';

export interface HatTriggerResult {
  count: number;
  positions: GridPosition[];
}

export interface HatBonusCell {
  reel: number;
  row: number;
  color: HatCellColor;
  prize: number | null;
  /** Set when the cell revealed a jackpot instead of a normal prize. */
  jackpot: JackpotId | null;
}

export interface HatBonusState {
  bet: number;
  denomination: number;
  spinsRemaining: number;
  cells: HatBonusCell[];
  blueHitPayout: number;
  mode?: HatBonusMode;
}

export interface HatBonusRedirect {
  from: GridPosition;
  to: GridPosition;
  /** Color of the destination cell after the redirected upgrade. */
  color: HatCellColor;
}

export interface CellColorTransition {
  reel: number;
  row: number;
  fromColor: HatCellColor | null;
  toColor: HatCellColor;
}

export interface CellColorTransitionBatch {
  color: HatCellColor;
  transitions: CellColorTransition[];
}

export interface HatBonusSpinResult {
  state: HatBonusState;
  hatCount: number;
  upgradedPositions: GridPosition[];
  redirects: HatBonusRedirect[];
  blueHitPayout: number;
  extraSpinAwarded: boolean;
  colorBatches: CellColorTransitionBatch[];
}

export function groupColorTransitionsIntoBatches(
  transitions: CellColorTransition[]
): CellColorTransitionBatch[] {
  const batches: CellColorTransitionBatch[] = [];

  for (const color of HAT_CELL_COLOR_ORDER) {
    const colorTransitions = transitions.filter(
      (transition) => transition.toColor === color
    );

    if (colorTransitions.length > 0) {
      batches.push({ color, transitions: colorTransitions });
    }
  }

  return batches;
}

export function excludeRedirectTargetTransitions(
  batches: CellColorTransitionBatch[],
  redirects: HatBonusRedirect[]
): CellColorTransitionBatch[] {
  const redirectTargetKeys = new Set(
    redirects.map((redirect) => positionKey(redirect.to))
  );

  return batches
    .map((batch) => ({
      ...batch,
      transitions: batch.transitions.filter(
        (transition) =>
          !redirectTargetKeys.has(positionKey(transition))
      ),
    }))
    .filter((batch) => batch.transitions.length > 0);
}

export function getPowerSawPaintTransition(
  cells: HatBonusCell[],
  position: GridPosition,
  mode?: HatBonusMode
): CellColorTransition | null {
  const key = positionKey(position);
  const existing = cells.find((cell) => positionKey(cell) === key);
  const toColor = upgradeHatCellColor(existing?.color, mode);

  if (existing?.color === toColor) {
    return null;
  }

  return {
    reel: position.reel,
    row: position.row,
    fromColor: existing?.color ?? null,
    toColor,
  };
}

function recordColorTransition(
  transitions: CellColorTransition[] | undefined,
  position: GridPosition,
  fromColor: HatCellColor | null,
  toColor: HatCellColor
) {
  if (!transitions) {
    return;
  }

  transitions.push({
    reel: position.reel,
    row: position.row,
    fromColor,
    toColor,
  });
}

export interface HatBonusPrizeReveal {
  color: HatCellColor;
  cells: Array<HatBonusCell & { prize: number; jackpot: JackpotId | null }>;
  payout: number;
}

export interface HatBonusResult {
  blueHitPayout: number;
  endPrizePayout: number;
  totalPayout: number;
  reveals: HatBonusPrizeReveal[];
  cells: HatBonusCell[];
  progressivePool: ProgressiveJackpotPool;
}

function positionKey(position: GridPosition): string {
  return `${position.reel}:${position.row}`;
}

function findSymbolPositions(
  grid: SymbolId[][],
  symbol: SymbolId
): GridPosition[] {
  const positions: GridPosition[] = [];

  grid.forEach((column, reel) => {
    column.forEach((entry, row) => {
      if (entry === symbol) {
        positions.push({ reel, row });
      }
    });
  });

  return positions;
}

function findHatPositions(grid: SymbolId[][]): GridPosition[] {
  return findSymbolPositions(grid, 'HAT');
}

export function findAllHatHits(
  grid: SymbolId[][]
): Array<GridPosition & { steps: number }> {
  const hits: Array<GridPosition & { steps: number }> = [];

  grid.forEach((column, reel) => {
    column.forEach((entry, row) => {
      const steps = getHatUpgradeSteps(entry);

      if (steps > 0) {
        hits.push({ reel, row, steps });
      }
    });
  });

  return hits;
}

export function findBonusPositions(grid: SymbolId[][]): GridPosition[] {
  return findSymbolPositions(grid, 'BONUS');
}

export function evaluateHatTrigger(
  grid: SymbolId[][]
): HatTriggerResult | null {
  const positions = findHatPositions(grid);

  if (positions.length < HAT_TRIGGER_COUNT) {
    return null;
  }

  return {
    count: positions.length,
    positions,
  };
}

function canReachBlue(mode?: HatBonusMode): boolean {
  return mode === 'ultraHat';
}

function nextCellColor(
  color: HatCellColor,
  mode?: HatBonusMode
): HatCellColor | null {
  const index = HAT_CELL_COLOR_ORDER.indexOf(color);

  if (index < 0 || index >= HAT_CELL_COLOR_ORDER.length - 1) {
    return null;
  }

  const next = HAT_CELL_COLOR_ORDER[index + 1];

  if (next === 'blue' && !canReachBlue(mode)) {
    return null;
  }

  return next;
}

/** First paint color for empty cells (Mansions starts at red). */
export function getHatBonusInitialColor(
  mode?: HatBonusMode
): HatCellColor {
  return mode === 'mansions' ? 'red' : 'yellow';
}

/**
 * First paint → yellow (or red in Mansions); further paints upgrade one step.
 * Only Ultra Hat can progress past red to blue.
 */
export function upgradeHatCellColor(
  color: HatCellColor | null | undefined,
  mode?: HatBonusMode
): HatCellColor {
  if (!color) {
    return getHatBonusInitialColor(mode);
  }

  return nextCellColor(color, mode) ?? color;
}

export function describeHatBonusMode(mode: HatBonusMode | undefined): string {
  switch (mode) {
    case 'megaHat':
      return 'Mega Crown';
    case 'ultraHat':
      return 'Ultra Crown';
    case 'superHat':
      return 'Super Crown';
    case 'mansions':
      return 'Mansions';
    case 'buzzSaw':
      return 'Flag Bonus';
    case 'superBuzzSaw':
      return 'Super Flag Bonus';
    default:
      return 'Crown Bonus';
  }
}

/** True for Flag Bonus and Super Flag Bonus (cardinal neighbor advances). */
export function isBuzzSawBonusMode(mode?: HatBonusMode): boolean {
  return mode === 'buzzSaw' || mode === 'superBuzzSaw';
}

/**
 * Features that keep BONUS on the strips and count BONUS toward extra spins /
 * mid-feature paints (Flag Bonus family).
 */
export function isBonusKeepingMode(mode?: HatBonusMode): boolean {
  return isBuzzSawBonusMode(mode);
}

/** True for features that use the 6-row window and the tall paylines. */
export function isTallBonusMode(mode?: HatBonusMode): boolean {
  return mode === 'superHat' || mode === 'superBuzzSaw' || mode === 'ultraHat';
}

export function getHatBonusRowCount(mode?: HatBonusMode): number {
  return isTallBonusMode(mode) ? SUPER_HAT_ROWS : ROWS;
}

/** Left-to-right, then top-to-bottom — flags advance in this order. */
export function sortBonusPositionsReadingOrder(
  positions: GridPosition[]
): GridPosition[] {
  return [...positions].sort((left, right) => {
    if (left.reel !== right.reel) {
      return left.reel - right.reel;
    }

    return left.row - right.row;
  });
}

const FLAG_NEIGHBOR_DELTAS: ReadonlyArray<GridPosition> = [
  { reel: 0, row: -1 },
  { reel: 1, row: 0 },
  { reel: 0, row: 1 },
  { reel: -1, row: 0 },
];

/** The in-bounds cells above, right, below, and left of a flag. */
export function getFlagNeighborPositions(
  origin: GridPosition,
  reelCount = REEL_COUNT,
  rowCount = ROWS
): GridPosition[] {
  const neighbors: GridPosition[] = [];

  for (const delta of FLAG_NEIGHBOR_DELTAS) {
    const reel = origin.reel + delta.reel;
    const row = origin.row + delta.row;

    if (reel < 0 || reel >= reelCount || row < 0 || row >= rowCount) {
      continue;
    }

    neighbors.push({ reel, row });
  }

  return neighbors;
}

/**
 * One step per in-bounds cardinal neighbor. Flags run in reading order, and
 * each flag's neighbors run clockwise from the cell above it. A cell that
 * neighbors two flags is advanced once for each flag.
 */
export function listFlagAdvances(
  bonusPositions: GridPosition[],
  rowCount = ROWS,
  reelCount = REEL_COUNT
): GridPosition[] {
  const advances: GridPosition[] = [];

  for (const start of sortBonusPositionsReadingOrder(bonusPositions)) {
    advances.push(...getFlagNeighborPositions(start, reelCount, rowCount));
  }

  return advances;
}

/**
 * Duplicate each starter BONUS onto the matching cell in the lower half of a
 * tall (6-row) grid: `(reel, row)` → also `(reel, row + baseRows)`.
 * Expects positions already expressed in top-aligned tall-grid coordinates
 * (originals in rows 0..baseRows-1).
 */
export function expandBonusPositionsForTallGrid(
  positions: GridPosition[],
  baseRows = ROWS
): GridPosition[] {
  const unique = new Map<string, GridPosition>();

  for (const position of positions) {
    unique.set(positionKey(position), position);
    const mirrored = { reel: position.reel, row: position.row + baseRows };
    unique.set(positionKey(mirrored), mirrored);
  }

  return [...unique.values()];
}

/**
 * Build the 6-row intro grid for Super Flag Bonus: keep the triggering
 * 3-row window pinned to the top, fill the lower rows from the strip (with any
 * strip BONUS removed), then place only the mirrored copies of the trigger
 * BONUS symbols so originals + duplicates are the sole BONUS on screen.
 */
export function buildTallBonusIntroGrid(
  grid: SymbolId[][],
  stops: number[],
  isFreeSpin = false
): SymbolId[][] {
  const reelSet = getReelSet(isFreeSpin, false, false, false, false, false);
  const prevTopOffset = Math.floor((ROWS - 1) / 2);
  const fillers: SymbolId[] = ['A', 'K', 'Q', 'J', 'PREM1', 'PREM2', 'PREM3'];

  return grid.map((column, reelIndex) => {
    const startIndex =
      (stops[reelIndex] - prevTopOffset + REEL_LENGTH) % REEL_LENGTH;
    const tall = getStripSlice(reelSet[reelIndex], startIndex, SUPER_HAT_ROWS);

    for (let row = 0; row < ROWS; row++) {
      tall[row] = column[row];
    }

    // Lower half must not keep any strip BONUS — only mirrored triggers later.
    for (let row = ROWS; row < SUPER_HAT_ROWS; row++) {
      if (tall[row] === 'BONUS') {
        tall[row] = fillers[Math.floor(Math.random() * fillers.length)];
      }
    }

    for (let row = 0; row < ROWS; row++) {
      if (column[row] === 'BONUS') {
        tall[row + ROWS] = 'BONUS';
      }
    }

    return tall;
  });
}

/** @deprecated Use buildTallBonusIntroGrid — kept as an alias. */
export const buildSuperBuzzSawIntroGrid = buildTallBonusIntroGrid;

/**
 * Pin the triggering 3-row window to the top of a 6-row Ultra Crown grid.
 * The new rows are plain symbols so the extra reels start empty of crowns.
 */
export function buildUltraCrownIntroGrid(grid: SymbolId[][]): SymbolId[][] {
  const fillers: SymbolId[] = ['A', 'K', 'Q', 'J', 'PREM1', 'PREM2', 'PREM3'];

  return grid.map((column) => {
    const tall = column.slice(0, ROWS);

    while (tall.length < SUPER_HAT_ROWS) {
      tall.push(fillers[Math.floor(Math.random() * fillers.length)]);
    }

    return tall;
  });
}

/** Advance each flag's four cardinal neighbors by one color tier. */
export function applyFlagAdvances(
  cells: HatBonusCell[],
  bonusPositions: GridPosition[],
  mode: HatBonusMode = 'buzzSaw',
  rowCount = ROWS
): HatBonusCell[] {
  let next = cells;

  for (const position of listFlagAdvances(bonusPositions, rowCount)) {
    next = applyPowerSawPaint(next, position, mode);
  }

  return next;
}

/**
 * Instant Flag Bonus setup for simulation: each flag advances the four
 * in-bounds cells above, right, below, and left of it.
 */
export function buildBuzzSawInitialState(
  bonusPositions: GridPosition[],
  bet: number,
  freeSpins = HAT_BONUS_FREE_SPINS,
  mode: Extract<HatBonusMode, 'buzzSaw' | 'superBuzzSaw'> = 'buzzSaw',
  denomination: number = DEFAULT_DENOMINATION
): HatBonusState {
  const rowCount = getHatBonusRowCount(mode);
  const starts =
    mode === 'superBuzzSaw'
      ? expandBonusPositionsForTallGrid(bonusPositions)
      : bonusPositions;
  return {
    bet,
    denomination,
    spinsRemaining: freeSpins,
    cells: applyFlagAdvances([], starts, mode, rowCount),
    blueHitPayout: 0,
    mode,
  };
}

export function applyPowerSawPaint(
  cells: HatBonusCell[],
  position: GridPosition,
  mode: HatBonusMode = 'hat'
): HatBonusCell[] {
  const key = positionKey(position);
  const existing = cells.find((cell) => positionKey(cell) === key);
  const nextColor = upgradeHatCellColor(existing?.color, mode);
  const nextCell: HatBonusCell = {
    reel: position.reel,
    row: position.row,
    color: nextColor,
    prize: null,
    jackpot: null,
  };

  if (!existing) {
    return [...cells, nextCell];
  }

  return cells.map((cell) => (positionKey(cell) === key ? nextCell : cell));
}

/**
 * Sample a value in [min, max] biased toward the low end so the expected
 * value is `targetMeanFraction` of a uniform roll's mean (default 0.9 → ~10%
 * lower average hat-cell awards).
 */
function lowBiasedInRange(
  min: number,
  max: number,
  targetMeanFraction = 0.9
): number {
  const span = max - min;

  if (span <= 0) {
    return min;
  }

  const targetMean = targetMeanFraction * ((min + max) / 2);
  const excessAboveMin = targetMean - min;

  // For U^p on [0,1], E[min + span*U^p] = min + span/(p+1).
  const power =
    excessAboveMin > 0 ? Math.max(1, span / excessAboveMin - 1) : 1;

  return min + span * Math.pow(Math.random(), power);
}

export function rollHatCellPrize(
  color: HatCellColor,
  bet: number,
  pool: ProgressiveJackpotPool = createProgressiveJackpotPool(),
  denomination: number = DEFAULT_DENOMINATION
): { prize: number; jackpot: JackpotId | null } {
  const jackpotRoll = rollHatCellJackpot(color, bet, pool, denomination);

  if (jackpotRoll) {
    return {
      prize: jackpotRoll.prize,
      jackpot: jackpotRoll.jackpot,
    };
  }

  const [minMultiplier, maxMultiplier] = HAT_CELL_PRIZE_RANGES[color];
  const multiplier = lowBiasedInRange(minMultiplier, maxMultiplier);
  const rawPrize = Math.max(denomination, multiplier * bet);

  return {
    prize: snapToDenomination(rawPrize, denomination),
    jackpot: null,
  };
}

export function createHatBonusState(
  positions: GridPosition[],
  bet: number,
  freeSpins = HAT_BONUS_FREE_SPINS,
  mode: HatBonusMode = 'hat',
  denomination: number = DEFAULT_DENOMINATION
): HatBonusState {
  const unique = new Map<string, HatBonusCell>();
  const initialColor = getHatBonusInitialColor(mode);

  for (const position of positions) {
    unique.set(positionKey(position), {
      reel: position.reel,
      row: position.row,
      color: initialColor,
      prize: null,
      jackpot: null,
    });
  }

  return {
    bet,
    denomination,
    spinsRemaining: freeSpins,
    cells: [...unique.values()],
    blueHitPayout: 0,
    mode,
  };
}

export function createHatBonusStateFromCells(
  cells: HatBonusCell[],
  bet: number,
  freeSpins = HAT_BONUS_FREE_SPINS,
  mode: HatBonusMode = 'hat',
  denomination: number = DEFAULT_DENOMINATION
): HatBonusState {
  return {
    bet,
    denomination,
    spinsRemaining: freeSpins,
    cells: cells.map((cell) => ({ ...cell, prize: null, jackpot: null })),
    blueHitPayout: 0,
    mode,
  };
}

/**
 * When a hat lands on blue, overflow to the best non-blue cell:
 * red → green → yellow → empty. Returns null only when every cell is blue.
 */
export function findBlueOverflowTarget(
  cellMap: Map<string, HatBonusCell>,
  reelCount = REEL_COUNT,
  rowCount = ROWS
): GridPosition | null {
  const red: GridPosition[] = [];
  const green: GridPosition[] = [];
  const yellow: GridPosition[] = [];
  const empty: GridPosition[] = [];

  for (let reel = 0; reel < reelCount; reel++) {
    for (let row = 0; row < rowCount; row++) {
      const cell = cellMap.get(positionKey({ reel, row }));

      if (!cell) {
        empty.push({ reel, row });
        continue;
      }

      if (cell.color === 'red') {
        red.push({ reel, row });
      } else if (cell.color === 'green') {
        green.push({ reel, row });
      } else if (cell.color === 'yellow') {
        yellow.push({ reel, row });
      }
    }
  }

  return red[0] ?? green[0] ?? yellow[0] ?? empty[0] ?? null;
}

/**
 * When a hat lands on red in a non-Ultra bonus, overflow to a cell that can
 * still progress: green → yellow → empty. Returns null when every cell is red.
 */
export function findRedOverflowTarget(
  cellMap: Map<string, HatBonusCell>,
  reelCount = REEL_COUNT,
  rowCount = ROWS
): GridPosition | null {
  const green: GridPosition[] = [];
  const yellow: GridPosition[] = [];
  const empty: GridPosition[] = [];

  for (let reel = 0; reel < reelCount; reel++) {
    for (let row = 0; row < rowCount; row++) {
      const cell = cellMap.get(positionKey({ reel, row }));

      if (!cell) {
        empty.push({ reel, row });
        continue;
      }

      if (cell.color === 'green') {
        green.push({ reel, row });
      } else if (cell.color === 'yellow') {
        yellow.push({ reel, row });
      }
    }
  }

  return green[0] ?? yellow[0] ?? empty[0] ?? null;
}

function applyOverflowHit(
  cellMap: Map<string, HatBonusCell>,
  from: GridPosition,
  bet: number,
  mode: HatBonusMode | undefined,
  findTarget: (
    cellMap: Map<string, HatBonusCell>,
    reelCount?: number,
    rowCount?: number
  ) => GridPosition | null,
  hitMultiplier: number,
  denomination: number,
  transitions?: CellColorTransition[]
): {
  blueHitPayout: number;
  upgradedPositions: GridPosition[];
  redirects: HatBonusRedirect[];
} {
  const rowCount = getHatBonusRowCount(mode);
  const target = findTarget(cellMap, REEL_COUNT, rowCount);

  if (!target) {
    return {
      blueHitPayout: snapToDenomination(hitMultiplier * bet, denomination),
      upgradedPositions: [from],
      redirects: [],
    };
  }

  const color = upgradeCellAt(cellMap, target, mode, transitions);

  if (!color) {
    return {
      blueHitPayout: snapToDenomination(hitMultiplier * bet, denomination),
      upgradedPositions: [from],
      redirects: [],
    };
  }

  return {
    blueHitPayout: 0,
    upgradedPositions: [target],
    redirects: [{ from, to: target, color }],
  };
}

function upgradeCellAt(
  cellMap: Map<string, HatBonusCell>,
  position: GridPosition,
  mode?: HatBonusMode,
  transitions?: CellColorTransition[]
): HatCellColor | null {
  const key = positionKey(position);
  const cell = cellMap.get(key);

  if (!cell) {
    const color = getHatBonusInitialColor(mode);
    cellMap.set(key, {
      reel: position.reel,
      row: position.row,
      color,
      prize: null,
      jackpot: null,
    });
    recordColorTransition(transitions, position, null, color);
    return color;
  }

  if (cell.color === 'blue') {
    return null;
  }

  const upgradedColor = nextCellColor(cell.color, mode);

  if (!upgradedColor) {
    return null;
  }

  recordColorTransition(transitions, position, cell.color, upgradedColor);
  cell.color = upgradedColor;
  cellMap.set(key, cell);
  return upgradedColor;
}

function applyHatUpgradeSteps(
  cellMap: Map<string, HatBonusCell>,
  position: GridPosition,
  steps: number,
  bet: number,
  mode?: HatBonusMode,
  transitions?: CellColorTransition[],
  denomination: number = DEFAULT_DENOMINATION
): {
  blueHitPayout: number;
  upgradedPositions: GridPosition[];
  redirects: HatBonusRedirect[];
} {
  let blueHitPayout = 0;
  const upgradedPositions: GridPosition[] = [];
  const redirects: HatBonusRedirect[] = [];
  const key = positionKey(position);
  const initialColor = getHatBonusInitialColor(mode);

  for (let step = 0; step < steps; step++) {
    const cell = cellMap.get(key);

    if (!cell) {
      cellMap.set(key, {
        reel: position.reel,
        row: position.row,
        color: initialColor,
        prize: null,
        jackpot: null,
      });
      recordColorTransition(transitions, position, null, initialColor);
      upgradedPositions.push(position);
      continue;
    }

    if (cell.color === 'blue') {
      const overflow = applyOverflowHit(
        cellMap,
        position,
        bet,
        mode,
        findBlueOverflowTarget,
        HAT_BONUS_BLUE_HIT_MULTIPLIER,
        denomination,
        transitions
      );
      blueHitPayout += overflow.blueHitPayout;
      upgradedPositions.push(...overflow.upgradedPositions);
      redirects.push(...overflow.redirects);
      continue;
    }

    const upgradedColor = nextCellColor(cell.color, mode);

    if (!upgradedColor) {
      // Non-Ultra modes cap at red: overflow like blue, or 10× if board is full red.
      // Flag Bonus never awards the red board-full cash prize when crossing/hitting red.
      const overflow = applyOverflowHit(
        cellMap,
        position,
        bet,
        mode,
        findRedOverflowTarget,
        mode === 'buzzSaw' || mode === 'superBuzzSaw'
          ? 0
          : HAT_BONUS_RED_HIT_MULTIPLIER,
        denomination,
        transitions
      );
      blueHitPayout += overflow.blueHitPayout;
      upgradedPositions.push(...overflow.upgradedPositions);
      redirects.push(...overflow.redirects);
      continue;
    }

    recordColorTransition(transitions, position, cell.color, upgradedColor);
    cell.color = upgradedColor;
    cellMap.set(key, cell);
    upgradedPositions.push(position);
  }

  return {
    blueHitPayout: snapToDenomination(blueHitPayout, denomination),
    upgradedPositions,
    redirects,
  };
}

export function applyHatBonusSpin(
  state: HatBonusState,
  grid: SymbolId[][]
): HatBonusSpinResult {
  const hatHits = findAllHatHits(grid);
  const cellMap = new Map(
    state.cells.map((cell) => [positionKey(cell), { ...cell }])
  );
  const upgradedPositions: GridPosition[] = [];
  const redirects: HatBonusRedirect[] = [];
  const colorTransitions: CellColorTransition[] = [];
  let blueHitPayout = 0;

  for (const hit of hatHits) {
    const { reel, row, steps } = hit;
    const position = { reel, row };
    const result = applyHatUpgradeSteps(
      cellMap,
      position,
      steps,
      state.bet,
      state.mode,
      colorTransitions,
      state.denomination
    );

    blueHitPayout += result.blueHitPayout;
    upgradedPositions.push(...result.upgradedPositions);
    redirects.push(...result.redirects);
  }

  const hatCount = hatHits.length;
  const bonusCount = isBonusKeepingMode(state.mode)
    ? findBonusPositions(grid).length
    : 0;
  const extraSpinAwarded = isBonusKeepingMode(state.mode)
    ? hatCount + bonusCount >= HAT_BONUS_EXTRA_SPIN_HAT_COUNT
    : hatCount >= HAT_BONUS_EXTRA_SPIN_HAT_COUNT;
  const spinsRemaining =
    Math.max(0, state.spinsRemaining - 1) + (extraSpinAwarded ? 1 : 0);

  return {
    state: {
      ...state,
      spinsRemaining,
      cells: [...cellMap.values()],
      blueHitPayout: snapToDenomination(
        state.blueHitPayout + blueHitPayout,
        state.denomination
      ),
    },
    hatCount,
    upgradedPositions,
    redirects,
    blueHitPayout: snapToDenomination(blueHitPayout, state.denomination),
    extraSpinAwarded,
    colorBatches: groupColorTransitionsIntoBatches(colorTransitions),
  };
}

export function resolveHatBonusPrizes(
  state: HatBonusState,
  pool: ProgressiveJackpotPool = createProgressiveJackpotPool()
): HatBonusResult {
  let currentPool = cloneProgressiveJackpotPool(pool);
  const cells = state.cells.map((cell) => {
    const rolled = rollHatCellPrize(
      cell.color,
      state.bet,
      currentPool,
      state.denomination
    );

    if (rolled.jackpot && isProgressiveJackpot(rolled.jackpot)) {
      currentPool = resetProgressiveJackpot(
        currentPool,
        rolled.jackpot,
        state.denomination
      );
    }

    return {
      ...cell,
      prize: rolled.prize,
      jackpot: rolled.jackpot,
    };
  });

  const reveals: HatBonusPrizeReveal[] = HAT_CELL_COLOR_ORDER.map((color) => {
    const colorCells = cells.filter(
      (cell): cell is HatBonusCell & { prize: number; jackpot: JackpotId | null } =>
        cell.color === color && cell.prize !== null
    );

    return {
      color,
      cells: colorCells,
      payout: snapToDenomination(
        colorCells.reduce((sum, cell) => sum + cell.prize, 0),
        state.denomination
      ),
    };
  }).filter((reveal) => reveal.cells.length > 0);

  const endPrizePayout = snapToDenomination(
    reveals.reduce((sum, reveal) => sum + reveal.payout, 0),
    state.denomination
  );

  return {
    blueHitPayout: snapToDenomination(state.blueHitPayout, state.denomination),
    endPrizePayout,
    totalPayout: snapToDenomination(
      state.blueHitPayout + endPrizePayout,
      state.denomination
    ),
    reveals,
    cells,
    progressivePool: currentPool,
  };
}

export function simulateHatBonus(
  bet: number,
  triggerPositions: GridPosition[],
  spinGrids: SymbolId[][][],
  denomination: number = DEFAULT_DENOMINATION
): HatBonusResult {
  let state = createHatBonusState(
    triggerPositions,
    bet,
    undefined,
    'hat',
    denomination
  );
  let gridIndex = 0;
  const emptyGrid: SymbolId[][] = Array.from({ length: 5 }, () =>
    Array.from({ length: 3 }, () => 'A' as SymbolId)
  );

  while (state.spinsRemaining > 0) {
    const grid = spinGrids[gridIndex] ?? emptyGrid;
    gridIndex++;

    const spinResult = applyHatBonusSpin(state, grid);
    state = spinResult.state;

    // Guard against runaway extra-spin loops in simulation.
    if (gridIndex > spinGrids.length + 50) {
      state = { ...state, spinsRemaining: 0 };
    }
  }

  return resolveHatBonusPrizes(state);
}
