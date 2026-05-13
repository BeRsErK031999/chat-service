import type { Notification, Prisma, PrismaClient } from '@prisma/client';

import { createNotificationInputSchema } from './notificationTypes.js';
import type { CreateNotificationInput } from './notificationTypes.js';
import { ForbiddenError } from '../../shared/errors.js';

export const createNotification = async (
  prisma: PrismaClient,
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
    throw new ForbiddenError('Notification does not belong to user.');
  }

  return prisma.notification.findUniqueOrThrow({
    where: {
      id: notificationId,
    },
  });
};
