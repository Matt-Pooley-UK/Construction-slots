import type { SymbolId } from './symbols';
import { isHatSymbol } from './symbols';
import {
  BONUS_MIN_SPACING,
  BONUS_EXTRA_PER_REEL_CHANCE,
  BONUS_PER_REEL,
  HAT_CLUSTER_SIZES,
  HAT_CLUSTERS_PER_REEL,
  HAT_SINGLES_PER_REEL,
  SUPER_HAT_HATS_REMOVED_PER_REEL,
  SUPER_BUZZ_SAW_BONUS_KEEP_FRACTION,
  SYMBOL_WEIGHTS,
  ULTRA_HAT_2X_PER_REEL,
  ULTRA_HAT_3X_PER_REEL,
  WILDS_PER_REEL,
  FREE_SPIN_EXTRA_WILDS_PER_REEL,
} from './config';
import { REEL_COUNT, REEL_LENGTH, ROWS } from './config';

export type Reel = SymbolId[];

export { REEL_COUNT, REEL_LENGTH, ROWS };

const weightedPool = buildWeightedPool();

function buildWeightedPool(): SymbolId[] {
  const pool: SymbolId[] = [];

  for (const [symbol, weight] of Object.entries(SYMBOL_WEIGHTS) as [
    SymbolId,
    number,
  ][]) {
    if (
      symbol === 'WILD' ||
      symbol === 'BONUS' ||
      isHatSymbol(symbol) ||
      weight <= 0
    ) {
      continue;
    }

    for (let i = 0; i < weight; i++) {
      pool.push(symbol);
    }
  }

  return pool;
}

function randomWeightedSymbol(): SymbolId {
  return weightedPool[Math.floor(Math.random() * weightedPool.length)];
}

function circularDistance(a: number, b: number): number {
  const forward = (b - a + REEL_LENGTH) % REEL_LENGTH;
  const backward = (a - b + REEL_LENGTH) % REEL_LENGTH;

  return Math.min(forward, backward);
}

function injectWildSymbols(reel: Reel, wildCount: number): Reel {
  const result = [...reel];
  const indices = new Set<number>();

  while (indices.size < wildCount) {
    indices.add(Math.floor(Math.random() * REEL_LENGTH));
  }

  for (const index of indices) {
    result[index] = 'WILD';
  }

  return result;
}

function injectBonusSymbols(
  reel: Reel,
  bonusCount: number,
  minSpacing: number
): Reel {
  const result = [...reel];
  const indices: number[] = [];
  const maxAttempts = REEL_LENGTH * 10;

  for (let attempt = 0; attempt < maxAttempts && indices.length < bonusCount; attempt++) {
    const candidate = Math.floor(Math.random() * REEL_LENGTH);

    if (
      indices.every(
        (index) => circularDistance(index, candidate) >= minSpacing
      )
    ) {
      indices.push(candidate);
    }
  }

  for (const index of indices) {
    result[index] = 'BONUS';
  }

  return result;
}

function randomHatClusterSize(): number {
  const size =
    HAT_CLUSTER_SIZES[Math.floor(Math.random() * HAT_CLUSTER_SIZES.length)];

  return size;
}

function tryPlaceHatCluster(
  reel: Reel,
  occupiedHatIndices: number[],
  clusterSize: number
): number[] | null {
  const maxAttempts = REEL_LENGTH * 10;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const start = Math.floor(Math.random() * REEL_LENGTH);
    const indices = Array.from({ length: clusterSize }, (_, offset) =>
      (start + offset) % REEL_LENGTH
    );

    if (indices.some((index) => reel[index] === 'BONUS')) {
      continue;
    }

    if (indices.some((index) => occupiedHatIndices.includes(index))) {
      continue;
    }

    return indices;
  }

  return null;
}

function placeHatCluster(
  reel: Reel,
  occupiedHatIndices: number[],
  clusterSize: number
): number[] {
  const indices = tryPlaceHatCluster(reel, occupiedHatIndices, clusterSize);

  if (!indices) {
    return occupiedHatIndices;
  }

  for (const index of indices) {
    reel[index] = 'HAT';
    occupiedHatIndices.push(index);
  }

  return occupiedHatIndices;
}

