import { MessageType, RoomMemberRole, RoomType, RoomVisibility } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';

const userId = '11111111-1111-4111-8111-111111111111';
const otherUserId = '22222222-2222-4222-8222-222222222222';
const roomId = '33333333-3333-4333-8333-333333333333';
const messageId = '44444444-4444-4444-8444-444444444444';
const notificationId = '55555555-5555-4555-8555-555555555555';
const now = new Date('2026-05-13T00:00:00.000Z');

type MockPrismaOptions = {
  isMember?: boolean;
  notificationBelongsToUser?: boolean;
};

const buildMockPrisma = (options: MockPrismaOptions = {}): PrismaClient => {
  const isMember = options.isMember ?? true;
  const notificationBelongsToUser = options.notificationBelongsToUser ?? true;
  const client = {
    roomMember: {
      findFirst: () => Promise.resolve(isMember ? { id: 'member-1' } : null),
    },
    room: {
      findMany: () => Promise.resolve([
        {
          id: roomId,
          type: RoomType.GROUP,
          visibility: RoomVisibility.PRIVATE,
          name: 'Project room',
          description: null,
          taskId: null,
          projectId: null,
          taskRoomKind: null,
          createdByUserId: userId,
          createdByEventId: null,
          lastMessageId: messageId,
          lastMessageAt: now,
          isArchived: false,
          createdAt: now,
          updatedAt: now,
          members: [
            {
              id: 'member-1',
              roomId,
              userId,
              role: RoomMemberRole.MEMBER,
              source: 'STANDALONE',
              notificationLevel: 'ALL',
              joinedAt: now,
              leftAt: null,
              mutedUntil: null,
              createdAt: now,
              updatedAt: now,
            },
          ],
          messages: [
            {
              id: messageId,
              roomId,
              senderUserId: userId,
              type: MessageType.TEXT,
              body: 'hello',
              eventType: null,
              eventPayload: {},
              sourceEventId: null,
              sequence: 3,
              createdAt: now,
              updatedAt: now,
            },
          ],
          readStates: [
            {
              id: 'read-state-1',
              roomId,
              userId,
              lastReadMessageId: null,
              lastReadSequence: 1,
              lastReadAt: now,
              unreadCountSnapshot: 0,
              createdAt: now,
              updatedAt: now,
            },
          ],
        },
      ]),
      findUnique: () => Promise.resolve({
        type: RoomType.GROUP,
        taskRoomKind: null,
        isArchived: false,
      }),
      update: () => Promise.resolve({
        id: roomId,
      }),
    },
    message: {
      count: () => Promise.resolve(2),
      findMany: () => Promise.resolve([
        {
          id: messageId,
          roomId,
          senderUserId: userId,
          type: MessageType.TEXT,
          body: 'hello',
          eventType: null,
          eventPayload: {},
          sourceEventId: null,
          sequence: 3,
          createdAt: now,
          updatedAt: now,
        },
      ]),
      aggregate: () => Promise.resolve({
        _max: {
          sequence: 3,
        },
      }),
      create: () => Promise.resolve({
        id: '66666666-6666-4666-8666-666666666666',
        roomId,
        senderUserId: userId,
        type: MessageType.TEXT,
        body: 'new message',
        eventType: null,
        eventPayload: {},
        sourceEventId: null,
        sequence: 4,
        createdAt: now,
        updatedAt: now,
      }),
    },
    readState: {
      upsert: () => Promise.resolve({
        id: 'read-state-1',
        roomId,
        userId,
        lastReadMessageId: null,
        lastReadSequence: 4,
        lastReadAt: now,
        unreadCountSnapshot: 0,
        createdAt: now,
        updatedAt: now,
      }),
    },
    notification: {
      findMany: () => Promise.resolve([
        {
          id: notificationId,
          userId,
          roomId,
          messageId,
          type: 'message',
          title: 'New message',
          body: 'hello',
          priority: 'NORMAL',
          payload: {},
          deliveryState: 'PENDING',
          readAt: null,
          deliveredAt: null,
          sourceEventId: null,
          createdAt: now,
          updatedAt: now,
        },
      ]),
      updateMany: () => Promise.resolve({
        count: notificationBelongsToUser ? 1 : 0,
      }),
      findUniqueOrThrow: () => Promise.resolve({
        id: notificationId,
        userId,
        roomId,
        messageId,
        type: 'message',
        title: 'New message',
        body: 'hello',
        priority: 'NORMAL',
        payload: {},
        deliveryState: 'PENDING',
        readAt: now,
        deliveredAt: null,
        sourceEventId: null,
        createdAt: now,
        updatedAt: now,
      }),
    },
    $transaction: <T>(callback: (transaction: PrismaClient) => Promise<T>): Promise<T> =>
      callback(prisma),
  };

  const prisma = client as unknown as PrismaClient;
  return prisma;
};

describe('Phase 1B HTTP API', () => {
  it('returns 401 without x-user-id on protected endpoints', async () => {
    const app = await buildApp({ prismaClient: buildMockPrisma() });

    const response = await app.inject({
      method: 'GET',
      url: '/rooms',
    });

    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it('/health does not require auth', async () => {
    const app = await buildApp({ prismaClient: buildMockPrisma() });

    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);

    await app.close();
  });

  it('returns rooms for the authenticated user', async () => {
    const app = await buildApp({ prismaClient: buildMockPrisma() });

    const response = await app.inject({
      method: 'GET',
      url: '/rooms',
      headers: {
        'x-user-id': userId,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject([
      {
        id: roomId,
        unreadCount: 2,
        membership: {
          userId,
        },
        lastMessage: {
          id: messageId,
        },
      },
    ]);

    await app.close();
  });

  it('does not allow reading messages in rooms where user is not a member', async () => {
    const app = await buildApp({ prismaClient: buildMockPrisma({ isMember: false }) });

    const response = await app.inject({
      method: 'GET',
      url: `/rooms/${roomId}/messages`,
      headers: {
        'x-user-id': otherUserId,
      },
    });

    expect(response.statusCode).toBe(403);

    await app.close();
  });

  it('allows members to post messages to their room', async () => {
    const app = await buildApp({ prismaClient: buildMockPrisma() });

    const response = await app.inject({
      method: 'POST',
      url: `/rooms/${roomId}/messages`,
      headers: {
        'x-user-id': userId,
      },
      payload: {
        body: 'new message',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      roomId,
      senderUserId: userId,
      type: MessageType.TEXT,
      sequence: 4,
    });

    await app.close();
  });

  it('allows members to mark a room read', async () => {
    const app = await buildApp({ prismaClient: buildMockPrisma() });

    const response = await app.inject({
      method: 'POST',
      url: `/rooms/${roomId}/read`,
      headers: {
        'x-user-id': userId,
      },
      payload: {
        lastReadSequence: 4,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      roomId,
      userId,
      lastReadSequence: 4,
    });

    await app.close();
  });

  it('lists notifications for the authenticated user', async () => {
    const app = await buildApp({ prismaClient: buildMockPrisma() });

    const response = await app.inject({
      method: 'GET',
      url: '/notifications?state=all&limit=50',
      headers: {
        'x-user-id': userId,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject([
      {
        id: notificationId,
        userId,
      },
    ]);

    await app.close();
  });

  it('does not allow marking another user notification read', async () => {
    const app = await buildApp({
      prismaClient: buildMockPrisma({ notificationBelongsToUser: false }),
    });

    const response = await app.inject({
      method: 'POST',
      url: `/notifications/${notificationId}/read`,
      headers: {
        'x-user-id': otherUserId,
      },
    });

    expect(response.statusCode).toBe(403);

    await app.close();
  });
});
