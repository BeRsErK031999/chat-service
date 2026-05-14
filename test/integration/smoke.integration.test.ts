import {
  MessageType,
  AuthSource,
  NotificationDeliveryState,
  NotificationLevel,
  NotificationPriority,
  RoomMemberRole,
  RoomMemberSource,
  RoomType,
  RoomVisibility,
  UserStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createMessage } from '../../src/modules/messages/messageService.js';
import { createNotification, markNotificationRead } from '../../src/modules/notifications/notificationService.js';
import { markRoomRead } from '../../src/modules/read-states/readStateService.js';
import { addRoomMember, createRoom } from '../../src/modules/rooms/roomService.js';
import { createUser } from '../../src/modules/users/userService.js';
import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/persistence/prismaClient.js';

type NotificationResponse = {
  userId: string;
  roomId: string | null;
  messageId: string | null;
  readAt: string | null;
  payload: unknown;
};

describe('integration smoke flow', () => {
  const unique = randomUUID();
  const createdUserIds: string[] = [];
  const createdRoomIds: string[] = [];

  const createIntegrationUser = async (name: string) => {
    const user = await createUser(prisma, {
      externalUserId: `integration-${name}-${randomUUID()}`,
      email: `integration-${name}-${randomUUID()}@example.test`,
      displayName: `Integration ${name}`,
      role: 'user',
      status: UserStatus.ACTIVE,
      authSource: AuthSource.STANDALONE,
    });
    createdUserIds.push(user.id);
    return user;
  };

  const addStandaloneMember = async (roomId: string, userId: string) =>
    addRoomMember(prisma, {
      roomId,
      userId,
      role: RoomMemberRole.MEMBER,
      source: RoomMemberSource.STANDALONE,
      notificationLevel: NotificationLevel.ALL,
    });

  beforeAll(() => {
    if (process.env.DATABASE_URL === undefined) {
      throw new Error('DATABASE_URL is required for integration tests.');
    }
  });

  afterAll(async () => {
    if (createdRoomIds.length > 0) {
      await prisma.room.deleteMany({
        where: {
          id: {
            in: createdRoomIds,
          },
        },
      });
    }

    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: {
          id: {
            in: createdUserIds,
          },
        },
      });
    }

    await prisma.$disconnect();
  });

  it('creates core chat records and updates read markers', async () => {
    const user = await createUser(prisma, {
      externalUserId: `integration-${unique}`,
      email: `integration-${unique}@example.test`,
      displayName: 'Integration User',
      role: 'user',
      status: UserStatus.ACTIVE,
      authSource: AuthSource.STANDALONE,
    });
    createdUserIds.push(user.id);

    const room = await createRoom(prisma, {
      type: RoomType.GROUP,
      visibility: RoomVisibility.PRIVATE,
      name: `Integration Room ${unique}`,
      createdByUserId: user.id,
    });
    createdRoomIds.push(room.id);

    const membership = await addRoomMember(prisma, {
      roomId: room.id,
      userId: user.id,
      role: RoomMemberRole.MEMBER,
      source: RoomMemberSource.STANDALONE,
      notificationLevel: NotificationLevel.ALL,
    });

    const message = await createMessage(prisma, {
      roomId: room.id,
      senderUserId: user.id,
      type: MessageType.TEXT,
      body: 'Integration smoke message',
      eventPayload: {},
    });

    const readState = await markRoomRead(prisma, {
      roomId: room.id,
      userId: user.id,
      lastReadMessageId: message.id,
      lastReadSequence: message.sequence,
    });

    const notification = await createNotification(prisma, {
      userId: user.id,
      roomId: room.id,
      messageId: message.id,
      type: 'message',
      title: 'Integration notification',
      body: 'Integration smoke notification',
      priority: NotificationPriority.NORMAL,
      deliveryState: NotificationDeliveryState.DELIVERED,
      payload: {
        integration: true,
      },
    });

    const readNotification = await markNotificationRead(prisma, notification.id, user.id);

    expect(membership.userId).toBe(user.id);
    expect(message.sequence).toBe(1);
    expect(readState.lastReadSequence).toBe(message.sequence);
    expect(readNotification.readAt).not.toBeNull();
  });

  it('creates a runtime notification for the other direct room member', async () => {
    const sender = await createIntegrationUser('direct-sender');
    const recipient = await createIntegrationUser('direct-recipient');
    const room = await createRoom(prisma, {
      type: RoomType.DIRECT,
      visibility: RoomVisibility.PRIVATE,
      name: `Integration Direct ${unique}`,
      createdByUserId: sender.id,
    });
    createdRoomIds.push(room.id);
    await addStandaloneMember(room.id, sender.id);
    await addStandaloneMember(room.id, recipient.id);

    const app = await buildApp({ prismaClient: prisma });
    const messageResponse = await app.inject({
      method: 'POST',
      url: `/rooms/${room.id}/messages`,
      headers: {
        'x-user-id': sender.id,
      },
      payload: {
        body: 'Direct runtime notification',
      },
    });
    const message = messageResponse.json<{ id: string }>();

    const recipientNotificationsResponse = await app.inject({
      method: 'GET',
      url: '/notifications?state=all&limit=20',
      headers: {
        'x-user-id': recipient.id,
      },
    });
    const senderNotificationsResponse = await app.inject({
      method: 'GET',
      url: '/notifications?state=all&limit=20',
      headers: {
        'x-user-id': sender.id,
      },
    });
    const recipientNotifications =
      recipientNotificationsResponse.json<NotificationResponse[]>();
    const senderNotifications = senderNotificationsResponse.json<NotificationResponse[]>();
    const recipientNotification = recipientNotifications.find(
      (notification) => notification.messageId === message.id,
    );

    expect(messageResponse.statusCode).toBe(200);
    expect(recipientNotificationsResponse.statusCode).toBe(200);
    expect(senderNotificationsResponse.statusCode).toBe(200);
    expect(recipientNotification).toMatchObject({
      userId: recipient.id,
      roomId: room.id,
      messageId: message.id,
      readAt: null,
    });
    expect(recipientNotification?.payload).toMatchObject({
      roomId: room.id,
      messageId: message.id,
      senderId: sender.id,
      messageKind: MessageType.TEXT,
      preview: 'Direct runtime notification',
    });
    expect(senderNotifications.some((notification) => notification.messageId === message.id)).toBe(
      false,
    );

    await app.close();
  });

  it('creates runtime notifications for group room members except the sender', async () => {
    const sender = await createIntegrationUser('group-sender');
    const recipient = await createIntegrationUser('group-recipient');
    const secondRecipient = await createIntegrationUser('group-second-recipient');
    const room = await createRoom(prisma, {
      type: RoomType.GROUP,
      visibility: RoomVisibility.PRIVATE,
      name: `Integration Group ${unique}`,
      createdByUserId: sender.id,
    });
    createdRoomIds.push(room.id);
    await addStandaloneMember(room.id, sender.id);
    await addStandaloneMember(room.id, recipient.id);
    await addStandaloneMember(room.id, secondRecipient.id);

    const app = await buildApp({ prismaClient: prisma });
    const messageResponse = await app.inject({
      method: 'POST',
      url: `/rooms/${room.id}/messages`,
      headers: {
        'x-user-id': sender.id,
      },
      payload: {
        body: 'Group runtime notification',
      },
    });
    const message = messageResponse.json<{ id: string }>();

    const notifications = await prisma.notification.findMany({
      where: {
        messageId: message.id,
      },
      orderBy: {
        userId: 'asc',
      },
    });

    expect(messageResponse.statusCode).toBe(200);
    expect(notifications.map((notification) => notification.userId).sort()).toEqual(
      [recipient.id, secondRecipient.id].sort(),
    );
    expect(notifications.every((notification) => notification.readAt === null)).toBe(true);
    expect(notifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: recipient.id,
          body: 'Group runtime notification',
        }),
        expect.objectContaining({
          userId: secondRecipient.id,
          body: 'Group runtime notification',
        }),
      ]),
    );

    await app.close();
  });

  it('replays an idempotent message create without duplicate messages or notifications', async () => {
    const sender = await createIntegrationUser('idempotent-sender');
    const recipient = await createIntegrationUser('idempotent-recipient');
    const room = await createRoom(prisma, {
      type: RoomType.DIRECT,
      visibility: RoomVisibility.PRIVATE,
      name: `Integration Idempotent ${unique}`,
      createdByUserId: sender.id,
    });
    createdRoomIds.push(room.id);
    await addStandaloneMember(room.id, sender.id);
    await addStandaloneMember(room.id, recipient.id);

    const app = await buildApp({ prismaClient: prisma });
    const idempotencyKey = `integration-${randomUUID()}`;
    const payload = {
      body: 'Idempotent runtime message',
    };
    const firstResponse = await app.inject({
      method: 'POST',
      url: `/rooms/${room.id}/messages`,
      headers: {
        'x-user-id': sender.id,
        'idempotency-key': idempotencyKey,
      },
      payload,
    });
    const replayResponse = await app.inject({
      method: 'POST',
      url: `/rooms/${room.id}/messages`,
      headers: {
        'x-user-id': sender.id,
        'idempotency-key': idempotencyKey,
      },
      payload,
    });
    const conflictResponse = await app.inject({
      method: 'POST',
      url: `/rooms/${room.id}/messages`,
      headers: {
        'x-user-id': sender.id,
        'idempotency-key': idempotencyKey,
      },
      payload: {
        body: 'Changed idempotent runtime message',
      },
    });
    const firstMessage = firstResponse.json<{ id: string }>();
    const replayMessage = replayResponse.json<{ id: string }>();
    const messages = await prisma.message.findMany({
      where: {
        roomId: room.id,
      },
    });
    const notifications = await prisma.notification.findMany({
      where: {
        messageId: firstMessage.id,
      },
    });

    expect(firstResponse.statusCode).toBe(200);
    expect(replayResponse.statusCode).toBe(200);
    expect(conflictResponse.statusCode).toBe(409);
    expect(replayMessage.id).toBe(firstMessage.id);
    expect(messages).toHaveLength(1);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.userId).toBe(recipient.id);

    await app.close();
  });
});
