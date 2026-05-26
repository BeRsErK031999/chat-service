import type {
  ChatWidgetNavigationSource,
  ChatWidgetNavigationTarget,
  NormalizedChatWidgetNavigationTarget,
  Notification,
  RoomListItem,
} from './types.js';

const navigationSources = new Set<ChatWidgetNavigationSource>([
  'notification',
  'task',
  'activity',
]);

const cleanString = (value: string | null | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
};

const cleanSource = (value: string | null | undefined): ChatWidgetNavigationSource | undefined =>
  value !== undefined && value !== null && navigationSources.has(value as ChatWidgetNavigationSource)
    ? (value as ChatWidgetNavigationSource)
    : undefined;

const createNavigationTargetId = (target: Omit<NormalizedChatWidgetNavigationTarget, 'id'>): string =>
  [
    target.source ?? 'chat',
    target.roomId ?? '',
    target.messageId ?? '',
    target.taskId ?? '',
  ].join(':');

export const normalizeNavigationTarget = (
  target: ChatWidgetNavigationTarget | null | undefined,
): NormalizedChatWidgetNavigationTarget | null => {
  const roomId = cleanString(target?.roomId);
  const messageId = cleanString(target?.messageId);
  const taskId = cleanString(target?.taskId);
  const source = cleanSource(target?.source);

  if (roomId === undefined && messageId === undefined && taskId === undefined) {
    return null;
  }

  const withoutId = {
    ...(roomId !== undefined ? { roomId } : {}),
    ...(messageId !== undefined ? { messageId } : {}),
    ...(taskId !== undefined ? { taskId } : {}),
    ...(source !== undefined ? { source } : {}),
  };
  const id = cleanString(target?.id) ?? createNavigationTargetId(withoutId);

  return {
    id,
    ...withoutId,
  };
};

export const serializeNavigationTarget = (
  target: ChatWidgetNavigationTarget | null | undefined,
): string => {
  const normalized = normalizeNavigationTarget(target);

  if (normalized === null) {
    return '';
  }

  const params = new URLSearchParams();

  if (normalized.roomId !== undefined) {
    params.set('roomId', normalized.roomId);
  }

  if (normalized.messageId !== undefined) {
    params.set('messageId', normalized.messageId);
  }

  if (normalized.taskId !== undefined) {
    params.set('taskId', normalized.taskId);
  }

  if (normalized.source !== undefined) {
    params.set('source', normalized.source);
  }

  return params.toString();
};

export const parseNavigationTarget = (
  value: string | URLSearchParams | null | undefined,
): NormalizedChatWidgetNavigationTarget | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const params =
    typeof value === 'string'
      ? new URLSearchParams(value.startsWith('?') ? value.slice(1) : value)
      : value;

  const source = cleanSource(params.get('source'));
  const roomId = params.get('roomId') ?? undefined;
  const messageId = params.get('messageId') ?? undefined;
  const taskId = params.get('taskId') ?? undefined;

  return normalizeNavigationTarget({
    ...(roomId !== undefined ? { roomId } : {}),
    ...(messageId !== undefined ? { messageId } : {}),
    ...(taskId !== undefined ? { taskId } : {}),
    ...(source !== undefined ? { source } : {}),
  });
};

export const navigationTargetFromNotification = (
  notification: Notification,
): NormalizedChatWidgetNavigationTarget | null =>
  normalizeNavigationTarget({
    id: notification.id,
    ...(notification.roomId !== null ? { roomId: notification.roomId } : {}),
    ...(notification.messageId !== null ? { messageId: notification.messageId } : {}),
    source: 'notification',
  });

export const navigationTargetFromRoom = (
  room: RoomListItem,
  source: ChatWidgetNavigationSource = 'activity',
): NormalizedChatWidgetNavigationTarget =>
  normalizeNavigationTarget({
    roomId: room.id,
    ...(room.taskId !== null ? { taskId: room.taskId } : {}),
    source,
  }) as NormalizedChatWidgetNavigationTarget;
