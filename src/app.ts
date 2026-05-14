import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import type { PrismaClient } from '@prisma/client';

import { registerEventRoutes } from './modules/events/eventRoutes.js';
import { sseConnectionManager } from './modules/events/sseConnectionManager.js';
import type { SseConnectionManager } from './modules/events/sseConnectionManager.js';
import { registerHealthRoutes } from './modules/health/healthRoutes.js';
import { registerNotificationRoutes } from './modules/notifications/notificationRoutes.js';
import { registerRoomRoutes } from './modules/rooms/roomRoutes.js';
import { prisma } from './persistence/prismaClient.js';
import { AppError } from './shared/errors.js';

export type BuildAppOptions = {
  prismaClient?: PrismaClient;
  sseManager?: SseConnectionManager;
};

const defaultDevCorsOrigins = [
  'http://localhost:5173',
  'http://localhost:4101',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:4101',
];

const parseCorsAllowedOrigins = (): Set<string> => {
  const configuredOrigins = process.env.CORS_ALLOWED_ORIGINS?.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  const origins =
    configuredOrigins && configuredOrigins.length > 0
      ? configuredOrigins
      : process.env.NODE_ENV === 'production'
        ? []
        : defaultDevCorsOrigins;

  return new Set(origins);
};

const registerCors = (app: FastifyInstance): void => {
  const allowedOrigins = parseCorsAllowedOrigins();
  const allowedMethods = 'GET,POST,PATCH,PUT,DELETE,OPTIONS';
  const allowedHeaders = 'content-type,x-user-id,idempotency-key,authorization';

  app.addHook('onRequest', (request, reply, done) => {
    const origin = request.headers.origin;

    if (origin !== undefined && allowedOrigins.has(origin)) {
      reply.header('access-control-allow-origin', origin);
      reply.header('access-control-allow-credentials', 'true');
      reply.header('vary', 'Origin');
    }

    done();
  });

  app.options('*', async (_request, reply) => {
    reply
      .header('access-control-allow-methods', allowedMethods)
      .header('access-control-allow-headers', allowedHeaders)
      .status(204)
      .send();
  });
};

export const buildApp = async (options: BuildAppOptions = {}): Promise<FastifyInstance> => {
  const app = Fastify({
    logger: false,
  });
  const prismaClient = options.prismaClient ?? prisma;
  const manager = options.sseManager ?? sseConnectionManager;

  registerCors(app);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      void reply.status(400).send({
        error: 'ValidationError',
        message: error.message,
      });
      return;
    }

    if (error instanceof AppError) {
      void reply.status(error.statusCode).send({
        error: error.name,
        message: error.message,
      });
      return;
    }

    void reply.status(500).send({
      error: 'InternalServerError',
      message: 'Unexpected server error.',
    });
  });

  registerHealthRoutes(app);
  registerEventRoutes(app, prismaClient, manager);
  registerRoomRoutes(app, prismaClient, manager);
  registerNotificationRoutes(app, prismaClient, manager);

  return app;
};
