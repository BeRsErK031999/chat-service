import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import { UnauthorizedError } from '../../shared/errors.js';
import type { AuthenticatedUser } from './authTypes.js';
import { verifyChatInternalToken } from './tokenService.js';

const userIdHeaderSchema = z.string().uuid();

const isDevUserIdAllowed = (): boolean => {
  const configuredValue = process.env.CHAT_ALLOW_DEV_USER_ID;

  if (configuredValue !== undefined) {
    return configuredValue.toLowerCase() === 'true';
  }

  return process.env.NODE_ENV !== 'production';
};

const readHeader = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

export const getAuthenticatedUser = (request: FastifyRequest): AuthenticatedUser => {
  if (request.user === undefined) {
    throw new UnauthorizedError('Missing authenticated user.');
  }

  return request.user;
};

export const authenticateRequest = (request: FastifyRequest): Promise<void> => {
  const authorization = readHeader(request.headers.authorization);

  if (authorization !== undefined) {
    const [scheme, token, extraPart] = authorization.split(' ');

    if (scheme !== 'Bearer' || token === undefined || extraPart !== undefined) {
      throw new UnauthorizedError('Invalid Authorization header.');
    }

    const payload = verifyChatInternalToken(token, process.env.CHAT_INTERNAL_AUTH_SECRET);
    request.user = {
      id: payload.userId,
      displayName: payload.displayName,
      source: payload.source,
    };
    return Promise.resolve();
  }

  if (isDevUserIdAllowed()) {
    const userId = readHeader(request.headers['x-user-id']);

    if (userId !== undefined) {
      request.user = {
        id: userIdHeaderSchema.parse(userId),
      };
      return Promise.resolve();
    }
  }

  throw new UnauthorizedError('Missing Authorization Bearer token.');
};

export const authenticateSseRequest = (request: FastifyRequest): Promise<void> => {
  const query = z
    .object({
      accessToken: z.string().min(1).optional(),
      userId: z.string().uuid().optional(),
    })
    .parse(request.query);
  const authorization = readHeader(request.headers.authorization);

  if (authorization !== undefined || query.accessToken === undefined) {
    if (authorization === undefined && isDevUserIdAllowed() && query.userId !== undefined) {
      request.user = {
        id: query.userId,
      };
      return Promise.resolve();
    }

    return authenticateRequest(request);
  }

  const payload = verifyChatInternalToken(query.accessToken, process.env.CHAT_INTERNAL_AUTH_SECRET);
  request.user = {
    id: payload.userId,
    displayName: payload.displayName,
    source: payload.source,
  };

  return Promise.resolve();
};
