import type { Notification, Prisma, PrismaClient } from '@prisma/client';

import { createNotificationInputSchema } from './notificationTypes.js';
import type { CreateNotificationInput } from './notificationTypes.js';

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
