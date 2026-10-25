import { normalizeBetSelection, pickAffordableMultiplier } from '../game/bets';
import { roundMoney } from '../game/money';
import type { HatBonusState } from '../game/hatBonus';
import type { ProgressiveJackpotPool } from '../game/progressiveJackpots';
import {
  parsePersistedSlotState,
  type FreeSpinSessionState,
  type PersistedSlotState,
} from './persistedSlotState';

const STORAGE_KEY = 'construction-slots-state';

export interface GameState extends PersistedSlotState {
  spinning: boolean;
}

function readJson(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function persist(state: PersistedSlotState) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        balance: state.balance,
        denomination: state.denomination,
        betMultiplier: state.betMultiplier,
        bet: state.bet,
        freeSpinsRemaining: state.freeSpinsRemaining,
        progressiveJackpots: state.progressiveJackpots,
        hatBonus: state.hatBonus,
        hatBonusSessionWon: state.hatBonusSessionWon,
        freeSpinSession: state.freeSpinSession,
      })
    );
  } catch {
    // Private browsing / quota.
  }
}

const loaded = parsePersistedSlotState(readJson());

export const state: GameState = {
  ...loaded,
  spinning: false,
};

function save() {
  persist(state);
}

export function setBalance(value: number | ((prev: number) => number)) {
  state.balance = roundMoney(
    typeof value === 'function' ? value(state.balance) : value
  );
  save();
}

export function setDenomination(value: number) {
  const multiplier = pickAffordableMultiplier(
    value,
    state.betMultiplier,
    state.balance
  );
  Object.assign(state, normalizeBetSelection(value, multiplier));
  save();
}

export function setBetMultiplier(value: number) {
  Object.assign(state, normalizeBetSelection(state.denomination, value));
  save();
}

export function setSpinning(value: boolean) {
  state.spinning = value;
}

export function consumeFreeSpin() {
  state.freeSpinsRemaining = Math.max(0, state.freeSpinsRemaining - 1);
  save();
}

export function addFreeSpins(count: number) {
  state.freeSpinsRemaining += count;
  save();
}

export function setProgressiveJackpots(pool: ProgressiveJackpotPool) {
  state.progressiveJackpots = pool;
  save();
}

export function setHatBonus(hatBonus: HatBonusState | null) {
  state.hatBonus = hatBonus;
  if (!hatBonus) {
    state.hatBonusSessionWon = 0;
  }
  save();
}

export function addHatBonusSessionWon(amount: number) {
  if (amount === 0) {
    return;
  }
  state.hatBonusSessionWon = Math.max(0, state.hatBonusSessionWon + amount);
  save();
}

export function setFreeSpinSession(session: FreeSpinSessionState) {
  state.freeSpinSession = session;
  save();
}
