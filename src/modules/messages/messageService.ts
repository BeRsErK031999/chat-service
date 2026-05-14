import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { Message, Notification, PrismaClient } from '@prisma/client';

import { createMessageNotifications } from '../notifications/notificationService.js';
import { ConflictError } from '../../shared/errors.js';
import { createMessageInputSchema } from './messageTypes.js';
import type { CreateMessageInput } from './messageTypes.js';

type MessageClient = PrismaClient | Prisma.TransactionClient;

export type MessageCreateResult = {
  created: boolean;
  message: Message;
  notifications: Notification[];
};

const messageCreateOperation = 'message-create';

const buildMessageCreateScope = (userId: string, roomId: string): string =>
  `${messageCreateOperation}:user:${userId}:room:${roomId}`;

const buildMessageCreateRequestHash = (input: CreateMessageInput): string => {
  const data = createMessageInputSchema.parse(input);
  const stableRequestBody = JSON.stringify({
    type: data.type,
    body: data.body ?? null,
    eventPayload: data.eventPayload,
  });

  return createHash('sha256').update(stableRequestBody).digest('hex');
};

const findIdempotentMessage = async (
  prisma: MessageClient,
  scope: string,
  key: string,
  requestHash: string,
): Promise<Message | null> => {
  const existingRecord = await prisma.requestIdempotencyRecord.findUnique({
    where: {
      scope_key: {
        scope,
        key,
      },
    },
  });

  if (existingRecord === null) {
    return null;
  }

  if (existingRecord.requestHash !== requestHash) {
    throw new ConflictError('Idempotency-Key was already used with a different request body.');
  }

  return prisma.message.findUniqueOrThrow({
    where: {
      id: existingRecord.resultMessageId,
    },
  });
};

const createMessageRecord = async (
  prisma: MessageClient,
  input: CreateMessageInput,
): Promise<Message> => {
  const data = createMessageInputSchema.parse(input);

  const aggregate = await prisma.message.aggregate({
    where: {
      roomId: data.roomId,
    },
    _max: {
      sequence: true,
    },
  });

  const sequence = (aggregate._max.sequence ?? 0) + 1;
  const messageData: Prisma.MessageUncheckedCreateInput = {
    roomId: data.roomId,
    senderUserId: data.senderUserId ?? null,
    type: data.type,
    body: data.body ?? null,
    eventType: data.eventType ?? null,
    eventPayload: data.eventPayload as Prisma.InputJsonValue,
    sourceEventId: data.sourceEventId ?? null,
    sequence,
  };

  const message = await prisma.message.create({
    data: messageData,
  });

  await prisma.room.update({
    where: {
      id: data.roomId,
    },
    data: {
      lastMessageId: message.id,
      lastMessageAt: message.createdAt,
    },
  });

  return message;
};

export const createMessage = async (
  prisma: PrismaClient,
  input: CreateMessageInput,
): Promise<Message> => {
  return prisma.$transaction((transaction) => createMessageRecord(transaction, input));
};

export const createMessageWithNotifications = async (
  prisma: PrismaClient,
  input: CreateMessageInput,
): Promise<MessageCreateResult> => {
  return prisma.$transaction(async (transaction) => {
    const message = await createMessageRecord(transaction, input);
    const notifications = await createMessageNotifications(transaction, message);

    return {
      created: true,
      message,
      notifications,
    };
  });
};

export const createMessageWithNotificationsIdempotent = async (
  prisma: PrismaClient,
  input: CreateMessageInput,
  idempotencyKey: string,
): Promise<MessageCreateResult> => {
  const data = createMessageInputSchema.parse(input);

  if (data.senderUserId === undefined) {
    throw new ConflictError('Idempotent message creation requires a sender user.');
  }

  const senderUserId = data.senderUserId;
  const scope = buildMessageCreateScope(senderUserId, data.roomId);
  const requestHash = buildMessageCreateRequestHash(data);

  try {
    return await prisma.$transaction(async (transaction) => {
      const existingMessage = await findIdempotentMessage(
        transaction,
        scope,
        idempotencyKey,
        requestHash,
      );

      if (existingMessage !== null) {
        return {
          created: false,
          message: existingMessage,
          notifications: [],
        };
      }

      const message = await createMessageRecord(transaction, data);
      const notifications = await createMessageNotifications(transaction, message);
      await transaction.requestIdempotencyRecord.create({
        data: {
          scope,
          key: idempotencyKey,
          requestHash,
          userId: senderUserId,
          roomId: data.roomId,
          resultMessageId: message.id,
        },
      });

      return {
        created: true,
        message,
        notifications,
      };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const existingMessage = await findIdempotentMessage(
        prisma,
        scope,
        idempotencyKey,
        requestHash,
      );

      if (existingMessage !== null) {
        return {
          created: false,
          message: existingMessage,
          notifications: [],
        };
      }
    }

    throw error;
  }
};

export type ListRoomMessagesInput = {
  roomId: string;
  limit: number;
  beforeSequence?: number;
};

export const listRoomMessages = async (
  prisma: PrismaClient,
  input: ListRoomMessagesInput,
): Promise<Message[]> => {
  const where: Prisma.MessageWhereInput = {
    roomId: input.roomId,
  };

  if (input.beforeSequence !== undefined) {
    where.sequence = {
      lt: input.beforeSequence,
    };
  }

  return prisma.message.findMany({
    where,
    orderBy: {
      sequence: 'desc',
    },
    take: input.limit,
  });
};
