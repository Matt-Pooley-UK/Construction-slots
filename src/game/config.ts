import type { SymbolId } from './symbols';

/** Coin denominations in dollars. */
export const DENOMINATIONS = [0.01, 0.02, 0.05, 0.1, 0.25, 1, 2, 5, 10] as const;
export type Denomination = (typeof DENOMINATIONS)[number];

/** Default bet ladder: multipliers of the selected denomination. */
export const DEFAULT_BET_MULTIPLIERS = [50, 100, 150, 200, 250] as const;

/**
 * Optional per-denomination bet ladders. Missing keys use
 * `DEFAULT_BET_MULTIPLIERS`. Values are multipliers of that coin.
 */
export const DENOMINATION_BET_MULTIPLIERS: Partial<
  Record<Denomination, readonly number[]>
> = {};

export const DEFAULT_DENOMINATION: Denomination = 0.01;
export const DEFAULT_BET_MULTIPLIER = 100;

export function isDenomination(value: number): value is Denomination {
  return (DENOMINATIONS as readonly number[]).includes(value);
}

export function getBetMultipliers(denomination: number): readonly number[] {
  if (isDenomination(denomination)) {
    return DENOMINATION_BET_MULTIPLIERS[denomination] ?? DEFAULT_BET_MULTIPLIERS;
  }

  return DEFAULT_BET_MULTIPLIERS;
}

export const AUTO_SPIN_OPTIONS = [10, 25, 50] as const;

export const REEL_COUNT = 5;
export const REEL_LENGTH = 200;
export const ROWS = 3;
export const WILDS_PER_REEL = 10;
export const FREE_SPIN_EXTRA_WILDS_PER_REEL = 10;
export const FREE_SPIN_WILD_LINE_MULTIPLIER = 2;
export const BONUS_PER_REEL = 6;
/** Chance each reel strip gets one extra BONUS symbol (spacing rules still apply). */
export const BONUS_EXTRA_PER_REEL_CHANCE = 0.28;
export const BONUS_MIN_SPACING = 3;
export const HAT_CLUSTER_SIZES = [2, 3] as const;
/** Tuned for ~100% RTP with current features (was 4 / 8). */
export const HAT_CLUSTERS_PER_REEL = 3;
export const HAT_SINGLES_PER_REEL = 7;
export const HAT_TRIGGER_COUNT = 6;
export const HAT_BONUS_FREE_SPINS = 6;
export const HAT_BONUS_EXTRA_SPIN_HAT_COUNT = 3;
export const HAT_BONUS_BLUE_HIT_MULTIPLIER = 20;
/** Instant prize when a non-Ultra hat bonus has a full red board and a hat hits red. */
export const HAT_BONUS_RED_HIT_MULTIPLIER = 10;
export const HAT_BONUS_REVEAL_DELAY_MS = 5000;
/** Duration for a blue-overflow hat flying to its redirect target cell. */
export const HAT_BLUE_REDIRECT_MS = 340;
export const HAT_BLUE_REDIRECT_GAP_MS = 90;
/** Clockwise color wipe when hat bonus cells upgrade. */
export const HAT_COLOR_TRANSITION_MS = 720;
export const POWER_SAW_STEP_MS = 280;
export const POWER_SAW_SWEEP_GAP_MS = 180;
export const MEGA_HAT_SPIN_MS = 5000;
export const MEGA_HAT_STRIP_COUNT = 10;
/** Vertical spacing between successive mega hats during the intro spin (in cell heights). */
export const MEGA_HAT_STRIP_SPACING_CELLS = 3.4;
/** Extra vertical gap between Super Hat intro symbols so tall hats never overlap. */
export const SUPER_HAT_STRIP_GAP_CELLS = 0.35;
/** Per-reel 2× hat symbols injected onto Ultra Hat bonus strips. */
export const ULTRA_HAT_2X_PER_REEL = 5;
/** Per-reel 3× hat symbols injected onto Ultra Hat bonus strips. */
export const ULTRA_HAT_3X_PER_REEL = 3;
/** Visible rows during Super Hat bonus (base game stays at ROWS). */
export const SUPER_HAT_ROWS = 6;
/** Wheel weight so Super Hat is ~8% of landings among current sections. */
export const SUPER_HAT_WHEEL_WEIGHT = 0.47;
/** Wheel weight so Super Buzz Saw is ~5% of landings among current sections. */
export const SUPER_BUZZ_SAW_WHEEL_WEIGHT = 0.31;
/** Wheel weight so Super Power Saw is ~5% of landings among current sections. */
export const SUPER_POWER_SAW_WHEEL_WEIGHT = 0.33;
/** Wheel weight so Upgrade is ~5% of landings on the main bonus wheel. */
export const UPGRADE_WHEEL_WEIGHT = 0.331;
/** Wheel weight so Mansions is ~2.5% of landings on the main bonus wheel. */
export const MANSIONS_WHEEL_WEIGHT = 0.166;
/** Wheel weight so Mini / Minor are ~10% each on the main bonus wheel. */
export const JACKPOT_WHEEL_WEIGHT = 0.662;
/** Wheel weight so Major is ~5% on the upgrade wheel. */
export const MAJOR_JACKPOT_UPGRADE_WHEEL_WEIGHT = 0.077;
/** HATs removed from each Super Hat bonus strip vs normal hat-bonus density. */
export const SUPER_HAT_HATS_REMOVED_PER_REEL = 5;
/** Fraction of BONUS symbols kept on Super Buzz / Power Saw strips (vs free-spin). */
export const SUPER_BUZZ_SAW_BONUS_KEEP_FRACTION = 0.5;

