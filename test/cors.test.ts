import type { ServerResponse } from 'node:http';
import type { PrismaClient } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import { SseConnectionManager } from '../src/modules/events/sseConnectionManager.js';

const allowedOrigin = 'http://localhost:5175';
const disallowedOrigin = 'http://evil.example';
const userId = '11111111-1111-4111-8111-111111111111';
const roomId = '33333333-3333-4333-8333-333333333333';

const buildMockPrisma = (): PrismaClient =>
  ({
    roomMember: {
      findFirst: () => Promise.resolve({ id: 'member-1' }),
    },
    room: {
      findMany: () => Promise.resolve([]),
      findUnique: () =>
        Promise.resolve({
          type: 'DIRECT',
          taskRoomKind: null,
          isArchived: false,
        }),
    },
  }) as unknown as PrismaClient;

class CapturingSseManager extends SseConnectionManager {
  public response: ServerResponse | null = null;

  public override addConnection(userIdValue: string, response: ServerResponse): () => void {
    expect(userIdValue).toBe(userId);
    this.response = response;
    response.end();

    return () => undefined;
  }
}

describe('CORS', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const configureAllowedOrigins = (): void => {
    vi.stubEnv(
      'CHAT_CORS_ALLOWED_ORIGINS',
      'http://localhost:5175,http://127.0.0.1:5175,http://192.168.22.37',
    );
  };

  it('allows requests without Origin', async () => {
    configureAllowedOrigins();
    const app = await buildApp({ prismaClient: buildMockPrisma() });

    const response = await app.inject({
      method: 'GET',
      url: '/rooms',
      headers: {
        'x-user-id': userId,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();

    await app.close();
  });

  it('sets access-control-allow-origin for an allowed Origin', async () => {
    configureAllowedOrigins();
    const app = await buildApp({ prismaClient: buildMockPrisma() });

    const response = await app.inject({
      method: 'GET',
      url: '/rooms',
      headers: {
        origin: allowedOrigin,
        'x-user-id': userId,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe(allowedOrigin);
    expect(response.headers.vary).toContain('Origin');

    await app.close();
  });

  it('does not grant CORS to a disallowed Origin', async () => {
    configureAllowedOrigins();
    const app = await buildApp({ prismaClient: buildMockPrisma() });

    const response = await app.inject({
      method: 'GET',
      url: '/rooms',
      headers: {
        origin: disallowedOrigin,
        'x-user-id': userId,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();

    await app.close();
  });

  it('answers preflight for message create with allowed headers', async () => {
    configureAllowedOrigins();
    const app = await buildApp({ prismaClient: buildMockPrisma() });

    const response = await app.inject({
      method: 'OPTIONS',
      url: `/rooms/${roomId}/messages`,
      headers: {
        origin: allowedOrigin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type,x-user-id,idempotency-key',
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(allowedOrigin);
    expect(response.headers['access-control-allow-methods']).toContain('POST');
    expect(response.headers['access-control-allow-headers']).toContain('content-type');
    expect(response.headers['access-control-allow-headers']).toContain('x-user-id');
    expect(response.headers['access-control-allow-headers']).toContain('idempotency-key');

    await app.close();
  });

  it('sets CORS headers on SSE responses for an allowed Origin', async () => {
    configureAllowedOrigins();
    const manager = new CapturingSseManager();
    const app = await buildApp({
      prismaClient: buildMockPrisma(),
      sseManager: manager,
    });

    const response = await app.inject({
      method: 'GET',
      url: `/events?userId=${userId}`,
      headers: {
        origin: allowedOrigin,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.headers['x-accel-buffering']).toBe('no');
    expect(response.headers['access-control-allow-origin']).toBe(allowedOrigin);

    await app.close();
  });
});
