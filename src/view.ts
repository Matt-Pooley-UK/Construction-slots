import type { SymbolId } from './game/symbols';
import { isHatSymbol } from './game/symbols';
import {
  getForwardScrollSymbols,
  getReelSet,
  getStripSlice,
  getVisibleWindowStartIndex,
} from './game/reels';
import type { SpinResult } from './game/spin';
import {
  DENOMINATIONS,
  REEL_COUNT,
  ROWS,
  getBetMultipliers,
  paytable,
  SCATTER_PAYS,
  FLAG_EXPAND_MS,
  HAT_BLUE_REDIRECT_MS,
  HAT_CELL_PRIZE_RANGES,
  HAT_TRIGGER_COUNT,
  type HatCellColor,
  type JackpotId,
} from './game/config';
import { describeHatBonusMode, type HatBonusCell } from './game/hatBonus';
import {
  formatDenomination,
  formatMoney,
  formatWin,
  snapToDenomination,
} from './game/money';
import { getBetAmount } from './game/money';
import {
  formatJackpotShortLabel,
  getJackpotPayout,
  JACKPOT_LABELS,
} from './game/jackpots';
import { getBetTierFromWager } from './game/bets';
import { getJackpotMeterAmounts, isProgressiveJackpot } from './game/progressiveJackpots';
import type { BonusWheelSection } from './game/bonusWheel';
import type { MegaHatSpinPlan } from './game/megaHat';
import { state } from './state/store';

const SYMBOL_COLORS: Record<SymbolId, string> = {
  A: '#f5c518',
  K: '#5ec8f5',
  Q: '#d07cff',
  J: '#4adf8a',
  PREM1: '#ef4444',
  PREM2: '#22c55e',
  PREM3: '#3b82f6',
  WILD: '#fbbf24',
  BONUS: '#f8fafc',
  HAT: '#c084fc',
  HAT2: '#a78bfa',
  HAT3: '#818cf8',
};

const SYMBOL_TEXT: Record<SymbolId, string> = {
  A: 'A',
  K: 'K',
  Q: 'Q',
  J: 'J',
  PREM1: 'P1',
  PREM2: 'P2',
  PREM3: 'P3',
  WILD: 'WILD',
  BONUS: 'BONUS',
  HAT: 'HAT',
  HAT2: 'HAT2',
  HAT3: 'HAT3',
};

const METER_ORDER: JackpotId[] = ['grand', 'major', 'minor', 'mini'];

/** One extra trip around the strip so every spin passes new symbols. */
const SPIN_ROTATIONS = 1;
/** Steady reel speed during the cruise, in cells per second. */
const CRUISE_CELLS_PER_SEC = 180;
/** Symbols eased into the window at the end of each reel. */
const SETTLE_CELLS = 12;
const SETTLE_MS = 450;
const REEL_STAGGER_MS = 220;

const canvas = document.querySelector('#reels') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const wheelCanvas = document.querySelector('#wheel-canvas') as HTMLCanvasElement;
const wheelCtx = wheelCanvas.getContext('2d')!;

const BASE_CANVAS_WIDTH = 640;
const BASE_CANVAS_HEIGHT = 410;
const TALL_CANVAS_HEIGHT = 800;

let activeRowCount = ROWS;

const images: Partial<Record<SymbolId, HTMLImageElement>> = {};
const BASE = import.meta.env.BASE_URL;

let lastGrid: SymbolId[][] | null = null;
let lastHatCells: HatBonusCell[] = [];
let lastHighlights: { reel: number; row: number }[] = [];
let lastWheel: { sections: BonusWheelSection[]; rotationDeg: number } | null = null;
/** While an overlay animation is drawing, image loads replay that frame. */
let frameOverride: (() => void) | null = null;

export function loadSymbolImages() {
  const files: Record<SymbolId, string> = {
    A: 'a.png',
    K: 'k.png',
    Q: 'q.png',
    J: 'j.png',
    PREM1: 'prem1.png',
    PREM2: 'prem2.png',
    PREM3: 'prem3.png',
    WILD: 'mini.png',
    BONUS: 'bonus.png',
    HAT: 'hat.png',
    HAT2: 'hat.png',
    HAT3: 'hat.png',
  };
  for (const [id, file] of Object.entries(files) as [SymbolId, string][]) {
    const img = new Image();
    const ready = () => {
      if (img.naturalWidth <= 0) {
        return;
      }
      images[id] = img;
      if (frameOverride) {
        frameOverride();
      } else if (lastGrid) {
        drawGrid(lastGrid, lastHatCells, lastHighlights);
      }
    };
    img.onload = () => {
      ready();
      if (lastWheel && !document.querySelector('#wheel')?.classList.contains('hidden')) {
        drawWheel(lastWheel.sections, lastWheel.rotationDeg);
      }
    };
    img.src = `${BASE}symbols/${file}`;
    if (img.complete) {
      ready();
    }
  }
}

const HAT_OUTLINE_RED = '#cf142b';
const HAT_OUTLINE_WHITE = '#ffffff';
const HAT_OUTLINE_BLUE = '#012169';

function drawHatCellOutline(color: HatCellColor, x: number, y: number, size: number) {
  const margin = 2;
  const ox = x + margin;
  const oy = y + margin;
  const outer = size - margin * 2;
  const band = Math.max(5, size * 0.078);

  ctx.save();
  ctx.lineJoin = 'miter';
  if (color === 'yellow') {
    strokeHatFrame(ox, oy, outer, band, HAT_OUTLINE_WHITE);
  } else if (color === 'green') {
    strokeHatFrame(ox, oy, outer, band, HAT_OUTLINE_RED);
  } else {
    // Red, then blue, share the diagonal red-white-blue step. Blue runs the
    // other way so the last upgrade still reads on the square.
    drawSteppedDiagonalFrame(ox, oy, outer, band, color === 'blue');
  }
  ctx.restore();
}

