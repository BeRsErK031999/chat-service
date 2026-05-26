import { navigationTargetFromNotification, navigationTargetFromRoom } from './navigation.js';
import type {
  ChatActivityAttentionState,
  ChatActivityItem,
  ChatWidgetNavigationSource,
  Notification,
  RoomListItem,
} from './types.js';

export type BuildChatActivityItemsInput = {
  rooms: readonly RoomListItem[];
  notifications: readonly Notification[];
  limit?: number;
};

export type ChatActivitySections = {
  needsAttention: ChatActivityItem[];
  recentActivity: ChatActivityItem[];
};

const getTimeValue = (timestamp: string | null): number => {
  if (timestamp === null) {
    return 0;
  }

  const value = new Date(timestamp).getTime();
  return Number.isNaN(value) ? 0 : value;
};

const getRoomActivityTimestamp = (room: RoomListItem): string =>
  room.lastMessageAt ?? room.lastMessage?.createdAt ?? new Date(0).toISOString();

const getRoomTitle = (room: RoomListItem): string =>
  room.name ?? room.taskId ?? room.projectId ?? `${room.type.toLowerCase()} room`;

const getRoomSummary = (room: RoomListItem): string | undefined => {
  if (room.lastMessage?.body !== null && room.lastMessage?.body !== undefined) {
    return room.lastMessage.body;
  }

  if (room.taskId !== null) {
    return `Task ${room.taskId}`;
  }

  return undefined;
};

const buildRoomActivityItem = (
  room: RoomListItem,
  source: ChatWidgetNavigationSource,
): ChatActivityItem => {
  const target = navigationTargetFromRoom(room, source);
  const attentionState: ChatActivityAttentionState =
    room.unreadCount > 0 ? 'attention-needed' : 'recent';
  const summary = getRoomSummary(room);

  return {
    id: `room:${room.id}`,
    kind: room.unreadCount > 0 ? 'unread-room' : 'recent-room',
    attentionState,
    target,
    roomId: room.id,
    ...(room.taskId !== null ? { taskId: room.taskId } : {}),
    title: getRoomTitle(room),
    ...(summary !== undefined ? { summary } : {}),
    occurredAt: getRoomActivityTimestamp(room),
    unreadCount: room.unreadCount,
  };
};

export const activityItemFromNotification = (
  notification: Notification,
): ChatActivityItem | null => {
  const target = navigationTargetFromNotification(notification);

  if (target === null) {
    return null;
  }

  return {
    id: `notification:${notification.id}`,
    kind: 'notification',
    attentionState: notification.readAt === null ? 'attention-needed' : 'read',
    target,
    notificationId: notification.id,
    ...(notification.roomId !== null ? { roomId: notification.roomId } : {}),
    ...(notification.messageId !== null ? { messageId: notification.messageId } : {}),
    title: notification.title,
    summary: notification.body,
    occurredAt: notification.createdAt,
    priority: notification.priority,
  };
};

export const activityItemFromRoom = (room: RoomListItem): ChatActivityItem =>
  buildRoomActivityItem(room, 'activity');

export const buildChatActivityItems = ({
  rooms,
  notifications,
  limit = 20,
}: BuildChatActivityItemsInput): ChatActivityItem[] => {
  const items = [
    ...notifications
      .map(activityItemFromNotification)
      .filter((item): item is ChatActivityItem => item !== null),
    ...rooms
      .filter((room) => room.unreadCount > 0 || room.lastMessageAt !== null || room.lastMessage !== null)
      .map(activityItemFromRoom),
  ];

  return items
    .sort((left, right) => {
      const attentionDelta =
        Number(right.attentionState === 'attention-needed') -
        Number(left.attentionState === 'attention-needed');

      if (attentionDelta !== 0) {
        return attentionDelta;
      }

      return getTimeValue(right.occurredAt) - getTimeValue(left.occurredAt);
    })
    .slice(0, Math.max(0, limit));
};

export const splitChatActivityItems = (
  items: readonly ChatActivityItem[],
): ChatActivitySections => ({
  needsAttention: items.filter((item) => item.attentionState === 'attention-needed'),
  recentActivity: items.filter((item) => item.attentionState !== 'attention-needed'),
});
