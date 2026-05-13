import { z } from 'zod';

export const markRoomReadInputSchema = z
  .object({
    roomId: z.string().uuid(),
    userId: z.string().uuid(),
    lastReadMessageId: z.string().uuid().optional(),
    lastReadSequence: z.number().int().nonnegative(),
  })
  .refine((input) => input.lastReadMessageId !== undefined || input.lastReadSequence > 0, {
    message: 'A read marker must include a message id or a positive sequence.',
    path: ['lastReadSequence'],
  });

export type MarkRoomReadInput = z.infer<typeof markRoomReadInputSchema>;