function strokeHatFrame(
  x: number,
  y: number,
  size: number,
  band: number,
  color: string
) {
  ctx.strokeStyle = '#1a120c';
  ctx.lineWidth = band + 2;
  ctx.strokeRect(
    x + (band + 2) / 2,
    y + (band + 2) / 2,
    size - (band + 2),
    size - (band + 2)
  );
  ctx.strokeStyle = color;
  ctx.lineWidth = band;
  ctx.strokeRect(x + band / 2, y + band / 2, size - band, size - band);
}

function drawSteppedDiagonalFrame(
  x: number,
  y: number,
  size: number,
  band: number,
  flip: boolean
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, size, size);
  ctx.rect(x + band, y + band, size - band * 2, size - band * 2);
  ctx.clip('evenodd');

  const stripe = Math.max(4, band * 0.95);
  const colors = [HAT_OUTLINE_RED, HAT_OUTLINE_WHITE, HAT_OUTLINE_BLUE];
  const span = size * 3;
  ctx.translate(x, y);
  if (flip) {
    ctx.translate(size, 0);
    ctx.scale(-1, 1);
  }
  for (let start = -span; start < span; start += stripe * colors.length) {
    for (let index = 0; index < colors.length; index++) {
      const offset = start + index * stripe;
      ctx.fillStyle = colors[index];
      ctx.beginPath();
      ctx.moveTo(offset, 0);
      ctx.lineTo(offset + stripe, 0);
      ctx.lineTo(offset + stripe - size, size);
      ctx.lineTo(offset - size, size);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();

  ctx.strokeStyle = '#1a120c';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 0.75, y + 0.75, size - 1.5, size - 1.5);
  ctx.strokeRect(x + band, y + band, size - band * 2, size - band * 2);
}

export function setActiveRows(rowCount: number) {
  activeRowCount = rowCount;
  canvas.width = BASE_CANVAS_WIDTH;
  canvas.height = rowCount > ROWS ? TALL_CANVAS_HEIGHT : BASE_CANVAS_HEIGHT;
}

export function getActiveRows() {
  return activeRowCount;
}

export function cellSize(rowCount: number) {
  const pad = 10;
  const width = (canvas.width - pad * 2) / REEL_COUNT;
  const height = (canvas.height - pad * 2) / rowCount;
  return { size: Math.min(width, height), pad };
}

export function drawGrid(
  grid: SymbolId[][],
  hatCells: HatBonusCell[] = [],
  highlights: { reel: number; row: number }[] = []
) {
  lastGrid = grid;
  lastHatCells = hatCells;
  lastHighlights = highlights;
  const rowCount = grid[0]?.length ?? ROWS;
  const { size, pad } = cellSize(rowCount);
  ctx.fillStyle = '#0b0b0b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const hats = new Map(
    hatCells.map((cell) => [`${cell.reel}:${cell.row}`, cell])
  );
  const wins = new Set(highlights.map((cell) => `${cell.reel}:${cell.row}`));

  for (let reel = 0; reel < REEL_COUNT; reel++) {
    for (let row = 0; row < rowCount; row++) {
      const x = pad + reel * size;
      const y = pad + row * size;
      const symbol = grid[reel]?.[row] ?? 'A';
      const hat = hats.get(`${reel}:${row}`);
      const prize = hat?.prize;
      const revealed = prize !== null && prize !== undefined;
      if (revealed) {
        ctx.fillStyle = '#241910';
        ctx.fillRect(x + 2, y + 2, size - 4, size - 4);
      } else {
        drawSymbolTile(symbol, x, y, size);
      }
      if (hat) {
        drawHatCellOutline(hat.color, x, y, size);
      }
      if (!revealed && symbol === 'HAT2') {
        drawHatStepBadge('2×', x, y, size);
      } else if (!revealed && symbol === 'HAT3') {
        drawHatStepBadge('3×', x, y, size);
      }

      if (revealed && hat && prize !== undefined) {
        const label = hat.jackpot
          ? formatJackpotShortLabel(
              hat.jackpot,
              getBetTierFromWager(state.denomination, state.bet),
              { uppercase: true }
            )
          : formatMoney(prize);
        drawRevealValue(label, x, y, size);
      }

      if (wins.has(`${reel}:${row}`)) {
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 3, y + 3, size - 6, size - 6);
      }
    }
  }
}

