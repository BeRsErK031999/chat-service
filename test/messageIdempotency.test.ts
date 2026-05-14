import {
  MessageType,
  NotificationDeliveryState,
  NotificationPriority,
  RequestIdempotencyStatus,
} from '@prisma/client';
import type { Message, Prisma, PrismaClient, RequestIdempotencyRecord } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { createMessageWithNotificationsIdempotent } from '../src/modules/messages/messageService.js';

const senderUserId = '11111111-1111-4111-8111-111111111111';
const otherUserId = '22222222-2222-4222-8222-222222222222';
const roomId = '33333333-3333-4333-8333-333333333333';
const otherRoomId = '44444444-4444-4444-8444-444444444444';
const messageIds = [
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666',
  '77777777-7777-4777-8777-777777777777',
];
const now = new Date('2026-05-14T00:00:00.000Z');

type MockState = {
  messages: Message[];
  records: RequestIdempotencyRecord[];
  messageCreateCount: number;
  notificationCreateCount: number;
};

const buildMessage = (id: string, input: Prisma.MessageUncheckedCreateInput): Message => ({
  id,
  roomId: input.roomId,
  senderUserId: input.senderUserId ?? null,
  type: input.type,
  body: input.body ?? null,
  eventType: input.eventType ?? null,
  eventPayload: {},
  sourceEventId: input.sourceEventId ?? null,
  sequence: input.sequence,
  createdAt: now,
  updatedAt: now,
});

const buildMockPrisma = (): { prisma: PrismaClient; state: MockState } => {
  const state: MockState = {
    messages: [],
    records: [],
    messageCreateCount: 0,
    notificationCreateCount: 0,
  };

  const client = {
    requestIdempotencyRecord: {
      findUnique: (args: Prisma.RequestIdempotencyRecordFindUniqueArgs) => {
        const scopeKey = args.where.scope_key;
        const record =
          scopeKey === undefined
            ? null
            : state.records.find(
                (item) => item.scope === scopeKey.scope && item.key === scopeKey.key,
              ) ?? null;
        return Promise.resolve(record);
      },
      create: (args: Prisma.RequestIdempotencyRecordCreateArgs) => {
        const data = args.data as Prisma.RequestIdempotencyRecordUncheckedCreateInput;
        const record: RequestIdempotencyRecord = {
          id: `record-${state.records.length + 1}`,
          scope: data.scope,
          key: data.key,
          requestHash: data.requestHash,
          status: RequestIdempotencyStatus.COMPLETED,
          userId: data.userId,
          roomId: data.roomId,
          resultMessageId: data.resultMessageId,
          createdAt: now,
          updatedAt: now,
        };
        state.records.push(record);
        return Promise.resolve(record);
      },
    },
    roomMember: {
      findMany: () => Promise.resolve([{ userId: otherUserId }]),
    },
    room: {
      update: () => Promise.resolve({ id: roomId }),
    },
    message: {
      aggregate: (args: Prisma.MessageAggregateArgs) => {
        const roomMessages = state.messages.filter(
          (message) => message.roomId === args.where?.roomId,
        );
        const maxSequence = Math.max(0, ...roomMessages.map((message) => message.sequence));

        return Promise.resolve({
          _max: {
            sequence: maxSequence,
          },
        });
      },
      create: (args: Prisma.MessageCreateArgs) => {
        state.messageCreateCount += 1;
        const data = args.data as Prisma.MessageUncheckedCreateInput;
        const messageId = messageIds[state.messageCreateCount - 1];

        if (messageId === undefined) {
          throw new Error('Unexpected extra mocked message create.');
        }

        const message = buildMessage(messageId, data);
        state.messages.push(message);
        return Promise.resolve(message);
      },
      findUniqueOrThrow: (args: Prisma.MessageFindUniqueOrThrowArgs) => {
        const id = args.where.id;
        const message = state.messages.find((item) => item.id === id);

        if (message === undefined) {
          throw new Error('Expected mocked message to exist.');
        }

        return Promise.resolve(message);
      },
    },
    notification: {
      findFirst: () => Promise.resolve(null),
      create: (args: Prisma.NotificationCreateArgs) => {
        state.notificationCreateCount += 1;
        const data = args.data as Prisma.NotificationUncheckedCreateInput;
        return Promise.resolve({
          id: `notification-${state.notificationCreateCount}`,
          userId: data.userId,
          roomId: data.roomId ?? null,
          messageId: data.messageId ?? null,
          type: data.type,
          title: data.title,
          body: data.body,
          priority: NotificationPriority.NORMAL,
          payload: data.payload ?? {},
          deliveryState: NotificationDeliveryState.PENDING,
          readAt: null,
          deliveredAt: null,
          sourceEventId: data.sourceEventId ?? null,
          createdAt: now,
          updatedAt: now,
        });
      },
    },
    $transaction: <T>(callback: (transaction: PrismaClient) => Promise<T>): Promise<T> =>
      callback(prisma),
  };

  const prisma = client as unknown as PrismaClient;
  return { prisma, state };
};

