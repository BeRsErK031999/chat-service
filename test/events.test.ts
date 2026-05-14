import { EventEmitter } from 'node:events';
import type { ServerResponse } from 'node:http';
import { MessageType, NotificationDeliveryState, NotificationPriority } from '@prisma/client';
import type { Message, Notification, Prisma, PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { publishMessageCreated, publishNotificationCreated } from '../src/modules/events/eventPublisher.js';
import { SseConnectionManager } from '../src/modules/events/sseConnectionManager.js';

const userId = '11111111-1111-4111-8111-111111111111';
const otherUserId = '22222222-2222-4222-8222-222222222222';
const roomId = '33333333-3333-4333-8333-333333333333';
const messageId = '44444444-4444-4444-8444-444444444444';
const notificationId = '55555555-5555-4555-8555-555555555555';
const now = new Date('2026-05-14T00:00:00.000Z');

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

describe('SSE events', () => {
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
});
