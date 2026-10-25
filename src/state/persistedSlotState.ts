import { normalizeBetSelection } from '../game/bets';
import {
  DEFAULT_BET_MULTIPLIER,
  DEFAULT_DENOMINATION,
  HAT_CELL_COLOR_ORDER,
  isDenomination,
  REEL_COUNT,
  SUPER_HAT_ROWS,
  type HatCellColor,
  type JackpotId,
} from '../game/config';
import type { HatBonusCell, HatBonusMode, HatBonusState } from '../game/hatBonus';
import {
  createProgressiveJackpotPool,
  denominationKey,
  type ProgressiveJackpotPool,
} from '../game/progressiveJackpots';

export interface FreeSpinSessionState {
  active: boolean;
  totalWon: number;
}

export interface PersistedSlotState {
  balance: number;
  denomination: number;
  betMultiplier: number;
  bet: number;
  freeSpinsRemaining: number;
  progressiveJackpots: ProgressiveJackpotPool;
  hatBonus: HatBonusState | null;
  hatBonusSessionWon: number;
  freeSpinSession: FreeSpinSessionState;
}

/** Old single-dollar presets → coin × 100 so a $1 save stays a $1 wager. */
const LEGACY_BET_SELECTIONS: Record<
  number,
  { denomination: number; betMultiplier: number }
> = {
  1: { denomination: 0.01, betMultiplier: 100 },
  5: { denomination: 0.05, betMultiplier: 100 },
  10: { denomination: 0.1, betMultiplier: 100 },
  25: { denomination: 0.25, betMultiplier: 100 },
};

export const EMPTY_FREE_SPIN_SESSION: FreeSpinSessionState = {
  active: false,
  totalWon: 0,
};

const HAT_BONUS_MODES: HatBonusMode[] = [
  'hat',
  'powerSaw',
  'superPowerSaw',
  'megaHat',
  'ultraHat',
  'superHat',
  'mansions',
  'buzzSaw',
  'superBuzzSaw',
];

const JACKPOT_IDS: JackpotId[] = ['mini', 'minor', 'major', 'grand'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readNonNegativeInt(value: unknown, fallback = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.floor(value));
}

function isHatCellColor(value: unknown): value is HatCellColor {
  return HAT_CELL_COLOR_ORDER.includes(value as HatCellColor);
}

function isHatBonusMode(value: unknown): value is HatBonusMode {
  return HAT_BONUS_MODES.includes(value as HatBonusMode);
}

function isJackpotId(value: unknown): value is JackpotId {
  return JACKPOT_IDS.includes(value as JackpotId);
}

function readHatBonusCell(value: unknown): HatBonusCell | null {
  if (!isRecord(value)) {
    return null;
  }

  const reel = readNonNegativeInt(value.reel, -1);
  const row = readNonNegativeInt(value.row, -1);

  if (reel < 0 || reel >= REEL_COUNT || row < 0 || row >= SUPER_HAT_ROWS) {
    return null;
  }

  if (!isHatCellColor(value.color)) {
    return null;
  }

  const prize =
    value.prize === null || value.prize === undefined
      ? null
      : readFiniteNumber(value.prize, 0);
  const jackpot =
    value.jackpot === null || value.jackpot === undefined
      ? null
      : isJackpotId(value.jackpot)
        ? value.jackpot
        : null;

  return {
    reel,
    row,
    color: value.color,
    prize,
    jackpot,
  };
}

export function readHatBonus(
  value: unknown,
  fallbackDenomination = DEFAULT_DENOMINATION
): HatBonusState | null {
  if (!isRecord(value)) {
    return null;
  }

  const bet = readFiniteNumber(value.bet, 0);
  const spinsRemaining = readNonNegativeInt(value.spinsRemaining, 0);

  if (bet <= 0 || spinsRemaining <= 0) {
    return null;
  }

  const denomination = readFiniteNumber(
    value.denomination,
    fallbackDenomination
  );

  const mode = value.mode;
  if (mode !== undefined && !isHatBonusMode(mode)) {
    return null;
  }

  const cells = Array.isArray(value.cells)
    ? value.cells
        .map(readHatBonusCell)
        .filter((cell): cell is HatBonusCell => cell !== null)
    : [];

  return {
    bet,
    denomination: denomination > 0 ? denomination : DEFAULT_DENOMINATION,
    spinsRemaining,
    cells,
    blueHitPayout: Math.max(0, readFiniteNumber(value.blueHitPayout, 0)),
    mode: isHatBonusMode(mode) ? mode : undefined,
  };
}

