import { z } from 'zod';

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

export const markRoomReadBodySchema = z.object({
  lastReadSequence: z.number().int().positive(),
});
