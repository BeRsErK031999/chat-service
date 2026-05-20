import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import type { PrismaClient } from '@prisma/client';

import { registerCors } from './config/cors.js';
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