function readFreeSpinSession(value: unknown): FreeSpinSessionState {
  if (!isRecord(value)) {
    return { ...EMPTY_FREE_SPIN_SESSION };
  }

  return {
    active: value.active === true,
    totalWon: Math.max(0, readFiniteNumber(value.totalWon, 0)),
  };
}

function readProgressivePool(
  parsed: Record<string, unknown>,
  fallbackDenomination: number
): ProgressiveJackpotPool {
  const pool = isRecord(parsed.progressiveJackpots)
    ? parsed.progressiveJackpots
    : null;
  const grandExtra = Math.max(
    0,
    readFiniteNumber(pool?.grandExtra ?? parsed.progressiveGrandExtra, 0)
  );
  const extras: Record<string, number> = {};
  const rawExtras = pool?.majorExtraByDenomination;

  if (isRecord(rawExtras)) {
    for (const [key, value] of Object.entries(rawExtras)) {
      const amount = readFiniteNumber(value, 0);
      if (amount > 0) {
        extras[key] = amount;
      }
    }
  }

  const legacyMajor = Math.max(
    0,
    readFiniteNumber(pool?.majorExtra ?? parsed.progressiveMajorExtra, 0)
  );

  if (Object.keys(extras).length === 0 && legacyMajor > 0) {
    extras[denominationKey(fallbackDenomination)] = legacyMajor;
  }

  return {
    majorExtraByDenomination: extras,
    grandExtra,
  };
}

export function parsePersistedSlotState(
  raw: string | null
): PersistedSlotState {
  const defaultSelection = normalizeBetSelection(
    DEFAULT_DENOMINATION,
    DEFAULT_BET_MULTIPLIER
  );
  const defaults: PersistedSlotState = {
    balance: 1000,
    denomination: defaultSelection.denomination,
    betMultiplier: defaultSelection.betMultiplier,
    bet: defaultSelection.bet,
    freeSpinsRemaining: 0,
    progressiveJackpots: createProgressiveJackpotPool(),
    hatBonus: null,
    hatBonusSessionWon: 0,
    freeSpinSession: { ...EMPTY_FREE_SPIN_SESSION },
  };

  if (!raw) {
    return defaults;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaults;
  }

  if (!isRecord(parsed)) {
    return defaults;
  }

  const hasDenomFields =
    typeof parsed.denomination === 'number' &&
    Number.isFinite(parsed.denomination) &&
    typeof parsed.betMultiplier === 'number' &&
    Number.isFinite(parsed.betMultiplier);
  const legacyBet = readFiniteNumber(parsed.bet, defaultSelection.bet);
  const legacySelection = LEGACY_BET_SELECTIONS[legacyBet];
  let selection = hasDenomFields
    ? normalizeBetSelection(
        parsed.denomination as number,
        parsed.betMultiplier as number
      )
    : legacySelection
      ? normalizeBetSelection(
          legacySelection.denomination,
          legacySelection.betMultiplier
        )
      : defaultSelection;

  const hatBonus = readHatBonus(parsed.hatBonus, selection.denomination);
  const freeSpinsRemaining = readNonNegativeInt(parsed.freeSpinsRemaining, 0);
  let freeSpinSession = readFreeSpinSession(parsed.freeSpinSession);

  if (freeSpinsRemaining > 0 && !freeSpinSession.active) {
    freeSpinSession = { active: true, totalWon: freeSpinSession.totalWon };
  }

  if (freeSpinsRemaining === 0 && !hatBonus) {
    freeSpinSession = { ...EMPTY_FREE_SPIN_SESSION };
  }

  if (hatBonus) {
    const hatMultiplier =
      hatBonus.denomination > 0
        ? hatBonus.bet / hatBonus.denomination
        : selection.betMultiplier;
    selection = {
      denomination: isDenomination(hatBonus.denomination)
        ? hatBonus.denomination
        : selection.denomination,
      betMultiplier: hatMultiplier,
      bet: hatBonus.bet,
    };
  }

  return {
    balance: Math.max(0, readFiniteNumber(parsed.balance, 1000)),
    denomination: selection.denomination,
    betMultiplier: selection.betMultiplier,
    bet: selection.bet,
    freeSpinsRemaining,
    progressiveJackpots: readProgressivePool(parsed, selection.denomination),
    hatBonus,
    hatBonusSessionWon: hatBonus
      ? Math.max(0, readFiniteNumber(parsed.hatBonusSessionWon, 0))
      : 0,
    freeSpinSession,
  };
}
