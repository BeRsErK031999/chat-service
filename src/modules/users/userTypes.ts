import { AuthSource, UserStatus } from '@prisma/client';
import { z } from 'zod';

export const createUserInputSchema = z.object({
  externalUserId: z.string().min(1).optional(),
  email: z.string().email().optional(),
  displayName: z.string().min(1).max(200),
  avatarUrl: z.string().url().optional(),
  role: z.string().min(1).max(50).default('user'),
  status: z.nativeEnum(UserStatus).default(UserStatus.ACTIVE),
  authSource: z.nativeEnum(AuthSource).default(AuthSource.STANDALONE),
});

export type CreateUserInput = z.infer<typeof createUserInputSchema>;
