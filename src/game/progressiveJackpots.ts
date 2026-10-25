import {
  DEFAULT_DENOMINATION,
  GRAND_JACKPOT_SEED,
  JACKPOT_BET_MULTIPLIERS,
  type JackpotId,
} from './config';
import { roundMoney, snapToDenomination } from './money';

export const PROGRESSIVE_JACKPOT_IDS = ['major', 'grand'] as const;
export type ProgressiveJackpotId = (typeof PROGRESSIVE_JACKPOT_IDS)[number];

/** Share of each paid spin's bet added to the progressive pool. */
export const PROGRESSIVE_CONTRIBUTION_RATE: Record<
  ProgressiveJackpotId,
  number
> = {
  major: 0.01,
  grand: 0.02,
};

export interface ProgressiveJackpotPool {
  /** Major extras keyed by denomination cents (`"1"` = 1¢, `"100"` = $1). */
  majorExtraByDenomination: Record<string, number>;
  grandExtra: number;
}

export function denominationKey(denomination: number): string {
  return String(Math.round(denomination * 100));
}

export function createProgressiveJackpotPool(): ProgressiveJackpotPool {
  return { majorExtraByDenomination: {}, grandExtra: 0 };
}

export function cloneProgressiveJackpotPool(
  pool: ProgressiveJackpotPool
): ProgressiveJackpotPool {
  return {
    majorExtraByDenomination: { ...pool.majorExtraByDenomination },
    grandExtra: pool.grandExtra,
  };
}

export function isProgressiveJackpot(
  id: JackpotId
): id is ProgressiveJackpotId {
  return id === 'major' || id === 'grand';
}

export function getProgressiveExtra(
  pool: ProgressiveJackpotPool,
  id: JackpotId,
  denomination: number = DEFAULT_DENOMINATION
): number {
  if (id === 'major') {
    return pool.majorExtraByDenomination[denominationKey(denomination)] ?? 0;
  }

  if (id === 'grand') {
    return pool.grandExtra;
  }

  return 0;
}

export function contributeToProgressiveJackpots(
  pool: ProgressiveJackpotPool,
  bet: number,
  denomination: number = DEFAULT_DENOMINATION
): ProgressiveJackpotPool {
  const key = denominationKey(denomination);
  const currentMajor = pool.majorExtraByDenomination[key] ?? 0;

  return {
    majorExtraByDenomination: {
      ...pool.majorExtraByDenomination,
      [key]: roundMoney(
        currentMajor + bet * PROGRESSIVE_CONTRIBUTION_RATE.major
      ),
    },
    grandExtra: roundMoney(
      pool.grandExtra + bet * PROGRESSIVE_CONTRIBUTION_RATE.grand
    ),
  };
}

export function resetProgressiveJackpot(
  pool: ProgressiveJackpotPool,
  id: JackpotId,
  denomination: number = DEFAULT_DENOMINATION
): ProgressiveJackpotPool {
  if (id === 'major') {
    const next = { ...pool.majorExtraByDenomination };
    delete next[denominationKey(denomination)];
    return { ...pool, majorExtraByDenomination: next };
  }

  if (id === 'grand') {
    return { ...pool, grandExtra: 0 };
  }

  return pool;
}

/** Mini / Minor / Major seed from the coin. Grand is a shared dollar seed. */
export function getJackpotSeed(
  id: JackpotId,
  denomination: number = DEFAULT_DENOMINATION
): number {
  if (id === 'grand') {
    return GRAND_JACKPOT_SEED;
  }

  return snapToDenomination(
    JACKPOT_BET_MULTIPLIERS[id] * denomination,
    denomination
  );
}

export function getJackpotMeterAmounts(
  _bet: number,
  pool: ProgressiveJackpotPool,
  denomination: number = DEFAULT_DENOMINATION
): Record<JackpotId, number> {
  return {
    mini: getJackpotSeed('mini', denomination),
    minor: getJackpotSeed('minor', denomination),
    major: snapToDenomination(
      getJackpotSeed('major', denomination) +
        getProgressiveExtra(pool, 'major', denomination),
      denomination
    ),
    grand: roundMoney(getJackpotSeed('grand') + pool.grandExtra),
  };
}
