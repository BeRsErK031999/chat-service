import type { ChatWidgetContext, Message, PresenceState, RoomListItem } from '../types';

export const formatTime = (value: string | null): string => {
  if (value === null) {
    return '';
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

export const getRoomLabel = (room: RoomListItem): string =>
  room.name ?? room.taskId ?? `${room.type.toLowerCase()} room`;

export const isTaskRoom = (room: RoomListItem): boolean =>
  room.type === 'TASK' || room.taskId !== null || room.taskRoomKind !== null;

export const formatRoomTypeLabel = (room: RoomListItem): string => {
  if (isTaskRoom(room)) {
    return 'Task discussion';
  }

  if (room.type === 'DIRECT') {
    return 'Direct';
  }

  if (room.type === 'GROUP') {
    return 'Group';
  }

  if (room.type === 'SYSTEM') {
    return 'System';
  }

  return 'Room';
};

export const formatRoomScopeLabel = (value: string | null | undefined): string | null => {
  if (value === undefined || value === null || value.trim().length === 0) {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === 'system-events') {
    return 'System events';
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

export const getRoomScopeLabel = (
  room: RoomListItem,
  context?: ChatWidgetContext,
): string | null => {
  if (room.taskRoomKind !== null) {
    return formatRoomScopeLabel(room.taskRoomKind);
  }

  if (isTaskRoom(room) && context?.taskId !== undefined && context.taskId === room.taskId) {
    return formatRoomScopeLabel(context.roomScope);
  }

  return null;
};

export const getTaskReferenceLabel = (room: RoomListItem): string | null => {
  if (!isTaskRoom(room)) {
    return null;
  }

  return room.taskId ?? room.projectId ?? null;
};

export const formatPresenceLastSeen = (value: string | null | undefined): string => {
  if (value === undefined || value === null) {
    return 'Last seen unknown';
  }

  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return 'Last seen unknown';
  }

  const elapsedMs = Date.now() - timestamp;
  const elapsedMinutes = Math.max(0, Math.floor(elapsedMs / 60_000));

  if (elapsedMinutes < 1) {
    return 'Last seen just now';
  }

  if (elapsedMinutes < 60) {
    return `Last seen ${elapsedMinutes}m ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);

  if (elapsedHours < 24) {
    return `Last seen ${elapsedHours}h ago`;
  }

  return `Last seen ${new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))}`;
};

export const getPresenceLabel = (presence: PresenceState | undefined): string => {
  if (presence?.status === 'online') {
    return 'Online';
  }

  return formatPresenceLastSeen(presence?.lastSeenAt);
};

export const getPreview = (message: Message | null): string => {
  if (message === null) {
    return 'No messages yet';
  }

  if (message.type === 'SYSTEM_EVENT') {
    return message.eventType ?? 'System event';
  }

  return message.body ?? '';
};