function injectHatClusters(
  reel: Reel,
  hatClustersPerReel = HAT_CLUSTERS_PER_REEL,
  hatSinglesPerReel = HAT_SINGLES_PER_REEL
): Reel {
  const result = [...reel];
  let occupiedHatIndices: number[] = [];

  for (let cluster = 0; cluster < hatClustersPerReel; cluster++) {
    occupiedHatIndices = placeHatCluster(
      result,
      occupiedHatIndices,
      randomHatClusterSize()
    );
  }

  for (let single = 0; single < hatSinglesPerReel; single++) {
    occupiedHatIndices = placeHatCluster(result, occupiedHatIndices, 1);
  }

  return result;
}

export interface ReelGenerationOptions {
  hatClustersPerReel?: number;
  hatSinglesPerReel?: number;
}

export function generateReel(
  wildCount = WILDS_PER_REEL,
  options: ReelGenerationOptions = {}
): Reel {
  const hatClustersPerReel =
    options.hatClustersPerReel ?? HAT_CLUSTERS_PER_REEL;
  const hatSinglesPerReel = options.hatSinglesPerReel ?? HAT_SINGLES_PER_REEL;
  const reel = Array.from({ length: REEL_LENGTH }, () => randomWeightedSymbol());
  const withWilds = injectWildSymbols(reel, wildCount);
  const bonusCount =
    BONUS_PER_REEL +
    (Math.random() < BONUS_EXTRA_PER_REEL_CHANCE ? 1 : 0);
  const withBonus = injectBonusSymbols(
    withWilds,
    bonusCount,
    BONUS_MIN_SPACING
  );

  return injectHatClusters(withBonus, hatClustersPerReel, hatSinglesPerReel);
}

export interface ReelSetOptions extends ReelGenerationOptions {
  /** Hat density for hat-bonus / ultra strips. Defaults to base density. */
  bonusHatClustersPerReel?: number;
  bonusHatSinglesPerReel?: number;
  ultraHat2PerReel?: number;
  ultraHat3PerReel?: number;
}

function replaceReelSet(target: Reel[], next: Reel[]) {
  target.splice(0, target.length, ...next);
}

function pickSpreadIndices(indices: number[], count: number): number[] {
  if (count <= 0 || indices.length === 0) {
    return [];
  }

  if (count >= indices.length) {
    return [...indices];
  }

  const step = indices.length / count;

  return Array.from({ length: count }, (_, index) =>
    indices[Math.floor(index * step)]
  );
}

function buildUltraHatReels(
  source: Reel[],
  hat2PerReel: number,
  hat3PerReel: number
): Reel[] {
  return source.map((reel) => {
    const result = [...reel];
    const hatIndices = result
      .map((symbol, index) => (symbol === 'HAT' ? index : -1))
      .filter((index) => index >= 0);
    const hat3Indices = new Set(pickSpreadIndices(hatIndices, hat3PerReel));
    const remaining = hatIndices.filter((index) => !hat3Indices.has(index));
    const hat2Indices = new Set(pickSpreadIndices(remaining, hat2PerReel));

    for (const index of hat3Indices) {
      result[index] = 'HAT3';
    }

    for (const index of hat2Indices) {
      result[index] = 'HAT2';
    }

    return result;
  });
}

function countHats(reelSet: Reel[]): number {
  return reelSet.reduce(
    (sum, reel) => sum + reel.filter((symbol) => isHatSymbol(symbol)).length,
    0
  );
}

/** Replace randomly chosen HATs on a reel with weighted filler symbols. */
function removeHatsFromReel(reel: Reel, count: number): Reel {
  if (count <= 0) {
    return [...reel];
  }

  const hatIndices = reel
    .map((symbol, index) => (symbol === 'HAT' ? index : -1))
    .filter((index) => index >= 0);

  if (hatIndices.length === 0) {
    return [...reel];
  }

  const result = [...reel];
  const shuffled = [...hatIndices];

  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = shuffled[index];
    shuffled[index] = shuffled[swapIndex];
    shuffled[swapIndex] = current;
  }

  const removeCount = Math.min(count, shuffled.length);

  for (let index = 0; index < removeCount; index++) {
    result[shuffled[index]] = randomWeightedSymbol();
  }

  return result;
}

