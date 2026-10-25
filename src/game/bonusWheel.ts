import {
  JACKPOT_WHEEL_WEIGHT,
  MAJOR_JACKPOT_UPGRADE_WHEEL_WEIGHT,
  MANSIONS_WHEEL_WEIGHT,
  SUPER_BUZZ_SAW_WHEEL_WEIGHT,
  SUPER_HAT_WHEEL_WEIGHT,
  SUPER_POWER_SAW_WHEEL_WEIGHT,
  UPGRADE_WHEEL_WEIGHT,
  type JackpotId,
} from './config';
import { describeJackpot, formatJackpotShortLabel } from './jackpots';

export type BonusWheelOutcome =
  | { type: 'freeSpins'; count: number }
  | { type: 'buzzSaw' }
  | { type: 'superBuzzSaw' }
  | { type: 'powerSaw' }
  | { type: 'superPowerSaw' }
  | { type: 'megaHat' }
  | { type: 'ultraHat' }
  | { type: 'superHat' }
  | { type: 'mansions' }
  | { type: 'upgrade' }
  | { type: 'jackpot'; jackpot: JackpotId };

export interface BonusWheelSection {
  id: string;
  label: string;
  /** CSS color for the wedge background */
  color: string;
  /** Optional graphic shown in the wedge (public path, e.g. /symbols/hardhat.png) */
  imageSrc?: string;
  outcome: BonusWheelOutcome;
  /** Relative weight for landing chance (default 1) */
  weight?: number;
}

/**
 * Primary bonus wheel outcomes after 3+ BONUS. Landing Upgrade opens the
 * upgrade wheel. Each outcome is shown twice on the spun wheel.
 */
const BONUS_WHEEL_UNIQUE_SECTIONS: BonusWheelSection[] = [
  {
    id: 'buzz-saw',
    label: 'Buzz Saw',
    color: '#a16207',
    imageSrc: '/symbols/bonus.png',
    outcome: { type: 'buzzSaw' },
    weight: 1.1,
  },
  {
    id: 'power-saw',
    label: 'Power-Saw',
    color: '#047857',
    imageSrc: '/symbols/bonus.png',
    outcome: { type: 'powerSaw' },
    weight: 1.1,
  },
  {
    id: 'mega-hat',
    label: 'Mega Hat',
    color: '#ca8a04',
    imageSrc: '/symbols/hardhat.png',
    outcome: { type: 'megaHat' },
    weight: 1.45,
  },
  {
    id: 'mansions',
    label: 'Mansions',
    color: '#b91c1c',
    imageSrc: '/symbols/bonus.png',
    outcome: { type: 'mansions' },
    weight: MANSIONS_WHEEL_WEIGHT,
  },
  {
    id: 'mini-jackpot',
    label: 'Mini',
    color: '#65a30d',
    imageSrc: '/symbols/bonus.png',
    outcome: { type: 'jackpot', jackpot: 'mini' },
    weight: JACKPOT_WHEEL_WEIGHT,
  },
  {
    id: 'minor-jackpot',
    label: 'Minor',
    color: '#0284c7',
    imageSrc: '/symbols/bonus.png',
    outcome: { type: 'jackpot', jackpot: 'minor' },
    weight: JACKPOT_WHEEL_WEIGHT,
  },
  {
    id: 'free-8',
    label: '8 Free Games',
    color: '#b45309',
    outcome: { type: 'freeSpins', count: 8 },
    weight: 1.15,
  },
  {
    id: 'upgrade',
    label: 'Upgrade',
    color: '#7c3aed',
    imageSrc: '/symbols/hardhat.png',
    outcome: { type: 'upgrade' },
    weight: UPGRADE_WHEEL_WEIGHT,
  },
];

/**
 * Second wheel outcomes after Upgrade.
 * Each outcome is shown twice on the spun wheel.
 */