function drawSymbolTile(
  symbol: SymbolId,
  x: number,
  y: number,
  size: number,
  fill = SYMBOL_COLORS[symbol]
) {
  ctx.fillStyle = fill;
  ctx.fillRect(x + 2, y + 2, size - 4, size - 4);

  const img = images[symbol];
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, x + 2, y + 2, size - 4, size - 4);
  } else if (symbol !== 'WILD') {
    ctx.fillStyle = '#111';
    ctx.font = `bold ${Math.max(12, size * 0.22)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(SYMBOL_TEXT[symbol], x + size / 2, y + size / 2);
  }

  if (symbol === 'WILD') {
    drawWildLabel(x, y, size);
  } else if (symbol === 'HAT2') {
    drawHatStepBadge('2×', x, y, size);
  } else if (symbol === 'HAT3') {
    drawHatStepBadge('3×', x, y, size);
  }
}

function drawWildLabel(x: number, y: number, size: number) {
  const label = 'WILD';
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fontSize = Math.max(18, size * 0.2);
  ctx.font = `bold ${fontSize}px system-ui`;
  const width = Math.min(size * 0.86, ctx.measureText(label).width + fontSize * 0.7);
  const height = fontSize * 1.2;
  const cx = x + size / 2;
  const cy = y + size * 0.72;
  ctx.fillStyle = 'rgba(26, 18, 12, 0.84)';
  ctx.beginPath();
  ctx.roundRect(cx - width / 2, cy - height / 2, width, height, height / 2);
  ctx.fill();
  ctx.fillStyle = '#f7f1e4';
  ctx.fillText(label, cx, cy);
  ctx.restore();
}

function drawHatStepBadge(label: string, x: number, y: number, size: number) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fontSize = Math.max(14, size * 0.18);
  ctx.font = `bold ${fontSize}px system-ui`;
  const badge = fontSize * 1.35;
  const cx = x + size - badge * 0.72;
  const cy = y + badge * 0.72;
  ctx.fillStyle = '#1a120c';
  ctx.beginPath();
  ctx.arc(cx, cy, badge * 0.62, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f7f1e4';
  ctx.fillText(label, cx, cy);
  ctx.restore();
}

function drawRevealValue(label: string, x: number, y: number, size: number) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let fontSize = size * 0.46;
  ctx.font = `bold ${fontSize}px system-ui`;
  const maxWidth = size * 0.78;
  while (ctx.measureText(label).width > maxWidth && fontSize > 16) {
    fontSize -= 1;
    ctx.font = `bold ${fontSize}px system-ui`;
  }
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#1a120c';
  ctx.lineWidth = Math.max(4, fontSize * 0.1);
  ctx.strokeText(label, x + size / 2, y + size / 2);
  ctx.fillStyle = '#f7f1e4';
  ctx.fillText(label, x + size / 2, y + size / 2);
  ctx.restore();
}

function easeOutCubic(progress: number) {
  return 1 - (1 - progress) ** 3;
}

function easeInOutCubic(progress: number) {
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - (-2 * progress + 2) ** 3 / 2;
}

function playCanvasAnimation(
  durationMs: number,
  draw: (progress: number) => void
): Promise<void> {
  return new Promise((resolve) => {
    const started = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / durationMs);
      const frame = () => draw(progress);
      frameOverride = frame;
      frame();
      if (progress < 1) {
        requestAnimationFrame(tick);
        return;
      }
      frameOverride = null;
      resolve();
    };
    requestAnimationFrame(tick);
  });
}

function clipGridCells(
  cells: { reel: number; row: number }[],
  size: number,
  pad: number
) {
  ctx.beginPath();
  for (const cell of cells) {
    ctx.rect(
      pad + cell.reel * size + 2,
      pad + cell.row * size + 2,
      size - 4,
      size - 4
    );
  }
  ctx.clip();
}

/**
 * Grow a full flag tile out of the landed flag and into each adjacent square.
 * Clipped to the flag cell plus that square, so the picture does not spill
 * onto cells the flag does not change.
 */
function drawExpandingFlag(
  origin: { reel: number; row: number },
  targets: { reel: number; row: number }[],
  progress: number,
  size: number,
  pad: number
) {
  const fromX = pad + origin.reel * size + size / 2;
  const fromY = pad + origin.row * size + size / 2;
  const scale = 0.38 + progress * 0.62;
  const drawSize = (size - 4) * scale;

  for (const target of targets) {
    const toX = pad + target.reel * size + size / 2;
    const toY = pad + target.row * size + size / 2;
    const x = fromX + (toX - fromX) * progress;
    const y = fromY + (toY - fromY) * progress;
    ctx.save();
    clipGridCells([origin, target], size, pad);
    drawSymbolTile('BONUS', x - drawSize / 2, y - drawSize / 2, drawSize);
    ctx.restore();
  }
}

function drawTravelingCrown(
  symbol: SymbolId,
  centerX: number,
  centerY: number,
  size: number
) {
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = Math.max(8, size * 0.14);
  ctx.shadowOffsetY = Math.max(4, size * 0.07);
  drawSymbolTile(symbol, centerX - size / 2, centerY - size / 2, size);
  ctx.restore();
}

export function animateFlagExpand(options: {
  grid: SymbolId[][];
  fromCells: HatBonusCell[];
  toCells: HatBonusCell[];
  highlights?: { reel: number; row: number }[];
  origin: { reel: number; row: number };
  targets: { reel: number; row: number }[];
}): Promise<void> {
  const highlights = options.highlights ?? [];
  if (options.targets.length === 0) {
    drawGrid(options.grid, options.toCells, highlights);
    return Promise.resolve();
  }

  const rowCount = options.grid[0]?.length ?? ROWS;
  const { size, pad } = cellSize(rowCount);

  return playCanvasAnimation(FLAG_EXPAND_MS, (progress) => {
    const expand = Math.min(1, progress / 0.74);
    const fade = progress < 0.86 ? 1 : 1 - (progress - 0.86) / 0.14;
    const cells = progress < 0.86 ? options.fromCells : options.toCells;
    drawGrid(options.grid, cells, highlights);
    ctx.save();
    ctx.globalAlpha = Math.max(0, fade);
    drawExpandingFlag(
      options.origin,
      options.targets,
      easeOutCubic(expand),
      size,
      pad
    );
    ctx.restore();
  });
}

export function animateCrownTravel(options: {
  grid: SymbolId[][];
  hatCells: HatBonusCell[];
  highlights?: { reel: number; row: number }[];
  from: { reel: number; row: number };
  to: { reel: number; row: number };
  symbol: SymbolId;
}): Promise<void> {
  const highlights = options.highlights ?? [];
  const sameCell =
    options.from.reel === options.to.reel && options.from.row === options.to.row;
  if (sameCell) {
    drawGrid(options.grid, options.hatCells, highlights);
    return Promise.resolve();
  }

  const rowCount = options.grid[0]?.length ?? ROWS;
  const { size, pad } = cellSize(rowCount);
  const fromX = pad + options.from.reel * size + size / 2;
  const fromY = pad + options.from.row * size + size / 2;
  const toX = pad + options.to.reel * size + size / 2;
  const toY = pad + options.to.row * size + size / 2;

  return playCanvasAnimation(HAT_BLUE_REDIRECT_MS, (progress) => {
    const eased = easeInOutCubic(progress);
    const x = fromX + (toX - fromX) * eased;
    const y = fromY + (toY - fromY) * eased;
    const lift = Math.sin(Math.PI * eased) * size * 0.32;
    const scale = 1.12 + Math.sin(Math.PI * eased) * 0.2;
    drawGrid(options.grid, options.hatCells, highlights);
    const marker = pad + options.to.reel * size;
    const markerY = pad + options.to.row * size;
    ctx.save();
    ctx.fillStyle = `rgba(255, 214, 90, ${0.22 + eased * 0.16})`;
    ctx.fillRect(marker + 7, markerY + 7, size - 14, size - 14);
    ctx.strokeStyle = '#ffe08a';
    ctx.lineWidth = 5;
    ctx.shadowColor = 'rgba(255, 196, 60, 0.95)';
    ctx.shadowBlur = 14;
    ctx.strokeRect(marker + 6, markerY + 6, size - 12, size - 12);
    ctx.restore();
    drawTravelingCrown(
      options.symbol,
      x,
      y - lift,
      (size - 4) * scale
    );
  });
}

/** Gold frame the size of a mega-crown footprint, with the crown kept square. */
function drawLargeCrown(
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number
) {
  const cx = x + width / 2;
  const cy = y + height / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  ctx.fillStyle = 'rgba(245, 158, 11, 0.55)';
  ctx.strokeStyle = '#fde047';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(-width / 2, -height / 2, width, height, 14);
  ctx.fill();
  ctx.stroke();
  const maxSide = Math.min(width, height) * 0.82;
  const img = images.HAT;
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, -maxSide / 2, -maxSide / 2, maxSide, maxSide);
  }
  ctx.restore();
}

/**
 * Scroll oversized crowns down the reel window. They turn one full revolution
 * at a steady rate and finish upright on the landing footprint.
 */
export function animateMegaCrownIntro(plan: MegaHatSpinPlan): Promise<void> {
  const landing = plan.entries[plan.landingIndex];
  if (!landing) {
    return Promise.resolve();
  }

  const rowCount = getActiveRows();
  const { size, pad } = cellSize(rowCount);
  const endOffset = landing.stripOffsetCells * size;
  const windowWidth = REEL_COUNT * size;
  const windowHeight = rowCount * size;

  const drawAt = (progress: number) => {
    const eased = easeOutCubic(progress);
    const rotation = (1 - progress) * Math.PI * 2;
    ctx.fillStyle = '#0b0b0b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad, pad, windowWidth, windowHeight);
    ctx.clip();
    for (const entry of plan.entries) {
      const x = pad + entry.origin.reel * size;
      const y =
        pad +
        entry.origin.row * size -
        entry.stripOffsetCells * size +
        endOffset * eased;
      drawLargeCrown(
        x,
        y,
        entry.size.width * size,
        entry.size.height * size,
        rotation
      );
    }
    ctx.restore();
  };

  return playCanvasAnimation(plan.spinMs, drawAt).then(
    () =>
      new Promise<void>((resolve) => {
        const hold = () => drawAt(1);
        frameOverride = hold;
        hold();
        window.setTimeout(() => {
          frameOverride = null;
          resolve();
        }, 450);
      })
  );
}

function drawLockedHatOutlines(hatCells: HatBonusCell[], rowCount: number) {
  if (hatCells.length === 0) {
    return;
  }
  const { size, pad } = cellSize(rowCount);
  for (const cell of hatCells) {
    if (
      cell.row < 0 ||
      cell.row >= rowCount ||
      cell.reel < 0 ||
      cell.reel >= REEL_COUNT
    ) {
      continue;
    }
    drawHatCellOutline(
      cell.color,
      pad + cell.reel * size,
      pad + cell.row * size,
      size
    );
  }
}

function reelScrollOffset(
  localMs: number,
  cruiseCells: number,
  cruiseMs: number,
  settleCells: number
) {
  if (localMs <= 0) {
    return 0;
  }
  if (localMs < cruiseMs) {
    return (localMs / cruiseMs) * cruiseCells;
  }
  const t = Math.min(1, (localMs - cruiseMs) / SETTLE_MS);
  const eased = 1 - (1 - t) ** 3;
  return cruiseCells + eased * settleCells;
}

export function animateReels(
  options: {
    fromGrid: SymbolId[][];
    fromStops: number[];
    result: SpinResult;
    hatCells?: HatBonusCell[];
  },
  onStop: (reel: number) => void
): Promise<void> {
  const { fromGrid, fromStops, result } = options;
  const hatCells = options.hatCells ?? [];
  const rowCount = result.grid[0]?.length ?? ROWS;
  setActiveRows(rowCount);
  const reelSet = getReelSet(
    result.isFreeSpin,
    result.isHatBonus,
    result.isUltraHat,
    result.isBuzzSaw,
    result.isSuperHat,
    result.isSuperBuzzSaw
  );
  const plans = result.stops.map((toStop, reel) => {
    const fromStop = fromStops[reel] ?? toStop;
    const scrollSymbols = getForwardScrollSymbols(
      fromStop,
      toStop,
      SPIN_ROTATIONS
    );
    const strip = getStripSlice(
      reelSet[reel],
      getVisibleWindowStartIndex(fromStop, rowCount),
      rowCount + scrollSymbols
    );
    const visible = fromGrid[reel] ?? [];
    if (visible.length === rowCount) {
      for (let row = 0; row < rowCount; row++) {
        strip[row] = visible[row];
      }
    }
    const settleCells = Math.min(SETTLE_CELLS, scrollSymbols);
    const cruiseCells = scrollSymbols - settleCells;
    const cruiseMs = (cruiseCells / CRUISE_CELLS_PER_SEC) * 1000;
    return { strip, scrollSymbols, settleCells, cruiseCells, cruiseMs };
  });
  const started = performance.now();

  return new Promise((resolve) => {
    const stopped = new Set<number>();

    const tick = (now: number) => {
      ctx.fillStyle = '#0b0b0b';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const { size, pad } = cellSize(rowCount);
      const windowHeight = rowCount * size;

      for (let reel = 0; reel < REEL_COUNT; reel++) {
        const plan = plans[reel];
        const local = now - started - reel * REEL_STAGGER_MS;
        const done = local >= plan.cruiseMs + SETTLE_MS;
        if (done && !stopped.has(reel)) {
          stopped.add(reel);
          onStop(reel);
        }
        const offset = done
          ? plan.scrollSymbols
          : reelScrollOffset(
              local,
              plan.cruiseCells,
              plan.cruiseMs,
              plan.settleCells
            );
        const x = pad + reel * size;
        const first = Math.max(0, Math.floor(offset) - 1);
        const last = Math.min(
          plan.strip.length - 1,
          Math.ceil(offset) + rowCount
        );

        ctx.save();
        ctx.beginPath();
        ctx.rect(x, pad, size, windowHeight);
        ctx.clip();
        for (let index = first; index <= last; index++) {
          const symbol = plan.strip[index];
          if (!symbol) {
            continue;
          }
          drawSymbolTile(symbol, x, pad + (index - offset) * size, size);
        }
        ctx.restore();
      }

      drawLockedHatOutlines(hatCells, rowCount);

      if (stopped.size === REEL_COUNT) {
        drawGrid(result.grid, hatCells);
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  });
}

export function setStatus(text: string) {
  const node = document.querySelector('#status');
  if (node) {
    node.textContent = text;
  }
}

export function updateHud() {
  const meters = getJackpotMeterAmounts(
    state.bet,
    state.progressiveJackpots,
    state.denomination
  );
  const box = document.querySelector('#meters');
  if (box) {
    box.innerHTML = METER_ORDER.map(
      (id) =>
        `<div class="meter"><span>${JACKPOT_LABELS[id].toUpperCase()}</span><span>${formatMoney(meters[id])}</span></div>`
    ).join('');
  }

  const coin = document.querySelector('#coin') as HTMLSelectElement;
  const bet = document.querySelector('#bet') as HTMLSelectElement;
  if (coin && coin.options.length === 0) {
    for (const value of DENOMINATIONS) {
      const option = document.createElement('option');
      option.value = String(value);
      option.textContent = formatDenomination(value);
      coin.append(option);
    }
  }
  if (coin) {
    coin.value = String(state.denomination);
  }
  if (bet) {
    const multipliers = getBetMultipliers(state.denomination);
    bet.innerHTML = '';
    for (const multiplier of multipliers) {
      const option = document.createElement('option');
      option.value = String(multiplier);
      option.textContent = formatMoney(
        getBetAmount(state.denomination, multiplier)
      );
      bet.append(option);
    }
    bet.value = String(state.betMultiplier);
  }

  const balance = document.querySelector('#balance');
  if (balance) {
    balance.textContent = `Balance: ${formatMoney(state.balance)}`;
  }

  const session = document.querySelector('#session');
  if (session) {
    const parts: string[] = [];
    if (state.hatBonus) {
      parts.push(
        `${describeHatBonusMode(state.hatBonus.mode)} · ${state.hatBonus.spinsRemaining} spins`
      );
    }
    if (state.freeSpinsRemaining > 0) {
      parts.push(`Free spins: ${state.freeSpinsRemaining}`);
    }
    if (state.freeSpinSession.active) {
      parts.push(`Won: ${formatMoney(state.freeSpinSession.totalWon)}`);
    }
    session.textContent = parts.join(' · ');
  }
}

export function setSpinLabel(label: string) {
  const button = document.querySelector('#spin') as HTMLButtonElement;
  if (button) {
    button.textContent = label;
  }
}

export function setControlsLocked(locked: boolean) {
  for (const id of ['spin', 'auto', 'coin', 'bet', 'auto-count', 'paytable-btn']) {
    const node = document.querySelector(`#${id}`) as
      | HTMLButtonElement
      | HTMLSelectElement
      | null;
    if (node) {
      node.disabled = locked;
    }
  }
  const featureLock = Boolean(
    state.hatBonus || state.freeSpinsRemaining > 0
  );
  const coin = document.querySelector('#coin') as HTMLSelectElement | null;
  const bet = document.querySelector('#bet') as HTMLSelectElement | null;
  if (coin) {
    coin.disabled = locked || featureLock;
  }
  if (bet) {
    bet.disabled = locked || featureLock;
  }
}

