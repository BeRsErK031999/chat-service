import { NotificationDeliveryState, NotificationPriority } from '@prisma/client';
import { z } from 'zod';

export const createNotificationInputSchema = z.object({
  userId: z.string().uuid(),
  roomId: z.string().uuid().optional(),
  messageId: z.string().uuid().optional(),
  type: z.string().min(1).max(100),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(1_000),
  priority: z.nativeEnum(NotificationPriority).default(NotificationPriority.NORMAL),
  payload: z.record(z.unknown()).default({}),
  deliveryState: z
    .nativeEnum(NotificationDeliveryState)
    .default(NotificationDeliveryState.PENDING),
  sourceEventId: z.string().min(1).optional(),
});

export type CreateNotificationInput = z.infer<typeof createNotificationInputSchema>;
