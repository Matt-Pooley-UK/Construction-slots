export type SymbolId =
  | 'A'
  | 'K'
  | 'Q'
  | 'J'
  | 'PREM1'
  | 'PREM2'
  | 'PREM3'
  | 'WILD'
  | 'BONUS'
  | 'HAT'
  | 'HAT2'
  | 'HAT3';

export const SYMBOLS: SymbolId[] = [
  'A',
  'K',
  'Q',
  'J',
  'PREM1',
  'PREM2',
  'PREM3',
  'WILD',
  'BONUS',
  'HAT',
  'HAT2',
  'HAT3',
];

/** Standard / 2× / 3× hat symbols used during hat bonus spins. */
export function isHatSymbol(symbol: SymbolId): boolean {
  return symbol === 'HAT' || symbol === 'HAT2' || symbol === 'HAT3';
}

/** Color-upgrade steps applied when this hat lands during Ultra Hat (1 otherwise). */
export function getHatUpgradeSteps(symbol: SymbolId): number {
  if (symbol === 'HAT3') {
    return 3;
  }

  if (symbol === 'HAT2') {
    return 2;
  }

  if (symbol === 'HAT') {
    return 1;
  }

  return 0;
}
