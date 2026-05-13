import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import { UnauthorizedError } from '../errors.js';
import type { AuthenticatedUser } from './authTypes.js';

const userIdHeaderSchema = z.string().uuid();

export const getAuthenticatedUser = (request: FastifyRequest): AuthenticatedUser => {
  if (request.user === undefined) {
    throw new UnauthorizedError('Missing x-user-id header.');
  }

  return request.user;
};

export const requireDevAuth = (request: FastifyRequest): Promise<void> => {
  const header = request.headers['x-user-id'];
  const userId = Array.isArray(header) ? header[0] : header;

  if (userId === undefined) {
    throw new UnauthorizedError('Missing x-user-id header.');
  }

  request.user = {
    id: userIdHeaderSchema.parse(userId),
  };

  return Promise.resolve();
};
