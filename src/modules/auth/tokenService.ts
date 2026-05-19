import { createHmac, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

import { UnauthorizedError } from '../../shared/errors.js';
import type { ChatInternalTokenPayload } from './authTypes.js';

const jwtHeader = {
  alg: 'HS256',
  typ: 'JWT',
} as const;

const jwtHeaderSchema = z.object({
  alg: z.literal('HS256'),
  typ: z.literal('JWT'),
});

const tokenPayloadSchema = z.object({
  userId: z.string().min(1),
  displayName: z.string().min(1),
  issuedAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
  source: z.enum(['desktop', 'web']),
});

const encodeBase64Url = (value: Buffer | string): string =>
  Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

const decodeBase64UrlJson = (value: string): unknown =>
  JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));

const sign = (value: string, secret: string): string =>
  createHmac('sha256', secret).update(value).digest('base64url');

const signaturesMatch = (actual: string, expected: string): boolean => {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
};

export const createChatInternalToken = (
  payload: ChatInternalTokenPayload,
  secret: string,
): string => {
  const parsedPayload = tokenPayloadSchema.parse(payload);

  if (parsedPayload.expiresAt <= parsedPayload.issuedAt) {
    throw new UnauthorizedError('Token expiration must be after issuedAt.');
  }

  const encodedHeader = encodeBase64Url(JSON.stringify(jwtHeader));
  const encodedPayload = encodeBase64Url(JSON.stringify(parsedPayload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  return `${signingInput}.${sign(signingInput, secret)}`;
};

export const verifyChatInternalToken = (
  token: string,
  secret: string | undefined,
  now = Math.floor(Date.now() / 1000),
): ChatInternalTokenPayload => {
  if (secret === undefined || secret.trim().length === 0) {
    throw new UnauthorizedError('CHAT_INTERNAL_AUTH_SECRET is not configured.');
  }

  const [encodedHeader, encodedPayload, signature, extraPart] = token.split('.');

  if (
    encodedHeader === undefined ||
    encodedPayload === undefined ||
    signature === undefined ||
    extraPart !== undefined
  ) {
    throw new UnauthorizedError('Invalid auth token.');
  }

  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = sign(signingInput, secret);

  if (!signaturesMatch(signature, expectedSignature)) {
    throw new UnauthorizedError('Invalid auth token signature.');
  }

  try {
    jwtHeaderSchema.parse(decodeBase64UrlJson(encodedHeader));
    const payload = tokenPayloadSchema.parse(decodeBase64UrlJson(encodedPayload));

    if (payload.expiresAt <= now) {
      throw new UnauthorizedError('Auth token has expired.');
    }

    return payload;
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      throw error;
    }

    throw new UnauthorizedError('Invalid auth token payload.');
  }
};
