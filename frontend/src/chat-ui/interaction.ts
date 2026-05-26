import type { ChatInteractionHint, ChatInteractionKind } from './types.js';

export const DEFAULT_INTERACTION_HINT_STALE_MS = 10_000;
export const DEFAULT_INTERACTION_HINT_DEBOUNCE_MS = 3_000;

export type ChatInteractionHintInput = {
  kind: ChatInteractionKind;
  roomId: string | null | undefined;
  userId: string | null | undefined;
  occurredAt?: string | null;
  expiresAt?: string | null;
  debounceMs?: number | null;
  staleAfterMs?: number | null;
  taskId?: string | null;
  messageId?: string | null;
};

const cleanString = (value: string | null | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
};

const cleanPositiveNumber = (value: number | null | undefined, fallback: number): number =>
  value !== undefined && value !== null && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : fallback;

const getTimeValue = (timestamp: string): number => {
  const value = new Date(timestamp).getTime();
  return Number.isNaN(value) ? 0 : value;
};

export const createInteractionHintId = (
  kind: ChatInteractionKind,
  roomId: string,
  userId: string,
): string => `${kind}:${roomId}:${userId}`;

export const normalizeInteractionHint = (
  input: ChatInteractionHintInput,
  now: Date = new Date(),
): ChatInteractionHint | null => {
  const roomId = cleanString(input.roomId);
  const userId = cleanString(input.userId);

  if (roomId === undefined || userId === undefined) {
    return null;
  }

  const occurredAt = cleanString(input.occurredAt) ?? now.toISOString();
  const staleAfterMs = cleanPositiveNumber(
    input.staleAfterMs,
    DEFAULT_INTERACTION_HINT_STALE_MS,
  );
  const debounceMs = cleanPositiveNumber(
    input.debounceMs,
    DEFAULT_INTERACTION_HINT_DEBOUNCE_MS,
  );
  const expiresAt =
    cleanString(input.expiresAt) ??
    new Date(getTimeValue(occurredAt) + staleAfterMs).toISOString();
  const taskId = cleanString(input.taskId);
  const messageId = cleanString(input.messageId);

  return {
    id: createInteractionHintId(input.kind, roomId, userId),
    kind: input.kind,
    roomId,
    userId,
    occurredAt,
    expiresAt,
    debounceMs,
    staleAfterMs,
    ...(taskId !== undefined ? { taskId } : {}),
    ...(messageId !== undefined ? { messageId } : {}),
  };
};

export const pruneStaleInteractionHints = (
  hints: readonly ChatInteractionHint[],
  now: Date = new Date(),
): ChatInteractionHint[] => {
  const nowValue = now.getTime();

  return hints.filter((hint) => getTimeValue(hint.expiresAt) > nowValue);
};

export const shouldEmitInteractionHint = (
  previous: ChatInteractionHint | null | undefined,
  next: ChatInteractionHint,
): boolean => {
  if (previous === null || previous === undefined) {
    return true;
  }

  if (
    previous.kind !== next.kind ||
    previous.roomId !== next.roomId ||
    previous.userId !== next.userId ||
    previous.taskId !== next.taskId ||
    previous.messageId !== next.messageId
  ) {
    return true;
  }

  return getTimeValue(next.occurredAt) - getTimeValue(previous.occurredAt) >= next.debounceMs;
};
