import { getBetTierFromWager, formatBetTierSuffix } from './bets';
import {
  BLUE_JACKPOT_MINI_MINOR_MULTIPLIER,
  DEFAULT_DENOMINATION,
  GREEN_MINI_JACKPOT_CHANCE,
  RED_BLUE_JACKPOT_CHANCES,
  type HatCellColor,
  type JackpotId,
} from './config';
import { roundMoney, snapToDenomination } from './money';
import {
  createProgressiveJackpotPool,
  getJackpotSeed,
  getProgressiveExtra,
  type ProgressiveJackpotPool,
} from './progressiveJackpots';

export const JACKPOT_LABELS: Record<JackpotId, string> = {
  mini: 'Mini',
  minor: 'Minor',
  major: 'Major',
  grand: 'Grand',
};

function usesBetTier(jackpot: JackpotId): boolean {
  return jackpot === 'mini' || jackpot === 'minor';
}

export function getJackpotPayout(
  jackpot: JackpotId,
  bet: number,
  awardMultiplier = 1,
  pool: ProgressiveJackpotPool = createProgressiveJackpotPool(),
  denomination: number = DEFAULT_DENOMINATION
): number {
  const extra = getProgressiveExtra(pool, jackpot, denomination);
  const seed = getJackpotSeed(jackpot, denomination);
  const betTier = usesBetTier(jackpot)
    ? getBetTierFromWager(denomination, bet)
    : 1;
  const amount = (seed + extra) * awardMultiplier * betTier;

  // Shared Grand stays the same dollar amount at every coin.
  if (jackpot === 'grand') {
    return roundMoney(amount);
  }

  return snapToDenomination(amount, denomination);
}

export function describeJackpot(
  jackpot: JackpotId,
  betTier = 1
): string {
  const suffix =
    usesBetTier(jackpot) ? formatBetTierSuffix(betTier) : '';
  return `${JACKPOT_LABELS[jackpot]}${suffix} Jackpot`;
}

export function formatJackpotShortLabel(
  jackpot: JackpotId,
  betTier = 1,
  options?: { uppercase?: boolean }
): string {
  const name = options?.uppercase
    ? JACKPOT_LABELS[jackpot].toUpperCase()
    : JACKPOT_LABELS[jackpot];
  const suffix = usesBetTier(jackpot) ? formatBetTierSuffix(betTier) : '';
  return `${name}${suffix}`;
}

export interface JackpotRoll {
  jackpot: JackpotId | null;
  /** Applied on top of the base jackpot (e.g. 3 for blue mini/minor). */
  awardMultiplier: number;
  prize: number;
}

function getGrandRevealChance(denomination: number, bet: number): number {
  return RED_BLUE_JACKPOT_CHANCES.grand * getBetTierFromWager(denomination, bet);
}

/**
 * Roll whether a hat-bonus cell reveals a jackpot. Yellow never does.
 * Green: 1% Mini. Red/Blue: exclusive cascade of Grand → Major → Minor → Mini.
 * Grand chance scales with the bet tier (1×–5×). Blue Mini/Minor pay 3×.
 */
export function rollHatCellJackpot(
  color: HatCellColor,
  bet: number,
  pool: ProgressiveJackpotPool = createProgressiveJackpotPool(),
  denomination: number = DEFAULT_DENOMINATION
): JackpotRoll | null {
  if (color === 'yellow') {
    return null;
  }

  if (color === 'green') {
    if (Math.random() >= GREEN_MINI_JACKPOT_CHANCE) {
      return null;
    }

    return {
      jackpot: 'mini',
      awardMultiplier: 1,
      prize: getJackpotPayout('mini', bet, 1, pool, denomination),
    };
  }

  const roll = Math.random();
  let cursor = 0;
  const chances: Record<JackpotId, number> = {
    grand: getGrandRevealChance(denomination, bet),
    major: RED_BLUE_JACKPOT_CHANCES.major,
    minor: RED_BLUE_JACKPOT_CHANCES.minor,
    mini: RED_BLUE_JACKPOT_CHANCES.mini,
  };
  const order: JackpotId[] = ['grand', 'major', 'minor', 'mini'];

  for (const jackpot of order) {
    cursor += chances[jackpot];

    if (roll < cursor) {
      const awardMultiplier =
        color === 'blue' && (jackpot === 'mini' || jackpot === 'minor')
          ? BLUE_JACKPOT_MINI_MINOR_MULTIPLIER
          : 1;

      return {
        jackpot,
        awardMultiplier,
        prize: getJackpotPayout(
          jackpot,
          bet,
          awardMultiplier,
          pool,
          denomination
        ),
      };
    }
  }

  return null;
}