export function showBanner(
  title: string,
  amount: string,
  persist = false
) {
  const banner = document.querySelector('#banner')!;
  document.querySelector('#banner-title')!.textContent = title;
  document.querySelector('#banner-amount')!.textContent = amount;
  banner.classList.remove('hidden');
  if (!persist) {
    window.setTimeout(() => banner.classList.add('hidden'), 2800);
  }
}

export function hideBanner() {
  document.querySelector('#banner')?.classList.add('hidden');
}

export function showWheel(title: string, hint: string) {
  document.querySelector('#wheel-title')!.textContent = title;
  document.querySelector('#wheel-hint')!.textContent = hint;
  document.querySelector('#wheel')!.classList.remove('hidden');
}

export function hideWheel() {
  document.querySelector('#wheel')!.classList.add('hidden');
}

export function animateWheel(
  sections: BonusWheelSection[],
  targetDeg: number,
  durationMs = 3600
): Promise<void> {
  const started = performance.now();

  return new Promise((resolve) => {
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / durationMs);
      const eased = 1 - (1 - progress) ** 3;
      drawWheel(sections, targetDeg * eased);
      if (progress < 1) {
        requestAnimationFrame(tick);
        return;
      }
      drawWheel(sections, targetDeg);
      resolve();
    };

    requestAnimationFrame(tick);
  });
}

