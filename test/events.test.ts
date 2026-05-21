import { EventEmitter } from 'node:events';
import type { ServerResponse } from 'node:http';
import { MessageType, NotificationDeliveryState, NotificationPriority } from '@prisma/client';
import type { Message, Notification, Prisma, PrismaClient } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import { createChatInternalToken } from '../src/modules/auth/tokenService.js';
import { publishMessageCreated, publishNotificationCreated } from '../src/modules/events/eventPublisher.js';
import { SseConnectionManager } from '../src/modules/events/sseConnectionManager.js';
import { publishPresenceChanged } from '../src/modules/presence/presenceService.js';

const userId = '11111111-1111-4111-8111-111111111111';
const otherUserId = '22222222-2222-4222-8222-222222222222';
const roomId = '33333333-3333-4333-8333-333333333333';
const messageId = '44444444-4444-4444-8444-444444444444';
const notificationId = '55555555-5555-4555-8555-555555555555';
const now = new Date('2026-05-14T00:00:00.000Z');
const allowedOrigin = 'http://localhost:5175';
const disallowedOrigin = 'http://malicious.example';
const secret = 'test-chat-internal-auth-secret-32-chars-min';

class FakeResponse extends EventEmitter {
  public readonly chunks: string[] = [];

  public write(chunk: string): boolean {
    this.chunks.push(chunk);
    return true;
  }

  public end(): void {
    this.emit('close');
  }
}

const asServerResponse = (response: FakeResponse): ServerResponse =>
  response as unknown as ServerResponse;

class ClosingSseConnectionManager extends SseConnectionManager {
  public override addConnection(connectionUserId: string, response: ServerResponse): () => void {
    expect(connectionUserId).toBe(userId);
    response.write(': connected\n\n');
    response.end();

    return () => undefined;
  }
}

const buildToken = (): string => {
  const issuedAt = Math.floor(Date.now() / 1000);

  return createChatInternalToken(
    {
      userId,
      displayName: 'Artem',
      issuedAt,
      expiresAt: issuedAt + 900,
      source: 'desktop',
    },
    secret,
  );
};

const message: Message = {
  id: messageId,
  roomId,
  senderUserId: userId,
  type: MessageType.TEXT,
  body: 'Realtime hello',
  eventType: null,
  eventPayload: {},
  sourceEventId: null,
  sequence: 1,
  createdAt: now,
  updatedAt: now,
};

const notification: Notification = {
  id: notificationId,
  userId: otherUserId,
  roomId,
  messageId,
  type: 'message',
  title: 'New message',
  body: 'Realtime hello',
  priority: NotificationPriority.NORMAL,
  payload: {},
  deliveryState: NotificationDeliveryState.PENDING,
  readAt: null,
  deliveredAt: null,
  sourceEventId: null,
  createdAt: now,
  updatedAt: now,
};

const buildPublisherPrisma = (memberIds: string[]): PrismaClient =>
  ({
    roomMember: {
      findMany: (args: Prisma.RoomMemberFindManyArgs) => {
        expect(args.where).toMatchObject({
          roomId,
          leftAt: null,
        });

        return Promise.resolve(memberIds.map((memberId) => ({ userId: memberId })));
      },
    },
  }) as unknown as PrismaClient;

const buildPresencePrisma = (): PrismaClient =>
  ({
    user: {
      update: (args: Prisma.UserUpdateArgs) => {
        expect(args.where).toEqual({
          id: userId,
        });
        expect(args.data).toHaveProperty('lastSeenAt');

        return Promise.resolve({
          id: userId,
        });
      },
    },
    roomMember: {
      findMany: (args: Prisma.RoomMemberFindManyArgs) => {
        if ('userId' in (args.where ?? {})) {
          return Promise.resolve([{ roomId }]);
        }

        return Promise.resolve([{ userId }, { userId: otherUserId }]);
      },
    },
  }) as unknown as PrismaClient;

