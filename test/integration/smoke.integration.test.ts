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
import { prisma } from '../../src/persistence/prismaClient.js';

describe('integration smoke flow', () => {
  const unique = randomUUID();
  const createdUserIds: string[] = [];
  const createdRoomIds: string[] = [];

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
});
