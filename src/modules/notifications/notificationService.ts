import type { Message, Notification, Prisma, PrismaClient } from '@prisma/client';
import { NotificationDeliveryState, NotificationPriority } from '@prisma/client';

import { createNotificationInputSchema } from './notificationTypes.js';
import type { CreateNotificationInput } from './notificationTypes.js';
import { NotFoundError } from '../../shared/errors.js';

type NotificationClient = PrismaClient | Prisma.TransactionClient;

export const createNotification = async (
  prisma: NotificationClient,
  input: CreateNotificationInput,
): Promise<Notification> => {
  const data = createNotificationInputSchema.parse(input);

  const notificationData: Prisma.NotificationUncheckedCreateInput = {
    userId: data.userId,
    roomId: data.roomId ?? null,
    messageId: data.messageId ?? null,
    type: data.type,
    title: data.title,
    body: data.body,
    priority: data.priority,
    payload: data.payload as Prisma.InputJsonValue,
    deliveryState: data.deliveryState,
    sourceEventId: data.sourceEventId ?? null,
  };

  return prisma.notification.create({
    data: notificationData,
  });
};

const buildMessagePreview = (body: string): string => {
  const compactBody = body.trim().replace(/\s+/g, ' ');
  const maxLength = 160;

  if (compactBody.length <= maxLength) {
    return compactBody;
  }

  return `${compactBody.slice(0, maxLength - 3)}...`;
};

export const createMessageNotifications = async (
  prisma: NotificationClient,
  message: Message,
): Promise<Notification[]> => {
  if (message.senderUserId === null || message.body === null) {
    return [];
  }

  const recipients = await prisma.roomMember.findMany({
    where: {
      roomId: message.roomId,
      leftAt: null,
      userId: {
        not: message.senderUserId,
      },
    },
    select: {
      userId: true,
    },
  });

  const preview = buildMessagePreview(message.body);

  return Promise.all(
    recipients.map(async (recipient): Promise<Notification> => {
      const sourceEventId = `message:${message.id}:user:${recipient.userId}`;
      const existingNotification = await prisma.notification.findFirst({
        where: {
          userId: recipient.userId,
          sourceEventId,
        },
      });

      if (existingNotification !== null) {
        return existingNotification;
      }

      return createNotification(prisma, {
        userId: recipient.userId,
        roomId: message.roomId,
        messageId: message.id,
        type: 'message',
        title: 'New message',
        body: preview,
        priority: NotificationPriority.NORMAL,
        deliveryState: NotificationDeliveryState.PENDING,
        payload: {
          roomId: message.roomId,
          messageId: message.id,
          senderId: message.senderUserId,
          messageKind: message.type,
          preview,
        },
        sourceEventId,
      });
    }),
  );
};

export type NotificationStateFilter = 'unread' | 'read' | 'all';

export const listNotificationsForUser = async (
  prisma: PrismaClient,
  userId: string,
  state: NotificationStateFilter,
  limit: number,
): Promise<Notification[]> => {
  const where: Prisma.NotificationWhereInput = {
    userId,
  };

  if (state === 'read') {
    where.readAt = {
      not: null,
    };
  }

  if (state === 'unread') {
    where.readAt = null;
  }

  return prisma.notification.findMany({
    where,
    orderBy: {
      createdAt: 'desc',
    },
    take: limit,
  });
};

export const markNotificationRead = async (
  prisma: PrismaClient,
  notificationId: string,
  userId: string,
): Promise<Notification> => {
  const result = await prisma.notification.updateMany({
    where: {
      id: notificationId,
      userId,
    },
    data: {
      readAt: new Date(),
    },
  });

  if (result.count === 0) {
    throw new NotFoundError('Notification was not found.');
  }

  return prisma.notification.findUniqueOrThrow({
    where: {
      id: notificationId,
    },
  });
};