const UPGRADE_WHEEL_UNIQUE_SECTIONS: BonusWheelSection[] = [
  {
    id: 'super-buzz-saw',
    label: 'Super Buzz Saw',
    color: '#92400e',
    imageSrc: '/symbols/bonus.png',
    outcome: { type: 'superBuzzSaw' },
    weight: SUPER_BUZZ_SAW_WHEEL_WEIGHT,
  },
  {
    id: 'super-power-saw',
    label: 'Super Power Saw',
    color: '#065f46',
    imageSrc: '/symbols/bonus.png',
    outcome: { type: 'superPowerSaw' },
    weight: SUPER_POWER_SAW_WHEEL_WEIGHT,
  },
  {
    id: 'super-hat',
    label: 'Super Hat',
    color: '#7c3aed',
    imageSrc: '/symbols/hardhat.png',
    outcome: { type: 'superHat' },
    weight: SUPER_HAT_WHEEL_WEIGHT,
  },
  {
    id: 'ultra-hat',
    label: 'Ultra Hat',
    color: '#0e7490',
    imageSrc: '/symbols/hardhat.png',
    outcome: { type: 'ultraHat' },
    weight: 0.35,
  },
  {
    id: 'major-jackpot',
    label: 'Major',
    color: '#c026d3',
    imageSrc: '/symbols/hardhat.png',
    outcome: { type: 'jackpot', jackpot: 'major' },
    weight: MAJOR_JACKPOT_UPGRADE_WHEEL_WEIGHT,
  },
];

/** Append a second copy of every section so the wheel has more wedges. */
function withSecondOutcomeCopies(
  sections: BonusWheelSection[]
): BonusWheelSection[] {
  return [
    ...sections,
    ...sections.map((section) => ({
      ...section,
      id: `${section.id}-b`,
    })),
  ];
}

/** Unique outcomes for forced-pick UI, simulation stats, and id lookup. */
export const BONUS_WHEEL_OUTCOMES = BONUS_WHEEL_UNIQUE_SECTIONS;
export const UPGRADE_WHEEL_OUTCOMES = UPGRADE_WHEEL_UNIQUE_SECTIONS;

/** Spun wheel wedges (each outcome appears twice). */
export const BONUS_WHEEL_SECTIONS = withSecondOutcomeCopies(
  BONUS_WHEEL_UNIQUE_SECTIONS
);
export const UPGRADE_WHEEL_SECTIONS = withSecondOutcomeCopies(
  UPGRADE_WHEEL_UNIQUE_SECTIONS
);

/** All unique sections across both wheels (for forced-outcome pickers / lookup). */
export const ALL_BONUS_WHEEL_SECTIONS: BonusWheelSection[] = [
  ...BONUS_WHEEL_UNIQUE_SECTIONS,
  ...UPGRADE_WHEEL_UNIQUE_SECTIONS,
];

/** Longer spin so the wheel spends more time decelerating into the result. */
export const BONUS_WHEEL_SPIN_MS = 8500;
export const BONUS_WHEEL_MIN_TURNS = 8;
export const BONUS_WHEEL_MAX_TURNS = 11;
/**
 * Ease-out with a long visible crawl: progress stays below ~80% until late
 * in the spin so the final wedges keep ticking by.
 */
export const BONUS_WHEEL_SPIN_EASING = 'cubic-bezier(0.18, 0.5, 0.08, 1)';

export function getBonusWheelSliceDegrees(
  sectionCount = BONUS_WHEEL_SECTIONS.length
): number {
  return 360 / Math.max(sectionCount, 1);
}

export function pickBonusWheelSectionIndex(
  sections: BonusWheelSection[] = BONUS_WHEEL_SECTIONS
): number {
  const weights = sections.map((section) => Math.max(0, section.weight ?? 1));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  if (totalWeight <= 0) {
    return Math.floor(Math.random() * sections.length);
  }

  let roll = Math.random() * totalWeight;

  for (let index = 0; index < weights.length; index++) {
    roll -= weights[index];

    if (roll <= 0) {
      return index;
    }
  }

  return sections.length - 1;
}

/**
 * Wheel is drawn with section 0 starting at the top, continuing clockwise.
 * A fixed pointer at the top selects the wedge under it after rotation.
 * Returns the absolute CSS rotation (degrees) that lands sectionIndex under the pointer.
 */
