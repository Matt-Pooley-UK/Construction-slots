import type { SymbolId } from './symbols';
import { DEFAULT_DENOMINATION, SCATTER_PAYS, type GridPosition } from './config';
import { snapToDenomination } from './money';

export interface BonusResult {
  count: number;
  payout: number;
  positions: GridPosition[];
}

export function evaluateBonusScatter(
  grid: SymbolId[][],
  bet: number,
  denomination: number = DEFAULT_DENOMINATION
): BonusResult | null {
  const positions: GridPosition[] = [];

  for (let reel = 0; reel < grid.length; reel++) {
    for (let row = 0; row < grid[reel].length; row++) {
      if (grid[reel][row] === 'BONUS') {
        positions.push({ reel, row });
      }
    }
  }

  if (positions.length < 3) {
    return null;
  }

  const bonusCount = positions.length;
  const tier = Math.min(bonusCount, 5);

  return {
    count: bonusCount,
    payout: snapToDenomination((SCATTER_PAYS[tier] || 0) * bet, denomination),
    positions,
  };
}
