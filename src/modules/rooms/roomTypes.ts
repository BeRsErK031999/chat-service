import {
  NotificationLevel,
  RoomMemberRole,
  RoomMemberSource,
  RoomType,
  RoomVisibility,
  TaskRoomKind,
} from '@prisma/client';
import { z } from 'zod';

export const createRoomInputSchema = z.object({
  type: z.nativeEnum(RoomType),
  visibility: z.nativeEnum(RoomVisibility).default(RoomVisibility.PRIVATE),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1_000).optional(),
  taskId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  taskRoomKind: z.nativeEnum(TaskRoomKind).optional(),
  createdByUserId: z.string().uuid().optional(),
  createdByEventId: z.string().min(1).optional(),
});

export const addRoomMemberInputSchema = z.object({
  roomId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.nativeEnum(RoomMemberRole).default(RoomMemberRole.MEMBER),
  source: z.nativeEnum(RoomMemberSource).default(RoomMemberSource.STANDALONE),
  notificationLevel: z.nativeEnum(NotificationLevel).default(NotificationLevel.ALL),
  mutedUntil: z.date().optional(),
});

export type CreateRoomInput = z.infer<typeof createRoomInputSchema>;
export type AddRoomMemberInput = z.infer<typeof addRoomMemberInputSchema>;

export const canRoomAcceptUserMessages = (room: {
  type: RoomType;
  taskRoomKind: TaskRoomKind | null;
  isArchived: boolean;
}): boolean => {
  if (room.isArchived) {
    return false;
  }

  if (room.type === RoomType.SYSTEM) {
    return false;
  }

  if (room.type === RoomType.TASK && room.taskRoomKind === TaskRoomKind.SYSTEM_EVENTS) {
    return false;
  }

  return true;
};
