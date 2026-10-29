import type { SymbolId } from './symbols';
import { isHatSymbol } from './symbols';
import {
  getReelSet,
  getVisibleSymbols,
  REEL_COUNT,
  REEL_LENGTH,
  type Reel,
} from './reels';
import { HAT_TRIGGER_COUNT } from './config';
import { spinReels, type SpinResult } from './spin';

const BONUS_TRIGGER_COUNT = 3;
/** Random stop samples before falling back to an exhaustive shuffled search. */
const RANDOM_STOP_ATTEMPTS = 4_000;

function countSymbolInVisibleWindow(
  reel: SymbolId[],
  stopIndex: number,
  symbol: SymbolId,
  rowCount?: number
): number {
  return getVisibleSymbols(reel, stopIndex, rowCount).filter(
    (entry) => entry === symbol
  ).length;
}

function countHatsInVisibleWindow(
  reel: SymbolId[],
  stopIndex: number,
  rowCount?: number
): number {
  return getVisibleSymbols(reel, stopIndex, rowCount).filter((entry) =>
    isHatSymbol(entry)
  ).length;
}

function shuffleInPlace<T>(items: T[]): T[] {
  for (let index = items.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = items[index];
    items[index] = items[swapIndex];
    items[swapIndex] = current;
  }

  return items;
}

function buildSpinResult(
  reelSet: Reel[],
  stops: number[],
  isFreeSpin: boolean,
  isHatBonus: boolean,
  isUltraHat: boolean,
  isBuzzSaw = false,
  isSuperHat = false,
  isSuperBuzzSaw = false,
  rowCount?: number
): SpinResult {
  return {
    stops,
    grid: reelSet.map((reel, index) =>
      getVisibleSymbols(reel, stops[index], rowCount)
    ),
    isFreeSpin,
    isHatBonus,
    isUltraHat,
    isBuzzSaw,
    isSuperHat,
    isSuperBuzzSaw,
  };
}

function findStopsWithMinCount(
  countAtStop: (reel: SymbolId[], stopIndex: number) => number,
  minCount: number,
  isFreeSpin: boolean,
  isHatBonus = false,
  isUltraHat = false,
  isBuzzSaw = false,
  isSuperHat = false,
  isSuperBuzzSaw = false,
  rowCount?: number
): SpinResult | null {
  const reelSet = getReelSet(
    isFreeSpin,
    isHatBonus,
    isUltraHat,
    isBuzzSaw,
    isSuperHat,
    isSuperBuzzSaw
  );

  for (let attempt = 0; attempt < RANDOM_STOP_ATTEMPTS; attempt++) {
    const stops = Array.from({ length: REEL_COUNT }, () =>
      Math.floor(Math.random() * REEL_LENGTH)
    );
    const total = stops.reduce(
      (sum, stop, reelIndex) => sum + countAtStop(reelSet[reelIndex], stop),
      0
    );

    if (total >= minCount) {
      return buildSpinResult(
        reelSet,
        stops,
        isFreeSpin,
        isHatBonus,
        isUltraHat,
        isBuzzSaw,
        isSuperHat,
        isSuperBuzzSaw,
        rowCount
      );
    }
  }

  const perReelStops = reelSet.map((reel) => {
    const stops = Array.from({ length: REEL_LENGTH }, (_, stop) => ({
      stop,
      count: countAtStop(reel, stop),
    }));

    shuffleInPlace(stops);
    stops.sort((left, right) => right.count - left.count);

    return stops;
  });

  const chosenStops = Array.from({ length: REEL_COUNT }, () => 0);

  function search(reelIndex: number, total: number): boolean {
    if (total >= minCount) {
      return true;
    }

    if (reelIndex >= REEL_COUNT) {
      return false;
    }

    const maxRemaining = perReelStops
      .slice(reelIndex)
      .reduce((sum, stops) => sum + (stops[0]?.count ?? 0), 0);

    if (total + maxRemaining < minCount) {
      return false;
    }

    for (const option of perReelStops[reelIndex]) {
      chosenStops[reelIndex] = option.stop;

      if (search(reelIndex + 1, total + option.count)) {
        return true;
      }
    }

    return false;
  }

  if (!search(0, 0)) {
    return null;
  }

  return buildSpinResult(
    reelSet,
    chosenStops,
    isFreeSpin,
    isHatBonus,
    isUltraHat,
    isBuzzSaw,
    isSuperHat,
    isSuperBuzzSaw,
    rowCount
  );
}

export function spinReelsForcedBonus(
  isFreeSpin = false,
  isHatBonus = false,
  isUltraHat = false,
  isBuzzSaw = false,
  rowCount?: number,
  isSuperHat = false,
  isSuperBuzzSaw = false
): SpinResult {
  return (
    findStopsWithMinCount(
      (reel, stop) =>
        countSymbolInVisibleWindow(reel, stop, 'BONUS', rowCount),
      BONUS_TRIGGER_COUNT,
      isFreeSpin,
      isHatBonus,
      isUltraHat,
      isBuzzSaw,
      isSuperHat,
      isSuperBuzzSaw,
      rowCount
    ) ??
    spinReels({
      isFreeSpin,
      isHatBonus,
      isUltraHat,
      isBuzzSaw,
      isSuperHat,
      isSuperBuzzSaw,
      rowCount,
    })
  );
}

export function spinReelsForcedHat(
  isFreeSpin = false,
  isHatBonus = false,
  isUltraHat = false,
  isBuzzSaw = false,
  rowCount?: number,
  isSuperHat = false,
  isSuperBuzzSaw = false
): SpinResult {
  return (
    findStopsWithMinCount(
      (reel, stop) => countHatsInVisibleWindow(reel, stop, rowCount),
      HAT_TRIGGER_COUNT,
      isFreeSpin,
      isHatBonus,
      isUltraHat,
      isBuzzSaw,
      isSuperHat,
      isSuperBuzzSaw,
      rowCount
    ) ??
    spinReels({
      isFreeSpin,
      isHatBonus,
      isUltraHat,
      isBuzzSaw,
      isSuperHat,
      isSuperBuzzSaw,
      rowCount,
    })
  );
}
