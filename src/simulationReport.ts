import { formatMoney } from './game/money';
import {
  buildReturnMultiplierHistogramBins,
  buildSpinsBetweenBonusHistogramBins,
  buildWinAmountHistogramBins,
  type ReturnMultiplierHistogramBin,
  type SimulationBonusTypeStat,
  type SimulationResult,
  type SimulationVolatility,
  type SimulationWheelSectionStat,
  type SymbolCountFrequency,
  type WinAmountFrequency,
  type WinAmountHistogramBin,
} from './game/simulate';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function percentOf(part: number, whole: number): string {
  return whole > 0 ? ((part / whole) * 100).toFixed(2) : '0.00';
}

function formatReturnMultiplier(value: number): string {
  return `${value.toFixed(2)}x`;
}

function windowReturnPercent(multiplier: number, windowSpins: number): number {
  return windowSpins > 0 ? (multiplier / windowSpins) * 100 : 0;
}

function statRow(label: string, value: string): string {
  return `<dt>${escapeHtml(label)}</dt><dd>${value}</dd>`;
}

function wheelTable(title: string, stats: SimulationWheelSectionStat[]): string {
  const totalHits = stats.reduce((sum, entry) => sum + entry.hits, 0);
  const rows = stats
    .map((entry) => {
      const share = totalHits > 0 ? (entry.hits / totalHits) * 100 : 0;
      return `<tr><td>${escapeHtml(entry.label)}</td><td>${entry.hits.toLocaleString()}</td><td>${share.toFixed(2)}%</td></tr>`;
    })
    .join('');

  return `<section>
    <h3>${escapeHtml(title)}</h3>
    <table>
      <thead><tr><th>Selection</th><th>Wins</th><th>Share</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

function bonusTable(title: string, stats: SimulationBonusTypeStat[]): string {
  const rows = stats
    .map(
      (entry) => `<tr><td>${escapeHtml(entry.label)}</td><td>${entry.hits.toLocaleString()}</td><td>${escapeHtml(formatMoney(entry.averagePayout, { cents: true }))}</td><td>${escapeHtml(formatMoney(entry.totalPayout, { cents: true }))}</td></tr>`
    )
    .join('');

  return `<section>
    <h3>${escapeHtml(title)}</h3>
    <table>
      <thead><tr><th>Bonus type</th><th>Hits</th><th>Avg win</th><th>Total won</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

function histogramSizing(binCount: number) {
  const safeCount = Math.max(binCount, 1);
  return {
    gap: Math.max(2, Math.min(8, Math.round(72 / safeCount))),
    fontSize: Math.max(8, Math.min(12, Math.round(520 / safeCount))),
    barHeight: Math.max(72, Math.min(120, Math.round(900 / safeCount))),
  };
}

function histogram(
  title: string,
  bins: WinAmountHistogramBin[],
  emptyLabel: string,
  barColor: string,
  eventLabel = 'events'
): string {
  const totalEvents = bins.reduce((sum, bin) => sum + bin.count, 0);
  if (totalEvents === 0) {
    return `<section class="sim-chart"><h3>${escapeHtml(title)}</h3><p class="sim-empty">${escapeHtml(emptyLabel)}</p></section>`;
  }

  const maxCount = bins.reduce((max, bin) => Math.max(max, bin.count), 0);
  const sizing = histogramSizing(bins.length);
  const bars = bins
    .map((bin) => {
      const heightPercent = maxCount > 0 ? (bin.count / maxCount) * 100 : 0;
      const frequency = (bin.count / totalEvents) * 100;
      const height = Math.max(heightPercent, bin.count > 0 ? 4 : 0);
      const tip = `${bin.count.toLocaleString()} ${eventLabel} (${frequency.toFixed(1)}%)`;
      return `<div class="sim-bar" style="gap:${Math.max(4, Math.round(sizing.gap * 0.75))}px">
        <span style="font-size:${sizing.fontSize}px" title="${escapeHtml(tip)}">${bin.count.toLocaleString()}</span>
        <div class="sim-bar-track" style="height:${sizing.barHeight}px">
          <div style="height:${height}%;background:${barColor}" title="${escapeHtml(tip)}"></div>
        </div>
        <span style="font-size:${sizing.fontSize}px" title="${escapeHtml(bin.label)}">${escapeHtml(bin.label)}</span>
      </div>`;
    })
    .join('');

  return `<section class="sim-chart">
    <h3>${escapeHtml(title)}</h3>
    <div class="sim-bars" style="gap:${sizing.gap}px;min-height:${sizing.barHeight + 48}px">${bars}</div>
    <p class="sim-note">${totalEvents.toLocaleString()} ${escapeHtml(eventLabel)}</p>
  </section>`;
}

function winHistogram(
  title: string,
  frequencies: WinAmountFrequency,
  bet: number,
  emptyLabel: string,
  barColor: string
): string {
  return histogram(
    title,
    buildWinAmountHistogramBins(frequencies, bet),
    emptyLabel,
    barColor
  );
}

function spinsHistogram(frequencies: SymbolCountFrequency): string {
  return histogram(
    'Spins between bonuses',
    buildSpinsBetweenBonusHistogramBins(frequencies),
    'No bonus hits in this simulation.',
    'linear-gradient(180deg, #67e8f9 0%, #0891b2 100%)',
    'intervals'
  );
}

function svgNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : '0';
}

