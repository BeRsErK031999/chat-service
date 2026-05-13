import type { Prisma, PrismaClient, User } from '@prisma/client';

import { createUserInputSchema } from './userTypes.js';
import type { CreateUserInput } from './userTypes.js';

export const createUser = async (prisma: PrismaClient, input: CreateUserInput): Promise<User> => {
  const data = createUserInputSchema.parse(input);
  const userData: Prisma.UserCreateInput = {
    externalUserId: data.externalUserId ?? null,
    email: data.email ?? null,
    displayName: data.displayName,
    avatarUrl: data.avatarUrl ?? null,
    role: data.role,
    status: data.status,
    authSource: data.authSource,
  };

  return prisma.user.create({
    data: userData,
  });
};