/**
 * Super Hat uses the normal hat-bonus strips with fewer HATs per reel to
 * lower average bonus payouts on the taller 6-row window.
 */
function buildSuperHatReels(source: Reel[]): Reel[] {
  return source.map((reel) =>
    removeHatsFromReel(reel, SUPER_HAT_HATS_REMOVED_PER_REEL)
  );
}

/** Replace randomly chosen BONUS symbols with weighted fillers. */
function removeBonusFromReel(reel: Reel, count: number): Reel {
  if (count <= 0) {
    return [...reel];
  }

  const bonusIndices = reel
    .map((symbol, index) => (symbol === 'BONUS' ? index : -1))
    .filter((index) => index >= 0);

  if (bonusIndices.length === 0) {
    return [...reel];
  }

  const result = [...reel];
  const shuffled = [...bonusIndices];

  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = shuffled[index];
    shuffled[index] = shuffled[swapIndex];
    shuffled[swapIndex] = current;
  }

  const removeCount = Math.min(count, shuffled.length);

  for (let index = 0; index < removeCount; index++) {
    result[shuffled[index]] = randomWeightedSymbol();
  }

  return result;
}

/**
 * Super Buzz / Power Saw: keep BONUS (at half free-spin density) and thin HATs
 * by the same per-reel count as Super Hat.
 */
function buildSuperBuzzSawReels(
  source: Reel[],
  keepFraction = SUPER_BUZZ_SAW_BONUS_KEEP_FRACTION
): Reel[] {
  const clampedKeep = Math.min(1, Math.max(0, keepFraction));

  return source.map((reel) => {
    const bonusCount = reel.filter((symbol) => symbol === 'BONUS').length;
    const removeBonusCount =
      bonusCount - Math.round(bonusCount * clampedKeep);
    const withFewerBonus = removeBonusFromReel(reel, removeBonusCount);
    return removeHatsFromReel(
      withFewerBonus,
      SUPER_HAT_HATS_REMOVED_PER_REEL
    );
  });
}

export const reels: Reel[] = Array.from(
  { length: REEL_COUNT },
  () => generateReel(WILDS_PER_REEL)
);

export const freeSpinReels: Reel[] = Array.from(
  { length: REEL_COUNT },
  () => generateReel(WILDS_PER_REEL + FREE_SPIN_EXTRA_WILDS_PER_REEL)
);

/** Free-spin strips with BONUS replaced by HAT for hat / Power-Saw bonuses. */
export const hatBonusReels: Reel[] = freeSpinReels.map((reel) =>
  reel.map((symbol) => (symbol === 'BONUS' ? 'HAT' : symbol))
);

/** Hat-bonus strips with fewer HATs per reel for Super Hat. */
export const superHatBonusReels: Reel[] = buildSuperHatReels(hatBonusReels);

/** Free-spin strips with half BONUS density and Super-Hat-level HAT thinning. */
export const superBuzzSawReels: Reel[] = buildSuperBuzzSawReels(freeSpinReels);

/** Hat-bonus strips with some HAT upgraded to 2× / 3× for Ultra Hat. */
export const ultraHatBonusReels: Reel[] = buildUltraHatReels(
  hatBonusReels,
  ULTRA_HAT_2X_PER_REEL,
  ULTRA_HAT_3X_PER_REEL
);