function volatilityCurve(
  bins: ReturnMultiplierHistogramBin[],
  averageMultiplier: number,
  medianMultiplier: number,
  windowCount: number,
  windowSpins: number
): string {
  const viewWidth = 640;
  const viewHeight = 220;
  const padding = { top: 28, right: 18, bottom: 40, left: 48 };
  const innerWidth = viewWidth - padding.left - padding.right;
  const innerHeight = viewHeight - padding.top - padding.bottom;
  const totalEvents = bins.reduce((sum, bin) => sum + bin.count, 0);

  if (totalEvents === 0) {
    return `<p class="sim-empty">Not enough spins to assess volatility. Run at least ${windowSpins} paid spins.</p>`;
  }

  const maxFrequency = bins.reduce(
    (max, bin) => Math.max(max, bin.count / totalEvents),
    0
  );
  const xMin = bins[0]?.minMultiplier ?? 0;
  const xMax = bins[bins.length - 1]?.maxMultiplier ?? 1;
  const xRange = Math.max(xMax - xMin, 1);
  const multiplierToX = (value: number) =>
    padding.left + ((value - xMin) / xRange) * innerWidth;
  const frequencyToY = (frequency: number) => {
    if (maxFrequency <= 0) {
      return padding.top + innerHeight;
    }
    return padding.top + innerHeight - (frequency / maxFrequency) * innerHeight;
  };

  const curvePoints = bins.map((bin) => {
    const frequency = bin.count / totalEvents;
    return {
      x: multiplierToX((bin.minMultiplier + bin.maxMultiplier) / 2),
      y: frequencyToY(frequency),
      frequency,
      bin,
    };
  });
  const baselineY = padding.top + innerHeight;
  const startX = multiplierToX(xMin);
  const endX = multiplierToX(xMax);
  const linePath = curvePoints
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${svgNumber(point.x)} ${svgNumber(point.y)}`)
    .join(' ');
  const areaPath = `M ${svgNumber(startX)} ${svgNumber(baselineY)} ${curvePoints
    .map((point) => `L ${svgNumber(point.x)} ${svgNumber(point.y)}`)
    .join(' ')} L ${svgNumber(endX)} ${svgNumber(baselineY)} Z`;

  const yTickCount = 4;
  const yTicks = Array.from({ length: yTickCount + 1 }, (_, index) => {
    const frequency = (maxFrequency * index) / yTickCount;
    return {
      y: frequencyToY(frequency),
      label: `${(frequency * 100).toFixed(0)}%`,
    };
  });
  const xTickCount = Math.min(8, bins.length);
  const xTickStep = Math.max(1, Math.round((bins.length - 1) / xTickCount));
  const xTicks = bins
    .filter(
      (_, index) =>
        index === 0 || index === bins.length - 1 || index % xTickStep === 0
    )
    .map((bin) => ({
      x: multiplierToX(bin.minMultiplier),
      label: `${bin.minMultiplier}x`,
    }));
  if (xTicks[xTicks.length - 1]?.label !== `${xMax}x`) {
    const last = xTicks[xTicks.length - 1];
    const x = multiplierToX(xMax);
    if (last && Math.abs(last.x - x) < 36) {
      last.x = x;
      last.label = `${xMax}x`;
    } else {
      xTicks.push({ x, label: `${xMax}x` });
    }
  }

  const markers = [
    { id: 'average', value: averageMultiplier, color: '#fbbf24', label: 'Avg', dash: '' },
    { id: 'median', value: medianMultiplier, color: '#67e8f9', label: 'Median', dash: '6 4' },
  ].filter((marker) => marker.value >= xMin && marker.value <= xMax);

  const yMarkup = yTicks
    .map(
      (tick) => `<g>
        <line x1="${padding.left}" x2="${padding.left + innerWidth}" y1="${svgNumber(tick.y)}" y2="${svgNumber(tick.y)}" stroke="#4a3d2c" stroke-width="1"></line>
        <text x="${padding.left - 8}" y="${svgNumber(tick.y)}" fill="#c4b49a" font-size="11" font-weight="600" text-anchor="end" dominant-baseline="middle">${escapeHtml(tick.label)}</text>
      </g>`
    )
    .join('');
  const markerMarkup = markers
    .map((marker) => {
      const x = multiplierToX(marker.value);
      const dash = marker.dash ? ` stroke-dasharray="${marker.dash}"` : '';
      return `<g>
        <line x1="${svgNumber(x)}" x2="${svgNumber(x)}" y1="${padding.top}" y2="${svgNumber(baselineY)}" stroke="${marker.color}" stroke-width="1.5"${dash}></line>
        <text x="${svgNumber(x + 4)}" y="${marker.id === 'median' ? 24 : 12}" fill="${marker.color}" font-size="11" font-weight="700">${marker.label}</text>
      </g>`;
    })
    .join('');
  const xMarkup = xTicks
    .map((tick) => {
      const anchor =
        tick.x <= padding.left + 8
          ? 'start'
          : tick.x >= padding.left + innerWidth - 8
            ? 'end'
            : 'middle';
      return `<text x="${svgNumber(tick.x)}" y="${viewHeight - 12}" fill="#c4b49a" font-size="11" font-weight="600" text-anchor="${anchor}">${escapeHtml(tick.label)}</text>`;
    })
    .join('');
  const dots = curvePoints
    .map((point) => {
      const tip = `${point.bin.label}: ${point.bin.count.toLocaleString()} of ${windowCount.toLocaleString()} sets (${(point.frequency * 100).toFixed(1)}%)`;
      return `<circle cx="${svgNumber(point.x)}" cy="${svgNumber(point.y)}" r="3" fill="#fb923c"><title>${escapeHtml(tip)}</title></circle>`;
    })
    .join('');

  return `<div>
    <p class="sim-note">Return distribution (multiples of bet)</p>
    <svg viewBox="0 0 ${viewWidth} ${viewHeight}" role="img" aria-label="Distribution of ${windowSpins}-spin returns as multiples of the bet. Average ${formatReturnMultiplier(averageMultiplier)}, median ${formatReturnMultiplier(medianMultiplier)}.">
      <defs>
        <linearGradient id="volatility-curve-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#fb923c" stop-opacity="0.5"></stop>
          <stop offset="100%" stop-color="#fb923c" stop-opacity="0.04"></stop>
        </linearGradient>
      </defs>
      ${yMarkup}
      <path d="${areaPath}" fill="url(#volatility-curve-fill)"></path>
      <path d="${linePath}" fill="none" stroke="#fb923c" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"></path>
      ${markerMarkup}
      <line x1="${padding.left}" x2="${padding.left + innerWidth}" y1="${svgNumber(baselineY)}" y2="${svgNumber(baselineY)}" stroke="#4a3d2c" stroke-width="1"></line>
      ${xMarkup}
      ${dots}
    </svg>
    <p class="sim-legend">
      <span>${windowCount.toLocaleString()} sets of ${windowSpins} paid spins</span>
      <span class="sim-avg">Average ${formatReturnMultiplier(averageMultiplier)}</span>
      <span class="sim-median">Median ${formatReturnMultiplier(medianMultiplier)}</span>
    </p>
  </div>`;
}

function volatilitySection(volatility: SimulationVolatility): string {
  const bins = buildReturnMultiplierHistogramBins(volatility.returnMultipliers);
  const averagePercent = windowReturnPercent(
    volatility.averageReturnMultiplier,
    volatility.windowSpins
  ).toFixed(2);
  const medianPercent = windowReturnPercent(
    volatility.medianReturnMultiplier,
    volatility.windowSpins
  ).toFixed(2);

  return `<section class="sim-volatility">
    <h3>Volatility (${volatility.windowSpins}-spin sets)</h3>
    <dl>
      ${statRow(`Sets of ${volatility.windowSpins} spins`, volatility.windowCount.toLocaleString())}
      ${statRow(
        'Average return',
        `${formatReturnMultiplier(volatility.averageReturnMultiplier)} bet (${averagePercent}% of amount wagered)`
      )}
      ${statRow(
        'Median return',
        `${formatReturnMultiplier(volatility.medianReturnMultiplier)} bet (${medianPercent}% of amount wagered)`
      )}
    </dl>
    <p class="sim-note">Average matches overall pay rate. Median shows a typical ${volatility.windowSpins}-spin session; a lower median means most sessions pay less than RTP, with larger wins in the tail.</p>
    ${volatilityCurve(
      bins,
      volatility.averageReturnMultiplier,
      volatility.medianReturnMultiplier,
      volatility.windowCount,
      volatility.windowSpins
    )}
  </section>`;
}

/** The test-panel report from the original simulation view. */
export function renderSimulationReport(result: SimulationResult): string {
  const freeSpinBonuses =
    result.freeSpinRetriggerHits + result.freeSpinHatBonusHits;

  return `<div class="sim-report">
    <div class="sim-summary">
      <dl>
        ${statRow(
          'Pay rate',
          `${result.payRate.toFixed(2)}% (${escapeHtml(formatMoney(result.totalPayout, { cents: true }))} returned / ${escapeHtml(formatMoney(result.totalWagered, { cents: true }))} wagered)`
        )}
        ${statRow('Longest dead-spin streak', result.longestDeadSpinStreak.toLocaleString())}
        ${statRow('Longest spins between bonuses', result.longestSpinsBetweenBonuses.toLocaleString())}
        ${statRow('Avg. spins between bonuses', result.averageSpinsBetweenBonuses.toFixed(2))}
      </dl>
      <dl>
        ${statRow(
          'Bonus hits',
          `${result.bonusHits.toLocaleString()} (${percentOf(result.bonusHits, result.spinCount)}% of paid spins)`
        )}
        ${statRow(
          'Bonuses during free spins',
          `${freeSpinBonuses.toLocaleString()} (${result.freeSpinRetriggerHits.toLocaleString()} retriggers, ${result.freeSpinHatBonusHits.toLocaleString()} crown)`
        )}
        ${statRow(
          'Crown bonus hits',
          `${result.hatBonusHits.toLocaleString()} (${percentOf(result.hatBonusHits, result.spinCount)}% of paid spins)`
        )}
        ${statRow(
          'Winning spins',
          `${result.winningSpins.toLocaleString()} / ${result.spinCount.toLocaleString()}`
        )}
      </dl>
    </div>
    ${volatilitySection(result.volatility)}
    <div class="sim-tables">
      ${wheelTable('Bonus wheel selections', result.wheelSectionStats)}
      ${wheelTable('Upgrade wheel selections', result.upgradeWheelSectionStats)}
      ${bonusTable('Average bonus win amounts', result.bonusTypeStats)}
      ${bonusTable('Average upgrade bonus win amounts', result.upgradeBonusTypeStats)}
    </div>
    <div class="sim-charts">
      ${spinsHistogram(result.spinsBetweenBonusFrequency)}
      ${winHistogram(
        'Crown bonus win amounts',
        result.hatBonusWinFrequency,
        result.bet,
        'No crown bonus wins in this simulation.',
        'linear-gradient(180deg, #c084fc 0%, #7c3aed 100%)'
      )}
      ${winHistogram(
        'Free spin win amounts',
        result.freeSpinWinFrequency,
        result.bet,
        'No free spin bonuses in this simulation.',
        'linear-gradient(180deg, #fcd34d 0%, #d97706 100%)'
      )}
    </div>
  </div>`;
}
