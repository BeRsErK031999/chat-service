import type { FastifyInstance } from 'fastify';

const defaultDevCorsOrigins = [
  'http://localhost:5173',
  'http://localhost:5175',
  'http://localhost:4101',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5175',
  'http://127.0.0.1:4101',
];

const allowedMethods = 'GET,POST,PATCH,PUT,DELETE,OPTIONS';
const allowedHeaders = 'content-type,x-user-id,idempotency-key,authorization';

const readHeader = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const isPrivateNetworkPreflight = (value: string | string[] | undefined): boolean =>
  readHeader(value)?.toLowerCase() === 'true';

export const parseCorsAllowedOrigins = (): Set<string> => {
  const configuredOrigins = (
    process.env.CORS_ALLOWED_ORIGINS ?? process.env.CHAT_CORS_ALLOWED_ORIGINS
  )
    ?.split(',')
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

export const getCorsResponseHeaders = (
  originHeader: string | string[] | undefined,
): Record<string, string> => {
  const origin = readHeader(originHeader);

  if (origin === undefined || !parseCorsAllowedOrigins().has(origin)) {
    return {};
  }

  return {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    vary: 'Origin',
  };
};

export const registerCors = (app: FastifyInstance): void => {
  app.addHook('onRequest', (request, reply, done) => {
    const headers = getCorsResponseHeaders(request.headers.origin);

    for (const [name, value] of Object.entries(headers)) {
      reply.header(name, value);
    }

    done();
  });

  app.options('*', async (request, reply) => {
    const headers = getCorsResponseHeaders(request.headers.origin);

    for (const [name, value] of Object.entries(headers)) {
      reply.header(name, value);
    }

    if (
      Object.keys(headers).length > 0 &&
      isPrivateNetworkPreflight(request.headers['access-control-request-private-network'])
    ) {
      reply.header('access-control-allow-private-network', 'true');
    }

    reply
      .header('access-control-allow-methods', allowedMethods)
      .header('access-control-allow-headers', allowedHeaders)
      .status(204)
      .send();
  });
};