function drawWheelLabel(text: string, maxWidth: number, fontSize: number) {
  wheelCtx.textAlign = 'center';
  wheelCtx.textBaseline = 'middle';
  const words = text.split(' ');
  let size = fontSize;
  let splitAt = 1;

  const widthOf = (line: string) => {
    wheelCtx.font = `bold ${size}px system-ui`;
    return wheelCtx.measureText(line).width;
  };

  while (size > 13) {
    if (words.length < 2) {
      if (widthOf(text) <= maxWidth) {
        break;
      }
    } else {
      let narrowest = Infinity;
      let best = 1;
      for (let index = 1; index < words.length; index++) {
        const width = Math.max(
          widthOf(words.slice(0, index).join(' ')),
          widthOf(words.slice(index).join(' '))
        );
        if (width < narrowest) {
          narrowest = width;
          best = index;
        }
      }
      splitAt = best;
      if (narrowest <= maxWidth) {
        break;
      }
    }
    size -= 1;
  }

  wheelCtx.font = `bold ${size}px system-ui`;
  wheelCtx.lineJoin = 'round';
  wheelCtx.lineWidth = Math.max(3, size * 0.14);
  wheelCtx.strokeStyle = '#1a120c';
  wheelCtx.fillStyle = '#f7f1e4';
  const paint = (line: string, y: number) => {
    wheelCtx.strokeText(line, 0, y);
    wheelCtx.fillText(line, 0, y);
  };
  if (words.length < 2 || splitAt >= words.length) {
    paint(text, 0);
    return;
  }
  const gap = size * 0.58;
  paint(words.slice(0, splitAt).join(' '), -gap);
  paint(words.slice(splitAt).join(' '), gap);
}