export function getBonusWheelLandingRotation(
  sectionIndex: number,
  sectionCount: number,
  currentRotation = 0
): number {
  const slice = getBonusWheelSliceDegrees(sectionCount);
  const sectionCenterFromTop = sectionIndex * slice + slice / 2;
  const turns =
    BONUS_WHEEL_MIN_TURNS +
    Math.floor(
      Math.random() * (BONUS_WHEEL_MAX_TURNS - BONUS_WHEEL_MIN_TURNS + 1)
    );

  // Rotate clockwise so the section center ends under the top pointer.
  const targetModulo = (360 - sectionCenterFromTop + 360) % 360;
  const normalizedCurrent = ((currentRotation % 360) + 360) % 360;
  let delta = (targetModulo - normalizedCurrent + 360) % 360;

  if (delta < 1) {
    delta += 360;
  }

  return currentRotation + turns * 360 + delta;
}

export function getBonusWheelSectionById(
  sectionId: string,
  sections: BonusWheelSection[] = ALL_BONUS_WHEEL_SECTIONS
): BonusWheelSection | undefined {
  return sections.find((section) => section.id === sectionId);
}

/** Copy wheel wedges and tag Mini / Minor with ` x 2`…` x 5` at higher bets. */
export function labelJackpotWheelSections(
  sections: BonusWheelSection[],
  betTier = 1
): BonusWheelSection[] {
  return sections.map((section) => {
    if (section.outcome.type !== 'jackpot') {
      return section;
    }

    return {
      ...section,
      label: formatJackpotShortLabel(section.outcome.jackpot, betTier),
    };
  });
}

export function describeBonusWheelOutcome(
  outcome: BonusWheelOutcome,
  betTier = 1
): string {
  if (outcome.type === 'upgrade') {
    return 'Upgrade';
  }

  if (outcome.type === 'jackpot') {
    return describeJackpot(outcome.jackpot, betTier);
  }

  if (outcome.type === 'buzzSaw') {
    return 'Buzz Saw';
  }

  if (outcome.type === 'superBuzzSaw') {
    return 'Super Buzz Saw';
  }

  if (outcome.type === 'powerSaw') {
    return 'Power-Saw';
  }

  if (outcome.type === 'superPowerSaw') {
    return 'Super Power Saw';
  }

  if (outcome.type === 'megaHat') {
    return 'Mega Hat';
  }

  if (outcome.type === 'superHat') {
    return 'Super Hat';
  }

  if (outcome.type === 'ultraHat') {
    return 'Ultra Hat';
  }

  if (outcome.type === 'mansions') {
    return 'Mansions';
  }

  return `${outcome.count} Free Games`;
}

/**
 * Resolve a final (non-upgrade) wheel section: pick the main wheel, and if it
 * lands on Upgrade, pick from the upgrade wheel.
 */
export function resolveBonusWheelSection(
  forcedSectionId?: string | null
): BonusWheelSection {
  if (forcedSectionId) {
    const forced = getBonusWheelSectionById(forcedSectionId);

    if (forced && forced.outcome.type !== 'upgrade') {
      return forced;
    }

    if (forced?.outcome.type === 'upgrade') {
      const upgradeIndex = pickBonusWheelSectionIndex(
        UPGRADE_WHEEL_UNIQUE_SECTIONS
      );
      return UPGRADE_WHEEL_UNIQUE_SECTIONS[upgradeIndex];
    }
  }

  const mainIndex = pickBonusWheelSectionIndex(BONUS_WHEEL_UNIQUE_SECTIONS);
  const main = BONUS_WHEEL_UNIQUE_SECTIONS[mainIndex];

  if (main.outcome.type !== 'upgrade') {
    return main;
  }

  const upgradeIndex = pickBonusWheelSectionIndex(UPGRADE_WHEEL_UNIQUE_SECTIONS);
  return UPGRADE_WHEEL_UNIQUE_SECTIONS[upgradeIndex];
}
