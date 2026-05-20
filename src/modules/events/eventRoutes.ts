import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';

import { getCorsResponseHeaders } from '../../config/cors.js';
import { eventsQuerySchema } from './eventTypes.js';
import { sseConnectionManager } from './sseConnectionManager.js';
import type { SseConnectionManager } from './sseConnectionManager.js';
import {
  authenticateSseRequest,
  getAuthenticatedUser,
} from '../auth/authMiddleware.js';

export const registerEventRoutes = (
  app: FastifyInstance,
  _prisma: PrismaClient,
  manager: SseConnectionManager = sseConnectionManager,
): void => {
  app.get('/events', { preHandler: authenticateSseRequest }, async (request, reply) => {
    eventsQuerySchema.parse(request.query);
    const user = getAuthenticatedUser(request);

    reply.hijack();
    reply.raw.writeHead(200, {
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'content-type': 'text/event-stream; charset=utf-8',
      'x-accel-buffering': 'no',
      ...getCorsResponseHeaders(request.headers.origin),
    });
    reply.raw.flushHeaders();
    manager.addConnection(user.id, reply.raw);
  });
};
