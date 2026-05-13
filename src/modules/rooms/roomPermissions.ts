import type { PrismaClient, Room } from '@prisma/client';

import { canRoomAcceptUserMessages } from './roomTypes.js';
import { ForbiddenError } from '../../shared/errors.js';

export const assertRoomMember = async (
  prisma: PrismaClient,
  roomId: string,
  userId: string,
): Promise<void> => {
  const membership = await prisma.roomMember.findFirst({
    where: {
      roomId,
      userId,
      leftAt: null,
    },
    select: {
      id: true,
    },
  });

  if (membership === null) {
    throw new ForbiddenError('User is not a room member.');
  }
};

export const canReadRoom = async (
  prisma: PrismaClient,
  roomId: string,
  userId: string,
): Promise<void> => {
  await assertRoomMember(prisma, roomId, userId);
};

export const canWriteRoom = async (
  prisma: PrismaClient,
  roomId: string,
  userId: string,
): Promise<Pick<Room, 'type' | 'taskRoomKind' | 'isArchived'>> => {
  await assertRoomMember(prisma, roomId, userId);

  const room = await prisma.room.findUnique({
    where: {
      id: roomId,
    },
    select: {
      type: true,
      taskRoomKind: true,
      isArchived: true,
    },
  });

  if (room === null || !canRoomAcceptUserMessages(room)) {
    throw new ForbiddenError('Room does not accept user messages.');
  }

  return room;
};
