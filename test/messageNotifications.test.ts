import { MessageType, NotificationDeliveryState, NotificationPriority } from '@prisma/client';
import type { Message, Notification, Prisma, PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { createMessageNotifications } from '../src/modules/notifications/notificationService.js';

const senderUserId = '11111111-1111-4111-8111-111111111111';
const recipientUserId = '22222222-2222-4222-8222-222222222222';
const secondRecipientUserId = '33333333-3333-4333-8333-333333333333';
const roomId = '44444444-4444-4444-8444-444444444444';
const messageId = '55555555-5555-4555-8555-555555555555';
const now = new Date('2026-05-13T00:00:00.000Z');

const message: Message = {
  id: messageId,
  roomId,
  senderUserId,
  type: MessageType.TEXT,
  body: 'Hello   from sender',
  eventType: null,
  eventPayload: {},
  sourceEventId: null,
  sequence: 1,
  createdAt: now,
  updatedAt: now,
};

const buildNotification = (
  userId: string,
  sourceEventId: string,
  payload: Prisma.JsonValue,
): Notification => ({
  id: `notification-${userId}`,
  userId,
  roomId,
  messageId,
  type: 'message',
  title: 'New message',
  body: 'Hello from sender',
  priority: NotificationPriority.NORMAL,
  payload,
  deliveryState: NotificationDeliveryState.PENDING,
  readAt: null,
  deliveredAt: null,
  sourceEventId,
  createdAt: now,
  updatedAt: now,
});

describe('createMessageNotifications', () => {
  it('creates unread notifications for active room members except the sender', async () => {
    const createdNotifications: Notification[] = [];
    let findManyArgs: Prisma.RoomMemberFindManyArgs | undefined;

    const prisma = {
      roomMember: {
        findMany: (args: Prisma.RoomMemberFindManyArgs) => {
          findManyArgs = args;
          return Promise.resolve([{ userId: recipientUserId }, { userId: secondRecipientUserId }]);
        },
      },
      notification: {
        findFirst: () => Promise.resolve(null),
        create: (args: Prisma.NotificationCreateArgs) => {
          const data = args.data as Prisma.NotificationUncheckedCreateInput;
          const notification = buildNotification(
            data.userId,
            data.sourceEventId ?? '',
            data.payload as Prisma.JsonValue,
          );
          createdNotifications.push(notification);
          return Promise.resolve(notification);
        },
      },
    } as unknown as PrismaClient;

    const notifications = await createMessageNotifications(prisma, message);

    expect(findManyArgs).toMatchObject({
      where: {
        roomId,
        leftAt: null,
        userId: {
          not: senderUserId,
        },
      },
      select: {
        userId: true,
      },
    });
    expect(notifications).toHaveLength(2);
    expect(createdNotifications.map((notification) => notification.userId)).toEqual([
      recipientUserId,
      secondRecipientUserId,
    ]);
    expect(createdNotifications.every((notification) => notification.readAt === null)).toBe(true);
    expect(createdNotifications[0]).toMatchObject({
      roomId,
      messageId,
      type: 'message',
      body: 'Hello from sender',
      deliveryState: NotificationDeliveryState.PENDING,
      payload: {
        roomId,
        messageId,
        senderId: senderUserId,
        messageKind: MessageType.TEXT,
        preview: 'Hello from sender',
      },
    });
  });

  it('reuses an existing notification for the same message recipient source event', async () => {
    const sourceEventId = `message:${messageId}:user:${recipientUserId}`;
    const existingNotification = buildNotification(recipientUserId, sourceEventId, {});
    let createCallCount = 0;

    const prisma = {
      roomMember: {
        findMany: () => Promise.resolve([{ userId: recipientUserId }]),
      },
      notification: {
        findFirst: () => Promise.resolve(existingNotification),
        create: () => {
          createCallCount += 1;
          return Promise.resolve(existingNotification);
        },
      },
    } as unknown as PrismaClient;

    const notifications = await createMessageNotifications(prisma, message);

    expect(notifications).toEqual([existingNotification]);
    expect(createCallCount).toBe(0);
  });
});
