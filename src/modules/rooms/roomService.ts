import type { Prisma, PrismaClient, Room, RoomMember } from '@prisma/client';

import { addRoomMemberInputSchema, createRoomInputSchema } from './roomTypes.js';
import type { AddRoomMemberInput, CreateRoomInput } from './roomTypes.js';

export const createRoom = async (prisma: PrismaClient, input: CreateRoomInput): Promise<Room> => {
  const data = createRoomInputSchema.parse(input);
  const roomData: Prisma.RoomUncheckedCreateInput = {
    type: data.type,
    visibility: data.visibility,
    name: data.name ?? null,
    description: data.description ?? null,
    taskId: data.taskId ?? null,
    projectId: data.projectId ?? null,
    taskRoomKind: data.taskRoomKind ?? null,
    createdByUserId: data.createdByUserId ?? null,
    createdByEventId: data.createdByEventId ?? null,
  };

  return prisma.room.create({
    data: roomData,
  });
};

export const addRoomMember = async (
  prisma: PrismaClient,
  input: AddRoomMemberInput,
): Promise<RoomMember> => {
  const data = addRoomMemberInputSchema.parse(input);
  const roomMemberData: Prisma.RoomMemberUncheckedCreateInput = {
    roomId: data.roomId,
    userId: data.userId,
    role: data.role,
    source: data.source,
    notificationLevel: data.notificationLevel,
    mutedUntil: data.mutedUntil ?? null,
  };

  return prisma.roomMember.create({
    data: roomMemberData,
  });
};
