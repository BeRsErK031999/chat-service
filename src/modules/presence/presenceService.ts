import type { PrismaClient } from '@prisma/client';

import type { SseConnectionManager } from '../events/sseConnectionManager.js';

type PresenceStatus = 'online' | 'offline';

const listPresenceRecipients = async (
  prisma: PrismaClient,
  userId: string,
): Promise<string[]> => {
  const memberships = await prisma.roomMember.findMany({
    where: {
      userId,
      leftAt: null,
    },
    select: {
      roomId: true,
    },
  });

  const roomIds = memberships.map((membership) => membership.roomId);

  if (roomIds.length === 0) {
    return [userId];
  }

  const recipients = await prisma.roomMember.findMany({
    where: {
      roomId: {
        in: roomIds,
      },
      leftAt: null,
    },
    select: {
      userId: true,
    },
  });

  return [...new Set([userId, ...recipients.map((recipient) => recipient.userId)])];
};

export const publishPresenceChanged = async (
  prisma: PrismaClient,
  userId: string,
  status: PresenceStatus,
  manager: SseConnectionManager,
): Promise<void> => {
  const now = new Date();

  await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      lastSeenAt: now,
    },
  });

  const recipients = await listPresenceRecipients(prisma, userId);

  for (const recipientId of recipients) {
    manager.sendToUser(recipientId, 'presence.changed', {
      userId,
      status,
      lastSeenAt: now.toISOString(),
    });
  }
};
