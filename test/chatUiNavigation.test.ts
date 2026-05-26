import { describe, expect, it } from 'vitest';

import {
  navigationTargetFromNotification,
  normalizeNavigationTarget,
  parseNavigationTarget,
  serializeNavigationTarget,
} from '../frontend/src/chat-ui/navigation.js';
import type { Notification } from '../frontend/src/chat-ui/types.js';

describe('chat UI navigation targets', () => {
  it('normalizes empty and whitespace-only targets to null', () => {
    expect(normalizeNavigationTarget(undefined)).toBeNull();
    expect(normalizeNavigationTarget({ roomId: ' ', messageId: '', taskId: '' })).toBeNull();
  });

  it('keeps room, message, task, and source addressing without unknown fields', () => {
    expect(
      normalizeNavigationTarget({
        id: 'notification-1',
        roomId: ' room-1 ',
        messageId: 'message-1',
        taskId: 'task-1',
        source: 'notification',
      }),
    ).toEqual({
      id: 'notification-1',
      roomId: 'room-1',
      messageId: 'message-1',
      taskId: 'task-1',
      source: 'notification',
    });
  });

  it('serializes and parses stable query semantics for future hosts', () => {
    const serialized = serializeNavigationTarget({
      roomId: 'room-1',
      messageId: 'message-1',
      taskId: 'task-1',
      source: 'activity',
    });

    expect(serialized).toBe('roomId=room-1&messageId=message-1&taskId=task-1&source=activity');
    expect(parseNavigationTarget(`?${serialized}`)).toEqual({
      id: 'activity:room-1:message-1:task-1',
      roomId: 'room-1',
      messageId: 'message-1',
      taskId: 'task-1',
      source: 'activity',
    });
  });

  it('builds notification routing targets with safe fallback when no room is present', () => {
    const notification: Notification = {
      id: 'notification-1',
      userId: 'user-1',
      roomId: null,
      messageId: 'message-1',
      type: 'MESSAGE',
      title: 'title',
      body: 'body',
      priority: 'NORMAL',
      deliveryState: 'PENDING',
      readAt: null,
      deliveredAt: null,
      createdAt: '2026-05-26T00:00:00.000Z',
      updatedAt: '2026-05-26T00:00:00.000Z',
    };

    expect(navigationTargetFromNotification(notification)).toEqual({
      id: 'notification-1',
      messageId: 'message-1',
      source: 'notification',
    });
  });
});
