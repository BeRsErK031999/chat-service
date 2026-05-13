import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';

import { getAuthenticatedUser, requireDevAuth } from '../../shared/auth/devAuth.js';
import {
  listNotificationsForUser,
  markNotificationRead,
} from './notificationService.js';
import {
  listNotificationsQuerySchema,
  notificationIdParamsSchema,
} from './notificationSchemas.js';

export const registerNotificationRoutes = (
  app: FastifyInstance,
  prisma: PrismaClient,
): void => {
  app.get('/notifications', { preHandler: requireDevAuth }, async (request) => {
    const user = getAuthenticatedUser(request);
    const query = listNotificationsQuerySchema.parse(request.query);

    return listNotificationsForUser(prisma, user.id, query.state, query.limit);
  });

  app.post('/notifications/:id/read', { preHandler: requireDevAuth }, async (request) => {
    const user = getAuthenticatedUser(request);
    const params = notificationIdParamsSchema.parse(request.params);

    return markNotificationRead(prisma, params.id, user.id);
  });
};
