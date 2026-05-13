import { MessageType } from '@prisma/client';
import { z } from 'zod';

export const createMessageInputSchema = z
  .object({
    roomId: z.string().uuid(),
    senderUserId: z.string().uuid().optional(),
    type: z.nativeEnum(MessageType),
    body: z.string().min(1).max(10_000).optional(),
    eventType: z.string().min(1).optional(),
    eventPayload: z.record(z.unknown()).default({}),
    sourceEventId: z.string().min(1).optional(),
  })
  .superRefine((input, context) => {
    if (input.type === MessageType.TEXT && input.body === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Text messages require body.',
        path: ['body'],
      });
    }

    if (input.type === MessageType.SYSTEM_EVENT && input.eventType === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'System event messages require eventType.',
        path: ['eventType'],
      });
    }
  });

export type CreateMessageInput = z.infer<typeof createMessageInputSchema>;
