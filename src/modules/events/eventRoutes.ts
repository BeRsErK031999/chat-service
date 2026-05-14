import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';

import { eventsQuerySchema } from './eventTypes.js';
import { sseConnectionManager } from './sseConnectionManager.js';
import type { SseConnectionManager } from './sseConnectionManager.js';
import { isCorsOriginAllowed } from '../../config/cors.js';
import { UnauthorizedError } from '../../shared/errors.js';

export const registerEventRoutes = (
  app: FastifyInstance,
  _prisma: PrismaClient,
  manager: SseConnectionManager = sseConnectionManager,
): void => {
  app.get('/events', async (request, reply) => {
    const query = eventsQuerySchema.parse(request.query);
    const header = request.headers['x-user-id'];
    const headerUserId = Array.isArray(header) ? header[0] : header;
    const userId = headerUserId ?? query.userId;

    if (userId === undefined) {
      throw new UnauthorizedError('Missing x-user-id header or userId query parameter.');
    }

    const parsedUserId = eventsQuerySchema.shape.userId.unwrap().parse(userId);
    const origin = request.headers.origin;
    const corsHeaders =
      origin !== undefined && isCorsOriginAllowed(origin)
        ? {
            'access-control-allow-origin': origin,
            vary: 'Origin',
          }
        : {};

    reply.hijack();
    reply.raw.writeHead(200, {
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'content-type': 'text/event-stream; charset=utf-8',
      'x-accel-buffering': 'no',
      ...corsHeaders,
    });
    reply.raw.flushHeaders();
    manager.addConnection(parsedUserId, reply.raw);
  });
};
