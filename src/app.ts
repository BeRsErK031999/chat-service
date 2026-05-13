import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { registerHealthRoutes } from './modules/health/healthRoutes.js';
import { AppError } from './shared/errors.js';

export const buildApp = async (): Promise<FastifyInstance> => {
  const app = Fastify({
    logger: false,
  });

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

  return app;
};
