import {
  DEFAULT_BET_MULTIPLIER,
  DEFAULT_DENOMINATION,
  getBetMultipliers,
  isDenomination,
  type Denomination,
} from './config';
import { getBetAmount } from './money';

export interface BetSelection {
  denomination: Denomination;
  betMultiplier: number;
  bet: number;
}

function nearestMultiplier(
  multipliers: readonly number[],
  requested: number
): number {
  if (multipliers.length === 0) {
    return DEFAULT_BET_MULTIPLIER;
  }

  return multipliers.reduce((best, candidate) =>
    Math.abs(candidate - requested) < Math.abs(best - requested)
      ? candidate
      : best
  );
}

export function normalizeBetSelection(
  denomination: number,
  multiplier: number
): BetSelection {
  const nextDenomination = isDenomination(denomination)
    ? denomination
    : DEFAULT_DENOMINATION;
  const multipliers = getBetMultipliers(nextDenomination);
  const betMultiplier = multipliers.includes(multiplier)
    ? multiplier
    : nearestMultiplier(multipliers, multiplier);

  return {
    denomination: nextDenomination,
    betMultiplier,
    bet: getBetAmount(nextDenomination, betMultiplier),
  };
}

export function pickAffordableMultiplier(
  denomination: number,
  multiplier: number,
  balance: number
): number {
  const selection = normalizeBetSelection(denomination, multiplier);
  const multipliers = getBetMultipliers(selection.denomination);

  if (getBetAmount(selection.denomination, selection.betMultiplier) <= balance) {
    return selection.betMultiplier;
  }

  const affordable = multipliers.filter(
    (value) => getBetAmount(selection.denomination, value) <= balance
  );

  if (affordable.length > 0) {
    return affordable[affordable.length - 1];
  }

  return multipliers[0] ?? selection.betMultiplier;
}

/** Lowest configured multiplier for a coin — the “base bet” for that denom. */
export function getBaseBetMultiplier(denomination: number): number {
  return getBetMultipliers(denomination)[0] ?? DEFAULT_BET_MULTIPLIER;
}

/**
 * How many times the current wager is of that coin’s base bet.
 * Default ladder 50 / 100 / 150 / 200 / 250 → 1 / 2 / 3 / 4 / 5.
 */
export function getBetTier(
  denomination: number,
  multiplier: number
): number {
  const base = getBaseBetMultiplier(denomination);

  if (!(base > 0) || !(multiplier > 0)) {
    return 1;
  }

  const exact = multiplier / base;
  const tier = Number.isInteger(exact) ? exact : Math.round(exact);
  return Math.max(1, tier);
}

export function getBetTierFromWager(
  denomination: number,
  bet: number
): number {
  if (!(denomination > 0)) {
    return 1;
  }

  return getBetTier(denomination, bet / denomination);
}

/** ` x 2` when the tier is above the base bet; empty at 1×. */
export function formatBetTierSuffix(tier: number): string {
  return tier > 1 ? ` x ${tier}` : '';
}
