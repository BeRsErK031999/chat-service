import type { PrismaClient } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import { authenticateSseRequest } from '../src/modules/auth/authMiddleware.js';
import { createChatInternalToken } from '../src/modules/auth/tokenService.js';

const userId = '11111111-1111-4111-8111-111111111111';
const secret = 'test-chat-internal-auth-secret-32-chars-min';

const buildToken = (ttlSeconds = 900, issuedAt = Math.floor(Date.now() / 1000)): string => {

  return createChatInternalToken(
    {
      userId,
      displayName: 'Artem',
      issuedAt,
      expiresAt: issuedAt + ttlSeconds,
      source: 'desktop',
    },
    secret,
  );
};

const buildPrisma = (): PrismaClient =>
  ({
    room: {
      findMany: () => Promise.resolve([]),
    },
  }) as unknown as PrismaClient;

describe('internal auth bridge', () => {
  beforeEach(() => {
    vi.stubEnv('CHAT_INTERNAL_AUTH_SECRET', secret);
    vi.stubEnv('CHAT_ALLOW_DEV_USER_ID', 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('allows API requests with a valid bearer token', async () => {
    const app = await buildApp({ prismaClient: buildPrisma() });

    const response = await app.inject({
      method: 'GET',
      url: '/rooms',
      headers: {
        authorization: `Bearer ${buildToken()}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);

    await app.close();
  });

  it('rejects bearer tokens with an invalid signature', async () => {
    const app = await buildApp({ prismaClient: buildPrisma() });
    const token = buildToken();
    const invalidToken = `${token.slice(0, -1)}x`;

    const response = await app.inject({
      method: 'GET',
      url: '/rooms',
      headers: {
        authorization: `Bearer ${invalidToken}`,
      },
    });

    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it('rejects expired bearer tokens', async () => {
    const app = await buildApp({ prismaClient: buildPrisma() });

    const response = await app.inject({
      method: 'GET',
      url: '/rooms',
      headers: {
        authorization: `Bearer ${buildToken(999, Math.floor(Date.now() / 1000) - 1000)}`,
      },
    });

    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it('rejects protected API requests without auth', async () => {
    const app = await buildApp({ prismaClient: buildPrisma() });

    const response = await app.inject({
      method: 'GET',
      url: '/rooms',
    });

    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it('allows dev x-user-id only when explicitly enabled', async () => {
    const app = await buildApp({ prismaClient: buildPrisma() });

    const disabledResponse = await app.inject({
      method: 'GET',
      url: '/rooms',
      headers: {
        'x-user-id': userId,
      },
    });

    expect(disabledResponse.statusCode).toBe(401);

    vi.stubEnv('CHAT_ALLOW_DEV_USER_ID', 'true');

    const enabledResponse = await app.inject({
      method: 'GET',
      url: '/rooms',
      headers: {
        'x-user-id': userId,
      },
    });

    expect(enabledResponse.statusCode).toBe(200);

    await app.close();
  });

  it('authenticates SSE requests with accessToken query fallback', () => {
    const request = {
      headers: {},
      query: {
        accessToken: buildToken(),
      },
    };

    void authenticateSseRequest(request as Parameters<typeof authenticateSseRequest>[0]);

    expect(request).toMatchObject({
      user: {
        id: userId,
        displayName: 'Artem',
        source: 'desktop',
      },
    });
  });
});
