import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import type { PrismaClient } from '@prisma/client';

import { registerHealthRoutes } from './modules/health/healthRoutes.js';
import { registerNotificationRoutes } from './modules/notifications/notificationRoutes.js';
import { registerRoomRoutes } from './modules/rooms/roomRoutes.js';
import { prisma } from './persistence/prismaClient.js';
import { AppError } from './shared/errors.js';

export type BuildAppOptions = {
  prismaClient?: PrismaClient;
};

export const buildApp = async (options: BuildAppOptions = {}): Promise<FastifyInstance> => {
  const app = Fastify({
    logger: false,
  });
  const prismaClient = options.prismaClient ?? prisma;

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
  registerRoomRoutes(app, prismaClient);
  registerNotificationRoutes(app, prismaClient);

  return app;
};
