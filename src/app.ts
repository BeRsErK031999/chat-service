import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { ZodError } from 'zod';
import type { PrismaClient } from '@prisma/client';

import {
  CORS_ALLOWED_HEADERS,
  CORS_ALLOWED_METHODS,
  isCorsOriginAllowed,
  parseChatCorsAllowedOrigins,
} from './config/cors.js';
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

const registerCors = async (app: FastifyInstance): Promise<void> => {
  const allowedOrigins = parseChatCorsAllowedOrigins(process.env);

  await app.register(cors, {
    origin: (origin, callback) => {
      if (isCorsOriginAllowed(origin, allowedOrigins)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    credentials: false,
    methods: [...CORS_ALLOWED_METHODS],
    allowedHeaders: [...CORS_ALLOWED_HEADERS],
  });
};

export const buildApp = async (options: BuildAppOptions = {}): Promise<FastifyInstance> => {
  const app = Fastify({
    logger: false,
  });
  const prismaClient = options.prismaClient ?? prisma;
  const manager = options.sseManager ?? sseConnectionManager;

  await registerCors(app);

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
