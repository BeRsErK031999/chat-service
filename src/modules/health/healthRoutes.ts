import type { FastifyInstance } from 'fastify';

export const registerHealthRoutes = (app: FastifyInstance): void => {
  app.get('/health', () => ({
    status: 'ok',
  }));

  app.get('/ready', () => ({
    status: 'ready',
  }));
};
