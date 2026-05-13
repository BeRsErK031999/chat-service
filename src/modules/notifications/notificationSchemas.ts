import { z } from 'zod';

export const listNotificationsQuerySchema = z.object({
  state: z.enum(['unread', 'read', 'all']).default('unread'),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export const notificationIdParamsSchema = z.object({
  id: z.string().uuid(),
});
