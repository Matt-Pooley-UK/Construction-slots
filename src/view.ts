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
  HAT_CELL_PRIZE_RANGES,
  HAT_TRIGGER_COUNT,
  type HatCellColor,
  type JackpotId,
} from './game/config';
import type { HatBonusCell } from './game/hatBonus';
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
      if (lastGrid) {
        drawGrid(lastGrid, lastHatCells, lastHighlights);
      }
    };
    img.onload = ready;
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
          : String(Math.round(prize / state.denomination));
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
    result.isSuperBuzzSaw,
    result.isSuperPowerSaw
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
        `${state.hatBonus.mode ?? 'hat'} · ${state.hatBonus.spinsRemaining} spins`
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

function drawWheelLabel(text: string, maxWidth: number) {
  if (wheelCtx.measureText(text).width <= maxWidth) {
    wheelCtx.fillText(text, 0, 0);
    return;
  }
  const words = text.split(' ');
  if (words.length < 2) {
    wheelCtx.fillText(text, 0, 0);
    return;
  }
  let splitAt = 1;
  let narrowest = Infinity;
  for (let index = 1; index < words.length; index++) {
    const width = Math.max(
      wheelCtx.measureText(words.slice(0, index).join(' ')).width,
      wheelCtx.measureText(words.slice(index).join(' ')).width
    );
    if (width < narrowest) {
      narrowest = width;
      splitAt = index;
    }
  }
  wheelCtx.fillText(words.slice(0, splitAt).join(' '), 0, -6);
  wheelCtx.fillText(words.slice(splitAt).join(' '), 0, 7);
}

export function drawWheel(sections: BonusWheelSection[], rotationDeg: number) {
  const { width, height } = wheelCanvas;
  wheelCtx.clearRect(0, 0, width, height);
  const cx = width / 2;
  const cy = height - 8;
  const radius = Math.min(width / 2 - 8, height - 16);
  const slice = (Math.PI * 2) / sections.length;
  const start = ((rotationDeg - 90) * Math.PI) / 180;

  wheelCtx.save();
  wheelCtx.beginPath();
  wheelCtx.rect(0, 0, width, cy);
  wheelCtx.clip();

  sections.forEach((section, index) => {
    wheelCtx.beginPath();
    wheelCtx.moveTo(cx, cy);
    wheelCtx.arc(cx, cy, radius, start + index * slice, start + (index + 1) * slice);
    wheelCtx.closePath();
    wheelCtx.fillStyle = section.color;
    wheelCtx.fill();
    wheelCtx.strokeStyle = '#111';
    wheelCtx.stroke();

    const mid = start + index * slice + slice / 2;
    const textRadius = radius * 0.68;
    wheelCtx.save();
    wheelCtx.translate(cx + Math.cos(mid) * textRadius, cy + Math.sin(mid) * textRadius);
    wheelCtx.rotate(mid + Math.PI / 2);
    wheelCtx.fillStyle = '#fff';
    wheelCtx.font = 'bold 11px system-ui';
    wheelCtx.textAlign = 'center';
    wheelCtx.textBaseline = 'middle';
    drawWheelLabel(section.label, 2 * textRadius * Math.sin(slice / 2) * 0.9);
    wheelCtx.restore();
  });
  wheelCtx.restore();

  wheelCtx.fillStyle = '#e0a106';
  wheelCtx.beginPath();
  wheelCtx.moveTo(cx - 10, 4);
  wheelCtx.lineTo(cx + 10, 4);
  wheelCtx.lineTo(cx, 22);
  wheelCtx.fill();
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
    <p>Line hits pay 50% of the paytable × bet. Scatter, hat prizes, and jackpots are unscaled.</p>
    <table><thead><tr><th>Symbol</th><th>3</th><th>4</th><th>5</th></tr></thead><tbody>${lineRows}</tbody></table>
    <h3>BONUS scatter</h3>
    <table><tbody>${scatter}</tbody></table>
    <h3>Hat bonus</h3>
    <p>${HAT_TRIGGER_COUNT}+ HAT starts 6 free spins. End prizes ${formatWin(
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