describe('SSE events', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects /events without user id', async () => {
    const app = await buildApp({
      prismaClient: buildPublisherPrisma([]),
      sseManager: new SseConnectionManager(),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/events',
    });

    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it('returns CORS and stream headers for an allowed SSE dev user origin', async () => {
    vi.stubEnv('CHAT_ALLOW_DEV_USER_ID', 'true');
    vi.stubEnv('CHAT_CORS_ALLOWED_ORIGINS', allowedOrigin);
    const app = await buildApp({
      prismaClient: buildPublisherPrisma([]),
      sseManager: new ClosingSseConnectionManager(),
    });

    const response = await app.inject({
      method: 'GET',
      url: `/events?userId=${userId}`,
      headers: {
        origin: allowedOrigin,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/event-stream; charset=utf-8');
    expect(response.headers['cache-control']).toBe('no-cache, no-transform');
    expect(response.headers['x-accel-buffering']).toBe('no');
    expect(response.headers['access-control-allow-origin']).toBe(allowedOrigin);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers.vary).toBe('Origin');
    expect(response.body).toContain(': connected');

    await app.close();
  });

  it('does not echo CORS headers for a disallowed SSE origin', async () => {
    vi.stubEnv('CHAT_ALLOW_DEV_USER_ID', 'true');
    vi.stubEnv('CHAT_CORS_ALLOWED_ORIGINS', allowedOrigin);
    const app = await buildApp({
      prismaClient: buildPublisherPrisma([]),
      sseManager: new ClosingSseConnectionManager(),
    });

    const response = await app.inject({
      method: 'GET',
      url: `/events?userId=${userId}`,
      headers: {
        origin: disallowedOrigin,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();

    await app.close();
  });

  it('accepts SSE accessToken auth and returns CORS headers for allowed origins', async () => {
    vi.stubEnv('CHAT_ALLOW_DEV_USER_ID', 'false');
    vi.stubEnv('CHAT_INTERNAL_AUTH_SECRET', secret);
    vi.stubEnv('CHAT_CORS_ALLOWED_ORIGINS', allowedOrigin);
    const app = await buildApp({
      prismaClient: buildPublisherPrisma([]),
      sseManager: new ClosingSseConnectionManager(),
    });

    const response = await app.inject({
      method: 'GET',
      url: `/events?accessToken=${encodeURIComponent(buildToken())}`,
      headers: {
        origin: allowedOrigin,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe(allowedOrigin);
    expect(response.body).toContain(': connected');

    await app.close();
  });

  it('delivers message.created only to active room members', async () => {
    const manager = new SseConnectionManager();
    const activeMemberResponse = new FakeResponse();
    const nonMemberResponse = new FakeResponse();
    manager.addConnection(userId, asServerResponse(activeMemberResponse));
    manager.addConnection(otherUserId, asServerResponse(nonMemberResponse));

    await publishMessageCreated(buildPublisherPrisma([userId]), message, manager);

    expect(activeMemberResponse.chunks.join('')).toContain('event: message.created');
    expect(activeMemberResponse.chunks.join('')).toContain(messageId);
    expect(nonMemberResponse.chunks.join('')).not.toContain('event: message.created');
    manager.closeAll();
  });

  it('delivers notification.created only to the notification owner', () => {
    const manager = new SseConnectionManager();
    const ownerResponse = new FakeResponse();
    const otherResponse = new FakeResponse();
    manager.addConnection(otherUserId, asServerResponse(ownerResponse));
    manager.addConnection(userId, asServerResponse(otherResponse));

    publishNotificationCreated(notification, manager);

    expect(ownerResponse.chunks.join('')).toContain('event: notification.created');
    expect(ownerResponse.chunks.join('')).toContain(notificationId);
    expect(otherResponse.chunks.join('')).not.toContain('event: notification.created');
    manager.closeAll();
  });

  it('cleans up closed connections', () => {
    const manager = new SseConnectionManager();
    const response = new FakeResponse();
    manager.addConnection(userId, asServerResponse(response));

    expect(manager.getConnectionCount(userId)).toBe(1);
    response.emit('close');
    expect(manager.getConnectionCount(userId)).toBe(0);
  });

  it('fires lifecycle callbacks only on online and offline transitions', () => {
    const onlineUserIds: string[] = [];
    const offlineUserIds: string[] = [];
    const manager = new SseConnectionManager({
      onUserOnline: (connectionUserId) => onlineUserIds.push(connectionUserId),
      onUserOffline: (connectionUserId) => offlineUserIds.push(connectionUserId),
    });
    const firstResponse = new FakeResponse();
    const secondResponse = new FakeResponse();

    manager.addConnection(userId, asServerResponse(firstResponse));
    manager.addConnection(userId, asServerResponse(secondResponse));
    firstResponse.emit('close');
    secondResponse.emit('close');

    expect(onlineUserIds).toEqual([userId]);
    expect(offlineUserIds).toEqual([userId]);
  });

  it('publishes presence changes to users sharing active rooms', async () => {
    const manager = new SseConnectionManager();
    const userResponse = new FakeResponse();
    const otherUserResponse = new FakeResponse();
    manager.addConnection(userId, asServerResponse(userResponse));
    manager.addConnection(otherUserId, asServerResponse(otherUserResponse));

    await publishPresenceChanged(buildPresencePrisma(), userId, 'online', manager);

    expect(userResponse.chunks.join('')).toContain('event: presence.changed');
    expect(userResponse.chunks.join('')).toContain('"status":"online"');
    expect(otherUserResponse.chunks.join('')).toContain('event: presence.changed');
    manager.closeAll();
  });
});
