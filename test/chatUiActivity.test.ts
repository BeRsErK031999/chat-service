import { describe, expect, it } from 'vitest';

import {
  activityItemFromNotification,
  activityItemFromRoom,
  buildChatActivityItems,
  splitChatActivityItems,
} from '../frontend/src/chat-ui/activity.js';
import type { Message, Notification, RoomListItem } from '../frontend/src/chat-ui/types.js';

const message: Message = {
  id: 'message-1',
  roomId: 'room-1',
  senderUserId: 'user-1',
  type: 'TEXT',
  body: 'Latest room message',
  eventType: null,
  eventPayload: {},
  sourceEventId: null,
  sequence: 1,
  createdAt: '2026-05-26T10:00:00.000Z',
  updatedAt: '2026-05-26T10:00:00.000Z',
};

const room: RoomListItem = {
  id: 'room-1',
  type: 'TASK',
  name: 'Task room',
  description: null,
  taskId: 'task-1',
  projectId: 'project-1',
  taskRoomKind: 'internal',
  lastMessageAt: '2026-05-26T10:00:00.000Z',
  lastMessage: message,
  unreadCount: 2,
};

const notification: Notification = {
  id: 'notification-1',
  userId: 'user-2',
  roomId: 'room-1',
  messageId: 'message-1',
  type: 'MESSAGE',
  title: 'New reply',
  body: 'Reply preview',
  priority: 'HIGH',
  deliveryState: 'PENDING',
  readAt: null,
  deliveredAt: null,
  createdAt: '2026-05-26T11:00:00.000Z',
  updatedAt: '2026-05-26T11:00:00.000Z',
};

describe('chat UI activity items', () => {
  it('creates task-centric activity references from rooms', () => {
    expect(activityItemFromRoom(room)).toEqual({
      id: 'room:room-1',
      kind: 'unread-room',
      attentionState: 'attention-needed',
      target: {
        id: 'activity:room-1::task-1',
        roomId: 'room-1',
        taskId: 'task-1',
        source: 'activity',
      },
      roomId: 'room-1',
      taskId: 'task-1',
      title: 'Task room',
      summary: 'Latest room message',
      occurredAt: '2026-05-26T10:00:00.000Z',
      unreadCount: 2,
    });
  });

  it('creates attention-needed entries from unread notifications', () => {
    expect(activityItemFromNotification(notification)).toEqual({
      id: 'notification:notification-1',
      kind: 'notification',
      attentionState: 'attention-needed',
      target: {
        id: 'notification-1',
        roomId: 'room-1',
        messageId: 'message-1',
        source: 'notification',
      },
      notificationId: 'notification-1',
      roomId: 'room-1',
      messageId: 'message-1',
      title: 'New reply',
      summary: 'Reply preview',
      occurredAt: '2026-05-26T11:00:00.000Z',
      priority: 'HIGH',
    });
  });

  it('orders attention entries before ordinary recent activity', () => {
    const readNotification = {
      ...notification,
      id: 'notification-2',
      readAt: '2026-05-26T11:30:00.000Z',
      createdAt: '2026-05-26T12:00:00.000Z',
    };
    const recentRoom = {
      ...room,
      id: 'room-2',
      taskId: null,
      unreadCount: 0,
      lastMessageAt: '2026-05-26T13:00:00.000Z',
    };

    expect(
      buildChatActivityItems({
        rooms: [recentRoom, room],
        notifications: [readNotification],
      }).map((item) => item.id),
    ).toEqual(['room:room-1', 'room:room-2', 'notification:notification-2']);
  });

  it('splits activity into attention and recent UI sections', () => {
    const readNotification = {
      ...notification,
      id: 'notification-2',
      readAt: '2026-05-26T11:30:00.000Z',
    };
    const items = buildChatActivityItems({
      rooms: [room],
      notifications: [readNotification],
    });

    expect(splitChatActivityItems(items)).toEqual({
      needsAttention: [expect.objectContaining({ id: 'room:room-1' })],
      recentActivity: [expect.objectContaining({ id: 'notification:notification-2' })],
    });
  });
});
