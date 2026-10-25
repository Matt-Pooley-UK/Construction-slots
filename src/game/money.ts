/** Round a dollar amount to the nearest cent. */
export function roundMoney(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/** Convert a dollar amount to a whole number of denomination credits. */
export function dollarsToCredits(
  amount: number,
  denomination: number
): number {
  if (!(denomination > 0)) {
    return Math.round(amount * 100);
  }

  return Math.round(amount / denomination);
}

/** Convert a whole credit count back to dollars. */
export function creditsToDollars(
  credits: number,
  denomination: number
): number {
  return roundMoney(credits * denomination);
}

/** Snap a dollar amount to the nearest whole number of denomination credits. */
export function snapToDenomination(
  amount: number,
  denomination: number
): number {
  return creditsToDollars(dollarsToCredits(amount, denomination), denomination);
}

/** Dollar wager for a denomination × multiplier pair. */
export function getBetAmount(denomination: number, multiplier: number): number {
  return snapToDenomination(denomination * multiplier, denomination);
}

export interface FormatMoneyOptions {
  sign?: boolean;
  /** Always show two decimal places (e.g. $5.00). Defaults to true. */
  cents?: boolean;
}

/** Format a game amount as US currency (values are already in dollars). */
export function formatMoney(
  amount: number,
  options?: FormatMoneyOptions
): string {
  const { sign = false, cents = true } = options ?? {};
  const absolute = Math.abs(amount);
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents ? 2 : Number.isInteger(absolute) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(absolute);

  if (!sign) {
    return amount < 0 ? `-${formatted}` : formatted;
  }

  if (amount > 0) {
    return `+${formatted}`;
  }

  if (amount < 0) {
    return `-${formatted}`;
  }

  return formatted;
}

/** Format an inclusive win-amount range for histogram bins. */
export function formatMoneyRange(min: number, max: number): string {
  return `${formatMoney(min, { cents: true })}–${formatMoney(max, { cents: true })}`;
}

/** Player-facing coin label: 1¢, 25¢, $1, $10. */
export function formatDenomination(denomination: number): string {
  if (denomination > 0 && denomination < 1) {
    return `${Math.round(denomination * 100)}¢`;
  }

  return formatMoney(denomination, { cents: !Number.isInteger(denomination) });
}

export function formatCredits(
  credits: number,
  options?: { sign?: boolean }
): string {
  const { sign = false } = options ?? {};
  const formatted = new Intl.NumberFormat('en-US').format(Math.abs(credits));

  if (!sign) {
    return credits < 0 ? `-${formatted}` : formatted;
  }

  if (credits > 0) {
    return `+${formatted}`;
  }

  if (credits < 0) {
    return `-${formatted}`;
  }

  return formatted;
}

/** Dollar win plus credit count, e.g. "+$1.00 (50)". */
export function formatWin(
  amount: number,
  denomination: number,
  options?: FormatMoneyOptions
): string {
  const credits = dollarsToCredits(amount, denomination);
  return `${formatMoney(amount, options)} (${formatCredits(credits)})`;
}

/** Credit count only — used for hat-bonus end prizes. */
export function formatWinCredits(
  amount: number,
  denomination: number,
  options?: { sign?: boolean }
): string {
  return formatCredits(dollarsToCredits(amount, denomination), options);
}
