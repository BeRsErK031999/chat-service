import type { Message, Prisma, PrismaClient } from '@prisma/client';

import { createMessageInputSchema } from './messageTypes.js';
import type { CreateMessageInput } from './messageTypes.js';

export const createMessage = async (
  prisma: PrismaClient,
  input: CreateMessageInput,
): Promise<Message> => {
  const data = createMessageInputSchema.parse(input);

  return prisma.$transaction(async (transaction) => {
    const aggregate = await transaction.message.aggregate({
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

    const message = await transaction.message.create({
      data: messageData,
    });

    await transaction.room.update({
      where: {
        id: data.roomId,
      },
      data: {
        lastMessageId: message.id,
        lastMessageAt: message.createdAt,
      },
    });

    return message;
  });
};
