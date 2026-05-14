import { z } from 'zod';

export const taskRoomScopeSchema = z.enum(['internal', 'manager', 'customer', 'system-events']);

export const taskRoomLookupQuerySchema = z.object({
  taskId: z.string().trim().min(1),
  roomScope: taskRoomScopeSchema,
});

export const roomIdParamsSchema = z.object({
  roomId: z.string().uuid(),
});

export const roomMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
  beforeSequence: z.coerce.number().int().positive().optional(),
});

export const postRoomMessageBodySchema = z.object({
  body: z.string().min(1).max(10_000),
  threadId: z.string().uuid().optional(),
});

export const idempotencyKeyHeaderSchema = z
  .union([z.string(), z.array(z.string()).length(1)])
  .optional()
  .transform((value) => (Array.isArray(value) ? value[0] : value))
  .pipe(z.string().trim().min(1).max(200).optional());

export const markRoomReadBodySchema = z.object({
  lastReadSequence: z.number().int().positive(),
});
