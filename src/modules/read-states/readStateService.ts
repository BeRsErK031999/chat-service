import type { Prisma, PrismaClient, ReadState } from '@prisma/client';

import { markRoomReadInputSchema } from './readStateTypes.js';
import type { MarkRoomReadInput } from './readStateTypes.js';

export const markRoomRead = async (
  prisma: PrismaClient,
  input: MarkRoomReadInput,
): Promise<ReadState> => {
  const data = markRoomReadInputSchema.parse(input);
  const now = new Date();
  const readStateCreateData: Prisma.ReadStateUncheckedCreateInput = {
    roomId: data.roomId,
    userId: data.userId,
    lastReadMessageId: data.lastReadMessageId ?? null,
    lastReadSequence: data.lastReadSequence,
    lastReadAt: now,
    unreadCountSnapshot: 0,
  };
  const readStateUpdateData: Prisma.ReadStateUncheckedUpdateInput = {
    lastReadMessageId: data.lastReadMessageId ?? null,
    lastReadSequence: data.lastReadSequence,
    lastReadAt: now,
    unreadCountSnapshot: 0,
  };

  return prisma.readState.upsert({
    where: {
      userId_roomId: {
        userId: data.userId,
        roomId: data.roomId,
      },
    },
    create: readStateCreateData,
    update: readStateUpdateData,
  });
};