function wheelArt(section: BonusWheelSection):
  | { kind: 'image'; symbol: SymbolId; badge?: string }
  | { kind: 'mansion' }
  | { kind: 'coin'; tier: 'mini' | 'minor' | 'major' }
  | { kind: 'free' }
  | { kind: 'upgrade' } {
  const outcome = section.outcome;
  switch (outcome.type) {
    case 'buzzSaw':
      return { kind: 'image', symbol: 'BONUS' };
    case 'superBuzzSaw':
      return { kind: 'image', symbol: 'BONUS', badge: 'S' };
    case 'megaHat':
      return { kind: 'image', symbol: 'HAT' };
    case 'superHat':
      return { kind: 'image', symbol: 'HAT', badge: 'S' };
    case 'ultraHat':
      return { kind: 'image', symbol: 'HAT', badge: 'U' };
    case 'mansions':
      return { kind: 'mansion' };
    case 'jackpot':
      return {
        kind: 'coin',
        tier:
          outcome.jackpot === 'major'
            ? 'major'
            : outcome.jackpot === 'minor'
              ? 'minor'
              : 'mini',
      };
    case 'freeSpins':
      return { kind: 'free' };
    case 'upgrade':
      return { kind: 'upgrade' };
  }
}

function traceWheelIcon(size: number) {
  wheelCtx.beginPath();
  wheelCtx.roundRect(-size / 2, -size / 2, size, size, size * 0.16);
}

function drawWheelTile(symbol: SymbolId, size: number) {
  const img = images[symbol];
  wheelCtx.save();
  traceWheelIcon(size);
  wheelCtx.clip();
  wheelCtx.fillStyle = '#1a120c';
  wheelCtx.fillRect(-size / 2, -size / 2, size, size);
  if (img && img.complete && img.naturalWidth > 0) {
    wheelCtx.drawImage(img, -size / 2, -size / 2, size, size);
  }
  wheelCtx.restore();
  wheelCtx.lineWidth = Math.max(2, size * 0.06);
  wheelCtx.strokeStyle = '#f7f1e4';
  traceWheelIcon(size);
  wheelCtx.stroke();
}

function drawWheelBadge(label: string, size: number) {
  const badge = size * 0.34;
  const cx = size * 0.28;
  const cy = -size * 0.28;
  wheelCtx.beginPath();
  wheelCtx.arc(cx, cy, badge * 0.55, 0, Math.PI * 2);
  wheelCtx.fillStyle = '#1a120c';
  wheelCtx.fill();
  wheelCtx.lineWidth = Math.max(2, size * 0.04);
  wheelCtx.strokeStyle = '#f6d36b';
  wheelCtx.stroke();
  wheelCtx.fillStyle = '#f7f1e4';
  wheelCtx.font = `bold ${badge * 0.72}px system-ui`;
  wheelCtx.textAlign = 'center';
  wheelCtx.textBaseline = 'middle';
  wheelCtx.fillText(label, cx, cy);
}

function drawWheelMansion(size: number) {
  const w = size * 0.86;
  const h = size * 0.78;
  const left = -w / 2;
  const top = -h / 2;
  wheelCtx.fillStyle = '#f3e2c4';
  wheelCtx.fillRect(left + w * 0.22, top + h * 0.42, w * 0.56, h * 0.5);
  wheelCtx.fillRect(left + w * 0.02, top + h * 0.3, w * 0.24, h * 0.62);
  wheelCtx.fillRect(left + w * 0.74, top + h * 0.3, w * 0.24, h * 0.62);
  wheelCtx.fillStyle = '#7f1d1d';
  const roof = (x: number, roofWidth: number, peak: number) => {
    wheelCtx.beginPath();
    wheelCtx.moveTo(x, top + h * 0.34);
    wheelCtx.lineTo(x + roofWidth / 2, top + peak);
    wheelCtx.lineTo(x + roofWidth, top + h * 0.34);
    wheelCtx.closePath();
    wheelCtx.fill();
  };
  roof(left, w * 0.28, h * 0.08);
  roof(left + w * 0.72, w * 0.28, h * 0.08);
  roof(left + w * 0.18, w * 0.64, h * 0.16);
  wheelCtx.fillStyle = '#3b2414';
  wheelCtx.fillRect(left + w * 0.42, top + h * 0.62, w * 0.16, h * 0.3);
  wheelCtx.fillStyle = '#fde68a';
  wheelCtx.fillRect(left + w * 0.3, top + h * 0.52, w * 0.1, h * 0.12);
  wheelCtx.fillRect(left + w * 0.6, top + h * 0.52, w * 0.1, h * 0.12);
  wheelCtx.fillRect(left + w * 0.08, top + h * 0.46, w * 0.1, h * 0.12);
  wheelCtx.fillRect(left + w * 0.82, top + h * 0.46, w * 0.1, h * 0.12);
}

function drawWheelStar(radius: number) {
  wheelCtx.beginPath();
  for (let point = 0; point < 5; point++) {
    const outer = -Math.PI / 2 + point * ((Math.PI * 2) / 5);
    const inner = outer + Math.PI / 5;
    wheelCtx.lineTo(Math.cos(outer) * radius, Math.sin(outer) * radius);
    wheelCtx.lineTo(Math.cos(inner) * radius * 0.42, Math.sin(inner) * radius * 0.42);
  }
  wheelCtx.closePath();
}

