import type { SymbolId } from './symbols';
import { getReelSet, getVisibleSymbols } from './reels';
import { REEL_LENGTH } from './reels';

export interface SpinResult {
  stops: number[];
  grid: SymbolId[][];
  isFreeSpin: boolean;
  isHatBonus: boolean;
  isUltraHat: boolean;
  isBuzzSaw: boolean;
  isSuperHat: boolean;
  isSuperBuzzSaw: boolean;
}

export interface SpinOptions {
  isFreeSpin?: boolean;
  isHatBonus?: boolean;
  isUltraHat?: boolean;
  isBuzzSaw?: boolean;
  isSuperHat?: boolean;
  isSuperBuzzSaw?: boolean;
  /** Visible row count (defaults to base ROWS inside getVisibleSymbols). */
  rowCount?: number;
}

export function buildGridFromStops(
  stops: number[],
  isFreeSpin: boolean,
  isHatBonus = false,
  isUltraHat = false,
  isBuzzSaw = false,
  rowCount?: number,
  isSuperHat = false,
  isSuperBuzzSaw = false
): SymbolId[][] {
  const reelSet = getReelSet(
    isFreeSpin,
    isHatBonus,
    isUltraHat,
    isBuzzSaw,
    isSuperHat,
    isSuperBuzzSaw
  );

  return reelSet.map((reel, index) =>
    getVisibleSymbols(reel, stops[index], rowCount)
  );
}

function buildSpinResult(
  stops: number[],
  isFreeSpin: boolean,
  isHatBonus: boolean,
  isUltraHat: boolean,
  isBuzzSaw: boolean,
  isSuperHat: boolean,
  isSuperBuzzSaw: boolean,
  rowCount?: number
): SpinResult {
  return {
    stops,
    grid: buildGridFromStops(
      stops,
      isFreeSpin,
      isHatBonus,
      isUltraHat,
      isBuzzSaw,
      rowCount,
      isSuperHat,
      isSuperBuzzSaw
    ),
    isFreeSpin,
    isHatBonus,
    isUltraHat,
    isBuzzSaw,
    isSuperHat,
    isSuperBuzzSaw,
  };
}

export function spinReels(options: SpinOptions = {}): SpinResult {
  const isFreeSpin = options.isFreeSpin ?? false;
  const isHatBonus = options.isHatBonus ?? false;
  const isUltraHat = options.isUltraHat ?? false;
  const isBuzzSaw = options.isBuzzSaw ?? false;
  const isSuperHat = options.isSuperHat ?? false;
  const isSuperBuzzSaw = options.isSuperBuzzSaw ?? false;
  const rowCount = options.rowCount;
  const stops = getReelSet(
    isFreeSpin,
    isHatBonus,
    isUltraHat,
    isBuzzSaw,
    isSuperHat,
    isSuperBuzzSaw
  ).map(() => Math.floor(Math.random() * REEL_LENGTH));

  return buildSpinResult(
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
