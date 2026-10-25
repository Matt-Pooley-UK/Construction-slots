import type { SymbolId } from './symbols';
import { isHatSymbol } from './symbols';
import {
  DEFAULT_DENOMINATION,
  paytable,
  PAYLINES,
  FREE_SPIN_WILD_LINE_MULTIPLIER,
  type GridPosition,
  type PaylineDefinition,
} from './config';
import { snapToDenomination } from './money';

export interface PaylineWin {
  paylineId: string;
  paylineName: string;
  symbol: SymbolId;
  matchCount: number;
  payout: number;
  wildCount: number;
  wildMultiplier: number;
  positions: GridPosition[];
}

function isWildSubstitute(symbol: SymbolId): boolean {
  return symbol === 'WILD';
}

function countWildsOnWinningSegment(
  grid: SymbolId[][],
  payline: PaylineDefinition,
  matchCount: number
): number {
  let wildCount = 0;

  for (let reel = 0; reel < matchCount; reel++) {
    if (grid[reel][payline.rows[reel]] === 'WILD') {
      wildCount++;
    }
  }

  return wildCount;
}

function getFreeSpinWildMultiplier(wildCount: number): number {
  if (wildCount <= 0) {
    return 1;
  }

  return FREE_SPIN_WILD_LINE_MULTIPLIER ** wildCount;
}

function evaluatePayline(
  grid: SymbolId[][],
  payline: PaylineDefinition,
  bet: number,
  isFreeSpin: boolean,
  denomination: number
): PaylineWin | null {
  const symbols = payline.rows.map((row, reel) => grid[reel][row]);
  let target: SymbolId | null = null;
  let count = 0;

  for (const symbol of symbols) {
    if (symbol === 'BONUS' || isHatSymbol(symbol)) {
      break;
    }

    if (isWildSubstitute(symbol)) {
      count++;
      continue;
    }

    if (target === null) {
      target = symbol;
      count++;
      continue;
    }

    if (symbol === target) {
      count++;
      continue;
    }

    break;
  }

  // Five (or 3–4) wilds with no substituting symbol still count as a WILD line.
  if (target === null && count >= 3) {
    target = 'WILD';
  }

  if (count < 3 || target === null) {
    return null;
  }

  const basePayout = paytable[target][count - 1] || 0;

  if (basePayout === 0) {
    return null;
  }

  const wildCount = countWildsOnWinningSegment(grid, payline, count);
  const wildMultiplier = isFreeSpin
    ? getFreeSpinWildMultiplier(wildCount)
    : 1;

  return {
    paylineId: payline.id,
    paylineName: payline.name,
    symbol: target,
    matchCount: count,
    payout: snapToDenomination(basePayout * bet * wildMultiplier, denomination),
    wildCount,
    wildMultiplier,
    positions: payline.rows
      .slice(0, count)
      .map((row, reel) => ({ reel, row })),
  };
}

export function evaluateAllPaylines(
  grid: SymbolId[][],
  bet: number,
  isFreeSpin = false,
  paylines: PaylineDefinition[] = PAYLINES,
  denomination: number = DEFAULT_DENOMINATION
): PaylineWin[] {
  return paylines
    .map((payline) =>
      evaluatePayline(grid, payline, bet, isFreeSpin, denomination)
    )
    .filter((win): win is PaylineWin => win !== null);
}
