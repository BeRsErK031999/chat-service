import type { Message, RoomListItem } from '../types';

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

export const getPreview = (message: Message | null): string => {
  if (message === null) {
    return 'No messages yet';
  }

  if (message.type === 'SYSTEM_EVENT') {
    return message.eventType ?? 'System event';
  }

  return message.body ?? '';
};