function drawWheelCoin(tier: 'mini' | 'minor' | 'major', size: number) {
  const radius = size * (tier === 'major' ? 0.48 : tier === 'minor' ? 0.44 : 0.4);
  const center = tier === 'major' ? '#6b21a8' : tier === 'minor' ? '#075985' : '#3f6212';
  wheelCtx.beginPath();
  wheelCtx.arc(0, 0, radius, 0, Math.PI * 2);
  wheelCtx.fillStyle = '#f8e7a2';
  wheelCtx.fill();
  wheelCtx.lineWidth = Math.max(3, size * 0.08);
  wheelCtx.strokeStyle = '#6b3e09';
  wheelCtx.stroke();
  wheelCtx.beginPath();
  wheelCtx.arc(0, 0, radius * 0.7, 0, Math.PI * 2);
  wheelCtx.fillStyle = center;
  wheelCtx.fill();
  wheelCtx.fillStyle = '#f8e7a2';
  drawWheelStar(radius * (tier === 'mini' ? 0.34 : 0.42));
  wheelCtx.fill();
}

function drawWheelFree(size: number) {
  traceWheelIcon(size * 0.92);
  wheelCtx.fillStyle = '#f7f1e4';
  wheelCtx.fill();
  wheelCtx.lineWidth = Math.max(2, size * 0.05);
  wheelCtx.strokeStyle = '#1a120c';
  wheelCtx.stroke();
  wheelCtx.fillStyle = '#1a120c';
  wheelCtx.font = `bold ${size * 0.52}px system-ui`;
  wheelCtx.textAlign = 'center';
  wheelCtx.textBaseline = 'middle';
  wheelCtx.fillText('8', 0, size * 0.02);
}

function drawWheelUpgrade(size: number) {
  const radius = size * 0.42;
  wheelCtx.beginPath();
  wheelCtx.arc(0, 0, radius, 0, Math.PI * 2);
  wheelCtx.fillStyle = '#f6d36b';
  wheelCtx.fill();
  wheelCtx.lineWidth = Math.max(2, size * 0.05);
  wheelCtx.strokeStyle = '#1a120c';
  wheelCtx.stroke();
  wheelCtx.fillStyle = '#1a120c';
  wheelCtx.beginPath();
  wheelCtx.moveTo(0, -radius * 0.62);
  wheelCtx.lineTo(radius * 0.46, radius * 0.08);
  wheelCtx.lineTo(radius * 0.18, radius * 0.08);
  wheelCtx.lineTo(radius * 0.18, radius * 0.55);
  wheelCtx.lineTo(-radius * 0.18, radius * 0.55);
  wheelCtx.lineTo(-radius * 0.18, radius * 0.08);
  wheelCtx.lineTo(-radius * 0.46, radius * 0.08);
  wheelCtx.closePath();
  wheelCtx.fill();
}

function drawWheelGraphic(section: BonusWheelSection, size: number) {
  const art = wheelArt(section);
  if (art.kind === 'image') {
    drawWheelTile(art.symbol, size);
    if (art.badge) {
      drawWheelBadge(art.badge, size);
    }
    return;
  }
  if (art.kind === 'mansion') {
    drawWheelMansion(size);
    return;
  }
  if (art.kind === 'coin') {
    drawWheelCoin(art.tier, size);
    return;
  }
  if (art.kind === 'free') {
    drawWheelFree(size);
    return;
  }
  drawWheelUpgrade(size);
}

export function drawWheel(sections: BonusWheelSection[], rotationDeg: number) {
  lastWheel = { sections, rotationDeg };
  const { width, height } = wheelCanvas;
  wheelCtx.clearRect(0, 0, width, height);
  const cx = width / 2;
  const cy = height - 56;
  const radius = Math.min(width / 2 - 22, cy - 42);
  const clipBottom = cy + 40;
  const slice = (Math.PI * 2) / sections.length;
  const start = ((rotationDeg - 90) * Math.PI) / 180;

  wheelCtx.save();
  wheelCtx.beginPath();
  wheelCtx.rect(0, 0, width, clipBottom);
  wheelCtx.clip();

  wheelCtx.beginPath();
  wheelCtx.arc(cx, cy, radius + 8, 0, Math.PI * 2);
  wheelCtx.fillStyle = '#f6d36b';
  wheelCtx.fill();
  wheelCtx.beginPath();
  wheelCtx.arc(cx, cy, radius, 0, Math.PI * 2);
  wheelCtx.fillStyle = '#1a120c';
  wheelCtx.fill();

  sections.forEach((section, index) => {
    const wedgeStart = start + index * slice;
    const wedgeEnd = wedgeStart + slice;
    const mid = wedgeStart + slice / 2;
    wheelCtx.beginPath();
    wheelCtx.moveTo(cx, cy);
    wheelCtx.arc(cx, cy, radius, wedgeStart, wedgeEnd);
    wheelCtx.closePath();
    wheelCtx.fillStyle = section.color;
    wheelCtx.fill();
    wheelCtx.save();
    wheelCtx.clip();
    const shade = wheelCtx.createRadialGradient(cx, cy, radius * 0.15, cx, cy, radius);
    shade.addColorStop(0, 'rgba(0,0,0,0.2)');
    shade.addColorStop(0.62, 'rgba(255,255,255,0)');
    shade.addColorStop(1, 'rgba(255,255,255,0.28)');
    wheelCtx.fillStyle = shade;
    wheelCtx.fill();
    wheelCtx.restore();
    wheelCtx.lineWidth = 3;
    wheelCtx.strokeStyle = '#1a120c';
    wheelCtx.stroke();

    const iconRadius = radius * 0.56;
    const iconChord = 2 * iconRadius * Math.sin(slice / 2);
    const iconSize = Math.min(radius * 0.3, iconChord * 0.84);
    wheelCtx.save();
    wheelCtx.translate(cx + Math.cos(mid) * iconRadius, cy + Math.sin(mid) * iconRadius);
    wheelCtx.rotate(mid + Math.PI / 2);
    drawWheelGraphic(section, iconSize);
    wheelCtx.restore();

    const textRadius = radius * 0.84;
    const textChord = 2 * textRadius * Math.sin(slice / 2) * 0.86;
    wheelCtx.save();
    wheelCtx.translate(cx + Math.cos(mid) * textRadius, cy + Math.sin(mid) * textRadius);
    wheelCtx.rotate(mid + Math.PI / 2);
    drawWheelLabel(section.label, textChord, Math.max(15, radius * 0.05));
    wheelCtx.restore();

    const pegRadius = radius - 2;
    const pegX = cx + Math.cos(wedgeStart) * pegRadius;
    const pegY = cy + Math.sin(wedgeStart) * pegRadius;
    if (pegY < cy - 4) {
      wheelCtx.beginPath();
      wheelCtx.arc(pegX, pegY, Math.max(5, radius * 0.018), 0, Math.PI * 2);
      wheelCtx.fillStyle = '#f6d36b';
      wheelCtx.fill();
      wheelCtx.lineWidth = 2;
      wheelCtx.strokeStyle = '#1a120c';
      wheelCtx.stroke();
    }
  });

  wheelCtx.beginPath();
  wheelCtx.arc(cx, cy, radius * 0.16, 0, Math.PI * 2);
  wheelCtx.fillStyle = '#1a120c';
  wheelCtx.fill();
  wheelCtx.lineWidth = 6;
  wheelCtx.strokeStyle = '#f6d36b';
  wheelCtx.stroke();
  const lip = clipBottom - cy;
  const lipHalf = Math.sqrt(Math.max(0, radius * radius - lip * lip));
  wheelCtx.fillStyle = '#f6d36b';
  wheelCtx.fillRect(cx - lipHalf - 6, clipBottom - 8, lipHalf * 2 + 12, 10);
  wheelCtx.restore();

  wheelCtx.save();
  wheelCtx.shadowColor = 'rgba(0,0,0,0.4)';
  wheelCtx.shadowBlur = 8;
  wheelCtx.shadowOffsetY = 2;
  wheelCtx.beginPath();
  wheelCtx.moveTo(cx - 18, 0);
  wheelCtx.lineTo(cx + 18, 0);
  wheelCtx.lineTo(cx, 36);
  wheelCtx.closePath();
  wheelCtx.fillStyle = '#f6d36b';
  wheelCtx.fill();
  wheelCtx.shadowColor = 'transparent';
  wheelCtx.lineWidth = 3;
  wheelCtx.strokeStyle = '#1a120c';
  wheelCtx.stroke();
  wheelCtx.restore();
}

