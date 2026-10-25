import type { SymbolId } from './symbols';
import {
  DEFAULT_DENOMINATION,
  getLineHitPayoutPercent,
  type GridPosition,
  type PaylineDefinition,
} from './config';
import { snapToDenomination } from './money';
import { evaluateBonusScatter } from './bonus';
import type { BonusResult } from './bonus';
import { evaluateHatTrigger } from './hatBonus';
import type { HatTriggerResult } from './hatBonus';
import { evaluateAllPaylines } from './paylines';
import type { PaylineWin } from './paylines';

export interface SpinEvaluation {
  paylineWins: PaylineWin[];
  bonusWin: BonusResult | null;
  hatTrigger: HatTriggerResult | null;
  totalPayout: number;
  winningPositions: GridPosition[];
}

function uniquePositions(positions: GridPosition[]): GridPosition[] {
  const seen = new Set<string>();

  return positions.filter((position) => {
    const key = `${position.reel}:${position.row}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function applyLineHitPayoutPercent(
  paylineWins: PaylineWin[],
  lineHitPayoutPercent: number,
  denomination: number
): PaylineWin[] {
  if (lineHitPayoutPercent === 100) {
    return paylineWins;
  }

  const multiplier = lineHitPayoutPercent / 100;

  return paylineWins.map((win) => ({
    ...win,
    payout: snapToDenomination(win.payout * multiplier, denomination),
  }));
}

export function evaluateSpin(
  grid: SymbolId[][],
  bet: number,
  lineHitPayoutPercent = getLineHitPayoutPercent(),
  isFreeSpin = false,
  paylines?: PaylineDefinition[],
  denomination: number = DEFAULT_DENOMINATION
): SpinEvaluation {
  const paylineWins = applyLineHitPayoutPercent(
    evaluateAllPaylines(grid, bet, isFreeSpin, paylines, denomination),
    lineHitPayoutPercent,
    denomination
  );
  const bonusWin = evaluateBonusScatter(grid, bet, denomination);
  const hatTrigger = evaluateHatTrigger(grid);

  const paylinePayout = paylineWins.reduce((sum, win) => sum + win.payout, 0);
  const bonusPayout = bonusWin?.payout ?? 0;

  const winningPositions = uniquePositions([
    ...paylineWins.flatMap((win) => win.positions),
    ...(bonusWin?.positions ?? []),
    ...(hatTrigger?.positions ?? []),
  ]);

  return {
    paylineWins,
    bonusWin,
    hatTrigger,
    totalPayout: snapToDenomination(paylinePayout + bonusPayout, denomination),
    winningPositions,
  };
}