describe('createMessageWithNotificationsIdempotent', () => {
  it('creates one message and returns the same message for the same key and body', async () => {
    const { prisma, state } = buildMockPrisma();
    const input = {
      roomId,
      senderUserId,
      type: MessageType.TEXT,
      body: 'Idempotent hello',
      eventPayload: {},
    };

    const firstResult = await createMessageWithNotificationsIdempotent(prisma, input, 'same-key');
    const replayResult = await createMessageWithNotificationsIdempotent(prisma, input, 'same-key');

    expect(firstResult.created).toBe(true);
    expect(replayResult.created).toBe(false);
    expect(firstResult.message.id).toBe(replayResult.message.id);
    expect(state.messageCreateCount).toBe(1);
    expect(state.notificationCreateCount).toBe(1);
    expect(state.records).toHaveLength(1);
  });

  it('allows the same key in a different room scope', async () => {
    const { prisma, state } = buildMockPrisma();

    await createMessageWithNotificationsIdempotent(
      prisma,
      {
        roomId,
        senderUserId,
        type: MessageType.TEXT,
        body: 'Same key',
        eventPayload: {},
      },
      'shared-key',
    );
    await createMessageWithNotificationsIdempotent(
      prisma,
      {
        roomId: otherRoomId,
        senderUserId,
        type: MessageType.TEXT,
        body: 'Same key',
        eventPayload: {},
      },
      'shared-key',
    );

    expect(state.messageCreateCount).toBe(2);
    expect(state.records).toHaveLength(2);
  });

  it('allows the same key for a different user scope', async () => {
    const { prisma, state } = buildMockPrisma();

    await createMessageWithNotificationsIdempotent(
      prisma,
      {
        roomId,
        senderUserId,
        type: MessageType.TEXT,
        body: 'Same key',
        eventPayload: {},
      },
      'shared-key',
    );
    await createMessageWithNotificationsIdempotent(
      prisma,
      {
        roomId,
        senderUserId: otherUserId,
        type: MessageType.TEXT,
        body: 'Same key',
        eventPayload: {},
      },
      'shared-key',
    );

    expect(state.messageCreateCount).toBe(2);
    expect(state.records).toHaveLength(2);
  });

  it('returns conflict when the same scoped key is reused with a different body', async () => {
    const { prisma, state } = buildMockPrisma();

    await createMessageWithNotificationsIdempotent(
      prisma,
      {
        roomId,
        senderUserId,
        type: MessageType.TEXT,
        body: 'Original body',
        eventPayload: {},
      },
      'conflict-key',
    );

    await expect(
      createMessageWithNotificationsIdempotent(
        prisma,
        {
          roomId,
          senderUserId,
          type: MessageType.TEXT,
          body: 'Changed body',
          eventPayload: {},
        },
        'conflict-key',
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(state.messageCreateCount).toBe(1);
    expect(state.notificationCreateCount).toBe(1);
  });
});