export function showPaytable() {
  const body = document.querySelector('#paytable-body')!;
  const { bet, denomination, progressiveJackpots } = state;
  const symbols: SymbolId[] = [
    'PREM3',
    'PREM2',
    'PREM1',
    'WILD',
    'A',
    'K',
    'Q',
    'J',
  ];
  const lineRows = symbols
    .map((id) => {
      const cells = [3, 4, 5]
        .map((count) => {
          const raw = (paytable[id][count - 1] || 0) * bet * 0.5;
          return snapToDenomination(raw, denomination);
        })
        .map((value) => (value > 0 ? formatWin(value, denomination) : '—'));
      return `<tr><td>${id}</td><td>${cells[0]}</td><td>${cells[1]}</td><td>${cells[2]}</td></tr>`;
    })
    .join('');

  const scatter = [3, 4, 5]
    .map(
      (count) =>
        `<tr><td>${count}+</td><td>${formatWin(
          snapToDenomination((SCATTER_PAYS[count] || 0) * bet, denomination),
          denomination
        )}</td></tr>`
    )
    .join('');

  const tier = getBetTierFromWager(denomination, bet);
  const jackpots = (['grand', 'major', 'minor', 'mini'] as JackpotId[])
    .map((id) => {
      const payout = getJackpotPayout(id, bet, 1, progressiveJackpots, denomination);
      return `<tr><td>${formatJackpotShortLabel(id, tier)}${
        isProgressiveJackpot(id) ? ' (progressive)' : ''
      }</td><td>${formatWin(payout, denomination)}</td></tr>`;
    })
    .join('');

  body.innerHTML = `
    <p>Line hits pay 50% of the paytable × bet. Scatter, crown prizes, and jackpots are unscaled.</p>
    <table><thead><tr><th>Symbol</th><th>3</th><th>4</th><th>5</th></tr></thead><tbody>${lineRows}</tbody></table>
    <h3>BONUS scatter</h3>
    <table><tbody>${scatter}</tbody></table>
    <h3>Crown bonus</h3>
    <p>${HAT_TRIGGER_COUNT}+ crowns start 6 free spins. End prizes ${formatWin(
      snapToDenomination(HAT_CELL_PRIZE_RANGES.yellow[0] * bet, denomination),
      denomination
    )}–${formatWin(
      snapToDenomination(HAT_CELL_PRIZE_RANGES.blue[1] * bet, denomination),
      denomination
    )}. Cell totals show coin credits.</p>
    <h3>Jackpots</h3>
    <table><tbody>${jackpots}</tbody></table>
  `;
  document.querySelector('#paytable')!.classList.remove('hidden');
}

export function hidePaytable() {
  document.querySelector('#paytable')!.classList.add('hidden');
}

export function setupTestMode(
  sections: { id: string; label: string }[]
) {
  const panel = document.querySelector('#test')!;
  const enabled = new URLSearchParams(window.location.search).has('test');
  panel.classList.toggle('hidden', !enabled);
  const select = document.querySelector('#force-wheel') as HTMLSelectElement;
  select.innerHTML = `<option value="spin-wheel">Spin Wheel</option>`;
  for (const section of sections) {
    const option = document.createElement('option');
    option.value = section.id;
    option.textContent = section.label;
    select.append(option);
  }
}

export function getWinBannerTitle(payout: number, bet: number): string {
  const multiple = bet > 0 ? payout / bet : 0;
  if (multiple >= 40) {
    return 'MEGA WIN';
  }
  if (multiple >= 15) {
    return 'BIG WIN';
  }
  return 'WIN';
}

export function isTestMode() {
  return new URLSearchParams(window.location.search).has('test');
}

export function columnHas(
  grid: SymbolId[][],
  reel: number,
  kind: 'bonus' | 'hat'
) {
  return (grid[reel] ?? []).some((symbol) =>
    kind === 'bonus' ? symbol === 'BONUS' : isHatSymbol(symbol)
  );
}
