import type {
  ChatWidgetNavigationTarget,
  NormalizedChatWidgetNavigationTarget,
} from './types.js';
import {
  CANONICAL_NAVIGATION_TARGET_PREFIX,
  normalizeNavigationTarget,
  parseNavigationTarget,
  serializeCanonicalNavigationTarget,
} from './navigation.js';

export const NAVIGATION_CONTINUITY_STORAGE_KEY = 'truebim.chat.navigationTarget.v1';
export const DEFAULT_NAVIGATION_TARGET_CONTINUITY_TTL_MS = 24 * 60 * 60 * 1000;

type StoredNavigationTarget = {
  target: string;
  rememberedAt: string;
};

export type RememberedNavigationTargetStatus =
  | 'empty'
  | 'restored'
  | 'skipped'
  | 'failed';

export type RememberedNavigationTargetResult = {
  status: RememberedNavigationTargetStatus;
  target: NormalizedChatWidgetNavigationTarget | null;
};

let memoryStoredNavigationTarget: string | null = null;

const getSessionStorage = (): Storage | null => {
  try {
    const candidate = globalThis as typeof globalThis & { sessionStorage?: Storage };
    return candidate.sessionStorage ?? null;
  } catch {
    return null;
  }
};

const getStoredValue = (): string | null => {
  const storage = getSessionStorage();

  if (storage === null) {
    return memoryStoredNavigationTarget;
  }

  try {
    return storage.getItem(NAVIGATION_CONTINUITY_STORAGE_KEY) ?? memoryStoredNavigationTarget;
  } catch {
    return memoryStoredNavigationTarget;
  }
};

const setStoredValue = (value: string): void => {
  memoryStoredNavigationTarget = value;
  const storage = getSessionStorage();

  if (storage === null) {
    return;
  }

  try {
    storage.setItem(NAVIGATION_CONTINUITY_STORAGE_KEY, value);
  } catch {
    // Memory fallback above keeps continuity available when storage is blocked.
  }
};

const removeStoredValue = (): void => {
  memoryStoredNavigationTarget = null;
  const storage = getSessionStorage();

  if (storage === null) {
    return;
  }

  try {
    storage.removeItem(NAVIGATION_CONTINUITY_STORAGE_KEY);
  } catch {
    // Clearing memory is enough for storage-unavailable environments.
  }
};

const parseStoredNavigationTarget = (value: string | null): StoredNavigationTarget | null => {
  if (value === null) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);

    if (parsed === null || typeof parsed !== 'object') {
      return null;
    }

    const record = parsed as Partial<StoredNavigationTarget>;

    if (typeof record.target !== 'string' || typeof record.rememberedAt !== 'string') {
      return null;
    }

    return {
      target: record.target,
      rememberedAt: record.rememberedAt,
    };
  } catch {
    return null;
  }
};

const isFreshRememberedAt = (rememberedAt: string, maxAgeMs: number, now: number): boolean => {
  const rememberedTime = Date.parse(rememberedAt);

  if (!Number.isFinite(rememberedTime)) {
    return false;
  }

  return now - rememberedTime <= maxAgeMs;
};

export const restoreNavigationTargetFromCanonical = (
  value: string | null | undefined,
): NormalizedChatWidgetNavigationTarget | null => {
  if (value === null || value === undefined || !value.startsWith(CANONICAL_NAVIGATION_TARGET_PREFIX)) {
    return null;
  }

  return parseNavigationTarget(value);
};

export const rememberNavigationTarget = (
  target: ChatWidgetNavigationTarget | null | undefined,
  rememberedAt = new Date(),
): NormalizedChatWidgetNavigationTarget | null => {
  const normalized = normalizeNavigationTarget(target);

  if (normalized === null) {
    clearRememberedNavigationTarget();
    return null;
  }

  const canonicalTarget = serializeCanonicalNavigationTarget(normalized);

  if (canonicalTarget.length === 0) {
    clearRememberedNavigationTarget();
    return null;
  }

  setStoredValue(
    JSON.stringify({
      target: canonicalTarget,
      rememberedAt: rememberedAt.toISOString(),
    } satisfies StoredNavigationTarget),
  );

  return restoreNavigationTargetFromCanonical(canonicalTarget);
};

export const getRememberedNavigationTarget = (
  options: { maxAgeMs?: number; now?: Date } = {},
): NormalizedChatWidgetNavigationTarget | null => {
  return getRememberedNavigationTargetResult(options).target;
};

export const getRememberedNavigationTargetResult = (
  options: { maxAgeMs?: number; now?: Date } = {},
): RememberedNavigationTargetResult => {
  const rawValue = getStoredValue();

  if (rawValue === null) {
    return {
      status: 'empty',
      target: null,
    };
  }

  const stored = parseStoredNavigationTarget(rawValue);

  if (stored === null) {
    return {
      status: 'failed',
      target: null,
    };
  }

  const maxAgeMs = options.maxAgeMs ?? DEFAULT_NAVIGATION_TARGET_CONTINUITY_TTL_MS;
  const now = options.now?.getTime() ?? Date.now();

  if (!isFreshRememberedAt(stored.rememberedAt, maxAgeMs, now)) {
    return {
      status: 'skipped',
      target: null,
    };
  }

  const target = restoreNavigationTargetFromCanonical(stored.target);

  return {
    status: target === null ? 'failed' : 'restored',
    target,
  };
};

export const clearRememberedNavigationTarget = (): void => {
  removeStoredValue();
};
