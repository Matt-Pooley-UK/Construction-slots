import {
  MEGA_HAT_SPIN_MS,
  MEGA_HAT_STRIP_COUNT,
  MEGA_HAT_STRIP_SPACING_CELLS,
  REEL_COUNT,
  ROWS,
  SUPER_HAT_ROWS,
  SUPER_HAT_STRIP_GAP_CELLS,
  type GridPosition,
} from './config';

export type MegaHatSize =
  | { width: 2; height: 2 }
  | { width: 3; height: 3 }
  | { width: 5; height: 3 }
  | { width: 3; height: 4 }
  | { width: 4; height: 4 }
  | { width: 5; height: 4 }
  | { width: 5; height: 5 };

export const MEGA_HAT_SIZES: readonly MegaHatSize[] = [
  { width: 2, height: 2 },
  { width: 3, height: 3 },
  { width: 5, height: 3 },
] as const;

/** Larger footprints used for the Super Hat (6-row) intro (max 3 rows high). */
export const SUPER_HAT_SIZES: readonly MegaHatSize[] = [
  { width: 2, height: 2 },
  { width: 3, height: 3 },
  { width: 5, height: 3 },
] as const;

export interface MegaHatPlacement {
  size: MegaHatSize;
  /** Top-left cell of the oversized hat (always fully on-grid). */
  origin: GridPosition;
}

export interface MegaHatStripEntry extends MegaHatPlacement {
  /** Index along the scrolling strip (0 = first visible). */
  stripIndex: number;
  /**
   * Vertical offset along the intro strip, in cell-row units. Animation places
   * each sprite at `origin.y - stripOffsetCells * cellSize + scroll`.
   */
  stripOffsetCells: number;
}

export interface MegaHatSpinPlan {
  entries: MegaHatStripEntry[];
  /** Entry that lands fully aligned when the spin stops. */
  landingIndex: number;
  spinMs: number;
  /** Fallback uniform spacing (Mega Hat); Super Hat uses per-entry offsets. */
  spacingCells: number;
}

export function cellsCoveredByMegaHat(
  placement: MegaHatPlacement
): GridPosition[] {
  const cells: GridPosition[] = [];

  for (let reelOffset = 0; reelOffset < placement.size.width; reelOffset++) {
    for (let rowOffset = 0; rowOffset < placement.size.height; rowOffset++) {
      cells.push({
        reel: placement.origin.reel + reelOffset,
        row: placement.origin.row + rowOffset,
      });
    }
  }

  return cells;
}

export function pickMegaHatSize(
  sizes: readonly MegaHatSize[] = MEGA_HAT_SIZES
): MegaHatSize {
  return sizes[Math.floor(Math.random() * sizes.length)];
}

export function randomMegaHatPlacement(
  size: MegaHatSize = pickMegaHatSize(),
  rowCount = ROWS
): MegaHatPlacement {
  const maxReel = REEL_COUNT - size.width;
  const maxRow = Math.max(0, rowCount - size.height);

  return {
    size,
    origin: {
      reel: Math.floor(Math.random() * (maxReel + 1)),
      row: Math.floor(Math.random() * (maxRow + 1)),
    },
  };
}

function hatsOverlap(
  left: MegaHatPlacement & { stripOffsetCells: number },
  right: MegaHatPlacement & { stripOffsetCells: number }
): boolean {
  const leftTop = left.origin.row - left.stripOffsetCells;
  const leftBottom = leftTop + left.size.height;
  const rightTop = right.origin.row - right.stripOffsetCells;
  const rightBottom = rightTop + right.size.height;

  const verticalOverlap = leftTop < rightBottom && rightTop < leftBottom;
  if (!verticalOverlap) {
    return false;
  }

  const leftRight = left.origin.reel + left.size.width;
  const rightRight = right.origin.reel + right.size.width;
  return left.origin.reel < rightRight && right.origin.reel < leftRight;
}

/**
 * Next strip offset so `next` sits fully above `prev` in strip space (no
 * bounding-box overlap), while keeping offsets monotonically increasing.
 */
function nextNonOverlappingOffset(
  prev: MegaHatStripEntry,
  next: MegaHatPlacement,
  gapCells: number
): number {
  const clearPrev =
    prev.stripOffsetCells +
    (next.origin.row - prev.origin.row) +
    next.size.height +
    gapCells;

  return Math.max(prev.stripOffsetCells + gapCells, clearPrev);
}

/**
 * Build a strip of randomly sized mega hats. Every entry is a valid full-grid
 * placement so the final stop can always show a complete hat. Spacing keeps
 * at least one hat intersecting the viewport while the strip scrolls.
 */
export function buildMegaHatSpinPlan(
  count = MEGA_HAT_STRIP_COUNT,
  options: {
    rowCount?: number;
    sizes?: readonly MegaHatSize[];
    /** When true, stack hats with cumulative offsets so sprites never overlap. */
    avoidOverlap?: boolean;
    gapCells?: number;
  } = {}
): MegaHatSpinPlan {
  const rowCount = options.rowCount ?? ROWS;
  const sizes = options.sizes ?? MEGA_HAT_SIZES;
  const avoidOverlap = options.avoidOverlap ?? false;
  const gapCells = options.gapCells ?? SUPER_HAT_STRIP_GAP_CELLS;
  const safeCount = Math.max(3, count);
  const entries: MegaHatStripEntry[] = [];

  for (let stripIndex = 0; stripIndex < safeCount; stripIndex++) {
    const placement = randomMegaHatPlacement(pickMegaHatSize(sizes), rowCount);
    let stripOffsetCells = stripIndex * MEGA_HAT_STRIP_SPACING_CELLS;

    if (avoidOverlap) {
      if (stripIndex === 0) {
        stripOffsetCells = 0;
      } else {
        stripOffsetCells = nextNonOverlappingOffset(
          entries[stripIndex - 1],
          placement,
          gapCells
        );
      }
    }

    entries.push({
      ...placement,
      stripIndex,
      stripOffsetCells,
    });
  }

  // Prefer landing on a later entry so the spin travels a meaningful distance.
  const landingIndex =
    safeCount -
    1 -
    Math.floor(Math.random() * Math.min(3, safeCount));

  return {
    entries,
    landingIndex,
    spinMs: MEGA_HAT_SPIN_MS,
    spacingCells: MEGA_HAT_STRIP_SPACING_CELLS,
  };
}

export function buildSuperHatSpinPlan(
  count = MEGA_HAT_STRIP_COUNT
): MegaHatSpinPlan {
  return buildMegaHatSpinPlan(count, {
    rowCount: SUPER_HAT_ROWS,
    sizes: SUPER_HAT_SIZES,
    avoidOverlap: true,
  });
}

/** True when any pair of strip entries overlaps in strip space. */
export function megaHatPlanHasOverlaps(plan: MegaHatSpinPlan): boolean {
  for (let left = 0; left < plan.entries.length; left++) {
    for (let right = left + 1; right < plan.entries.length; right++) {
      if (hatsOverlap(plan.entries[left], plan.entries[right])) {
        return true;
      }
    }
  }

  return false;
}