export type JackpotId = 'mini' | 'minor' | 'major' | 'grand';

/**
 * Mini / Minor / Major seeds as multiples of the selected **coin**
 * (not the total wager). Grand uses `GRAND_JACKPOT_SEED` so the meter
 * stays the same at every bet.
 */
export const JACKPOT_BET_MULTIPLIERS: Record<
  Exclude<JackpotId, 'grand'>,
  number
> = {
  mini: 1000,
  minor: 3000,
  major: 7500,
};

/** Shared Grand reset amount in dollars. */
export const GRAND_JACKPOT_SEED = 10000;

/** Blue-cell mini/minor awards use this multiplier of the base jackpot. */
export const BLUE_JACKPOT_MINI_MINOR_MULTIPLIER = 3;

/** Chance a green hat cell reveals Mini instead of a normal prize. */
export const GREEN_MINI_JACKPOT_CHANCE = 0.01;

/**
 * Exclusive red/blue jackpot reveal chances (checked rarest-first).
 * Remaining probability rolls a normal color prize.
 */
export const RED_BLUE_JACKPOT_CHANCES = {
  grand: 0.0001,
  major: 0.005,
  minor: 0.05,
  mini: 0.1,
} as const;

export type HatCellColor = 'yellow' | 'green' | 'red' | 'blue';

export const HAT_CELL_COLOR_ORDER: HatCellColor[] = [
  'yellow',
  'green',
  'red',
  'blue',
];

export const HAT_CELL_PRIZE_RANGES: Record<
  HatCellColor,
  readonly [number, number]
> = {
  yellow: [0.4, 1.2],
  green: [1.6, 3.2],
  red: [4.8, 12],
  blue: [12, 20],
};

/** Swatches for the hat-cell tiers. The reels draw white, red, then a diagonal step. */
export const HAT_CELL_HIGHLIGHT_COLORS: Record<HatCellColor, number> = {
  yellow: 0xffffff,
  green: 0xcf142b,
  red: 0xcf142b,
  blue: 0x012169,
};

/**
 * Live line-hit scale. Line wins pay this percent of `paytable` × bet.
 * Scatter, hat prizes, and jackpots are unscaled. Test Mode can override.
 */