/** Rebuild base, free-spin, hat-bonus, and ultra reel strips in place. */
export function regenerateReelSets(options: ReelSetOptions = {}): {
  baseHats: number;
  freeSpinHats: number;
  hatBonusHats: number;
  superHatHats: number;
  ultraHats: number;
} {
  const hatClustersPerReel =
    options.hatClustersPerReel ?? HAT_CLUSTERS_PER_REEL;
  const hatSinglesPerReel = options.hatSinglesPerReel ?? HAT_SINGLES_PER_REEL;
  const bonusHatClustersPerReel =
    options.bonusHatClustersPerReel ?? hatClustersPerReel;
  const bonusHatSinglesPerReel =
    options.bonusHatSinglesPerReel ?? hatSinglesPerReel;
  const ultraHat2PerReel = options.ultraHat2PerReel ?? ULTRA_HAT_2X_PER_REEL;
  const ultraHat3PerReel = options.ultraHat3PerReel ?? ULTRA_HAT_3X_PER_REEL;
  const baseOptions = { hatClustersPerReel, hatSinglesPerReel };
  const bonusOptions = {
    hatClustersPerReel: bonusHatClustersPerReel,
    hatSinglesPerReel: bonusHatSinglesPerReel,
  };

  replaceReelSet(
    reels,
    Array.from({ length: REEL_COUNT }, () =>
      generateReel(WILDS_PER_REEL, baseOptions)
    )
  );
  replaceReelSet(
    freeSpinReels,
    Array.from({ length: REEL_COUNT }, () =>
      generateReel(WILDS_PER_REEL + FREE_SPIN_EXTRA_WILDS_PER_REEL, baseOptions)
    )
  );

  const nextHatBonus = Array.from({ length: REEL_COUNT }, () =>
    generateReel(
      WILDS_PER_REEL + FREE_SPIN_EXTRA_WILDS_PER_REEL,
      bonusOptions
    ).map((symbol) => (symbol === 'BONUS' ? 'HAT' : symbol))
  );
  replaceReelSet(hatBonusReels, nextHatBonus);
  replaceReelSet(superHatBonusReels, buildSuperHatReels(hatBonusReels));
  replaceReelSet(superBuzzSawReels, buildSuperBuzzSawReels(freeSpinReels));
  replaceReelSet(
    ultraHatBonusReels,
    buildUltraHatReels(hatBonusReels, ultraHat2PerReel, ultraHat3PerReel)
  );

  return {
    baseHats: countHats(reels),
    freeSpinHats: countHats(freeSpinReels),
    hatBonusHats: countHats(hatBonusReels),
    superHatHats: countHats(superHatBonusReels),
    ultraHats: countHats(ultraHatBonusReels),
  };
}

export function getReelSet(
  isFreeSpin = false,
  isHatBonus = false,
  isUltraHat = false,
  isBuzzSaw = false,
  isSuperHat = false,
  isSuperBuzzSaw = false,
  isSuperPowerSaw = false
): Reel[] {
  if (isUltraHat) {
    return ultraHatBonusReels;
  }

  // Super Buzz / Power Saw keep BONUS but at half free-spin density.
  if (isSuperBuzzSaw || isSuperPowerSaw) {
    return superBuzzSawReels;
  }

  // Buzz Saw keeps BONUS on the strips (same density as free-spin reels).
  if (isBuzzSaw) {
    return freeSpinReels;
  }

  if (isSuperHat) {
    return superHatBonusReels;
  }

  if (isHatBonus) {
    return hatBonusReels;
  }

  return isFreeSpin ? freeSpinReels : reels;
}

export function getVisibleSymbols(
  reel: Reel,
  stopIndex: number,
  rowCount = ROWS
): SymbolId[] {
  const topOffset = Math.floor((rowCount - 1) / 2);

  return Array.from({ length: rowCount }, (_, row) => {
    const index =
      (stopIndex - topOffset + row + REEL_LENGTH) % REEL_LENGTH;
    return reel[index];
  });
}

/** Strip start index so `stopIndex` stays the visual center row. */
export function getVisibleWindowStartIndex(
  stopIndex: number,
  rowCount = ROWS
): number {
  const topOffset = Math.floor((rowCount - 1) / 2);
  return (stopIndex - topOffset + REEL_LENGTH) % REEL_LENGTH;
}

export function getStripSlice(
  reel: Reel,
  startIndex: number,
  count: number
): SymbolId[] {
  return Array.from({ length: count }, (_, index) =>
    reel[(startIndex + index + REEL_LENGTH) % REEL_LENGTH]
  );
}

export function getForwardScrollSymbols(
  fromStop: number,
  toStop: number,
  fullRotations: number
): number {
  const forward = (toStop - fromStop + REEL_LENGTH) % REEL_LENGTH;

  return fullRotations * REEL_LENGTH + forward;
}
