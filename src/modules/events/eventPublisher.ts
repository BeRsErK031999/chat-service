import type { Message, Notification, PrismaClient, ReadState } from '@prisma/client';

import { sseConnectionManager } from './sseConnectionManager.js';
import type { SseConnectionManager } from './sseConnectionManager.js';

const buildPreview = (body: string | null): string | null => {
  if (body === null) {
    return null;
  }

  const compactBody = body.trim().replace(/\s+/g, ' ');

  if (compactBody.length <= 160) {
    return compactBody;
  }

  return `${compactBody.slice(0, 157)}...`;
};

export const publishMessageCreated = async (
  prisma: PrismaClient,
  message: Message,
  manager: SseConnectionManager = sseConnectionManager,
): Promise<void> => {
  const activeMembers = await prisma.roomMember.findMany({
    where: {
      roomId: message.roomId,
      leftAt: null,
    },
    select: {
      userId: true,
    },
  });

  for (const member of activeMembers) {
    manager.sendToUser(member.userId, 'message.created', {
      roomId: message.roomId,
      messageId: message.id,
      senderId: message.senderUserId,
      createdAt: message.createdAt.toISOString(),
      preview: buildPreview(message.body),
    });
  }
};

export const publishNotificationCreated = (
  notification: Notification,
  manager: SseConnectionManager = sseConnectionManager,
): void => {
  manager.sendToUser(notification.userId, 'notification.created', {
    notificationId: notification.id,
    roomId: notification.roomId,
    messageId: notification.messageId,
    title: notification.title,
    body: notification.body,
  });
};

export const publishNotificationRead = (
  notification: Notification,
  manager: SseConnectionManager = sseConnectionManager,
): void => {
  manager.sendToUser(notification.userId, 'notification.read', {
    notificationId: notification.id,
  });
};

export const publishRoomRead = (
  readState: ReadState,
  manager: SseConnectionManager = sseConnectionManager,
): void => {
  manager.sendToUser(readState.userId, 'room.read', {
    roomId: readState.roomId,
    userId: readState.userId,
  });
};