export const DEFAULT_LINE_HIT_PAYOUT_PERCENT = 50;

let lineHitPayoutPercent = DEFAULT_LINE_HIT_PAYOUT_PERCENT;

export function getLineHitPayoutPercent(): number {
  return lineHitPayoutPercent;
}

export function setLineHitPayoutPercent(percent: number): void {
  lineHitPayoutPercent = Math.max(0, percent);
}

export const SYMBOL_WEIGHTS: Record<SymbolId, number> = {
  A: 18,
  K: 18,
  Q: 16,
  J: 14,
  PREM1: 10,
  PREM2: 10,
  PREM3: 8,
  WILD: 0,
  BONUS: 0,
  HAT: 0,
  HAT2: 0,
  HAT3: 0,
};

export const paytable: Record<SymbolId, number[]> = {
  A: [0, 0, 4, 8, 16],
  K: [0, 0, 4, 8, 16],
  Q: [0, 0, 3, 7, 14],
  J: [0, 0, 2, 6, 12],
  PREM1: [0, 0, 8, 20, 80],
  PREM2: [0, 0, 10, 25, 100],
  PREM3: [0, 5, 12, 30, 120],
  WILD: [0, 0, 0, 0, 120],
  BONUS: [0, 0, 5, 5, 50],
  HAT: [0, 0, 0, 0, 0],
  HAT2: [0, 0, 0, 0, 0],
  HAT3: [0, 0, 0, 0, 0],
};

export const SCATTER_PAYS: Record<number, number> = {
  3: 5,
  4: 20,
  5: 50,
};

export interface PaylineDefinition {
  id: string;
  name: string;
  rows: number[];
}

export const PAYLINES: PaylineDefinition[] = [
  { id: 'top', name: 'Top', rows: [0, 0, 0, 0, 0] },
  { id: 'middle', name: 'Middle', rows: [1, 1, 1, 1, 1] },
  { id: 'bottom', name: 'Bottom', rows: [2, 2, 2, 2, 2] },
  { id: 'v', name: 'V', rows: [0, 1, 2, 1, 0] },
  { id: 'chevron', name: 'Chevron', rows: [2, 1, 0, 1, 2] },
];

/**
 * Super Hat (6-row) paylines: 6 horizontals, 4 V shapes, 4 inverted Vs.
 */
export const SUPER_HAT_PAYLINES: PaylineDefinition[] = [
  { id: 'sh-h0', name: 'Row 1', rows: [0, 0, 0, 0, 0] },
  { id: 'sh-h1', name: 'Row 2', rows: [1, 1, 1, 1, 1] },
  { id: 'sh-h2', name: 'Row 3', rows: [2, 2, 2, 2, 2] },
  { id: 'sh-h3', name: 'Row 4', rows: [3, 3, 3, 3, 3] },
  { id: 'sh-h4', name: 'Row 5', rows: [4, 4, 4, 4, 4] },
  { id: 'sh-h5', name: 'Row 6', rows: [5, 5, 5, 5, 5] },
  { id: 'sh-v0', name: 'V 1', rows: [0, 1, 2, 1, 0] },
  { id: 'sh-v1', name: 'V 2', rows: [1, 2, 3, 2, 1] },
  { id: 'sh-v2', name: 'V 3', rows: [2, 3, 4, 3, 2] },
  { id: 'sh-v3', name: 'V 4', rows: [3, 4, 5, 4, 3] },
  { id: 'sh-iv0', name: 'Inv V 1', rows: [2, 1, 0, 1, 2] },
  { id: 'sh-iv1', name: 'Inv V 2', rows: [3, 2, 1, 2, 3] },
  { id: 'sh-iv2', name: 'Inv V 3', rows: [4, 3, 2, 3, 4] },
  { id: 'sh-iv3', name: 'Inv V 4', rows: [5, 4, 3, 4, 5] },
];

export interface GridPosition {
  reel: number;
  row: number;
}
