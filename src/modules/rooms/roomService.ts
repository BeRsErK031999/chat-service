import type { Message, Prisma, PrismaClient, ReadState, Room, RoomMember } from '@prisma/client';

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

export type RoomListItem = Room & {
  lastMessage: Message | null;
  unreadCount: number;
  membership: RoomMember;
};

type RoomWithCurrentUserState = Room & {
  members: RoomMember[];
  messages: Message[];
  readStates: ReadState[];
};

export const listRoomsForUser = async (
  prisma: PrismaClient,
  userId: string,
): Promise<RoomListItem[]> => {
  const rooms = await prisma.room.findMany({
    where: {
      members: {
        some: {
          userId,
          leftAt: null,
        },
      },
      isArchived: false,
    },
    include: {
      members: {
        where: {
          userId,
          leftAt: null,
        },
      },
      messages: {
        orderBy: {
          sequence: 'desc',
        },
        take: 1,
      },
      readStates: {
        where: {
          userId,
        },
        take: 1,
      },
    },
    orderBy: [
      {
        lastMessageAt: 'desc',
      },
      {
        createdAt: 'desc',
      },
    ],
  });

  return Promise.all(
    rooms.map(async (room: RoomWithCurrentUserState): Promise<RoomListItem> => {
      const membership = room.members[0];

      if (membership === undefined) {
        throw new Error('Expected current user membership to be included.');
      }

      const lastReadSequence = room.readStates[0]?.lastReadSequence ?? 0;
      const unreadCount = await prisma.message.count({
        where: {
          roomId: room.id,
          sequence: {
            gt: lastReadSequence,
          },
        },
      });

      return {
        id: room.id,
        type: room.type,
        visibility: room.visibility,
        name: room.name,
        description: room.description,
        taskId: room.taskId,
        projectId: room.projectId,
        taskRoomKind: room.taskRoomKind,
        createdByUserId: room.createdByUserId,
        createdByEventId: room.createdByEventId,
        lastMessageId: room.lastMessageId,
        lastMessageAt: room.lastMessageAt,
        isArchived: room.isArchived,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
        lastMessage: room.messages[0] ?? null,
        unreadCount,
        membership,
      };
    }),
  );
};
