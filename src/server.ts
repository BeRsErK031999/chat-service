import { buildApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './shared/logger.js';

const start = async (): Promise<void> => {
  const app = await buildApp();

  try {
    await app.listen({
      host: '0.0.0.0',
      port: env.PORT,
    });

    logger.info({ port: env.PORT, authMode: env.AUTH_MODE }, 'chat-service started');
  } catch (error) {
    logger.error({ error }, 'chat-service failed to start');
    process.exitCode = 1;
  }
};

void start();
