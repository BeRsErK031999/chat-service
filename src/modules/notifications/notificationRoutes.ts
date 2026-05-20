import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';

import { publishNotificationRead } from '../events/eventPublisher.js';
import { sseConnectionManager } from '../events/sseConnectionManager.js';
import type { SseConnectionManager } from '../events/sseConnectionManager.js';
import {
  authenticateRequest,
  getAuthenticatedUser,
} from '../auth/authMiddleware.js';
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
  eventManager: SseConnectionManager = sseConnectionManager,
): void => {
  app.get('/notifications', { preHandler: authenticateRequest }, async (request) => {
    const user = getAuthenticatedUser(request);
    const query = listNotificationsQuerySchema.parse(request.query);

    return listNotificationsForUser(prisma, user.id, query.state, query.limit);
  });

  app.post('/notifications/:id/read', { preHandler: authenticateRequest }, async (request) => {
    const user = getAuthenticatedUser(request);
    const params = notificationIdParamsSchema.parse(request.params);

    const notification = await markNotificationRead(prisma, params.id, user.id);
    publishNotificationRead(notification, eventManager);

    return notification;
  });
};
