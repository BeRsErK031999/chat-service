import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';

describe('CORS', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('allows origins configured by CORS_ALLOWED_ORIGINS', async () => {
    vi.stubEnv('CORS_ALLOWED_ORIGINS', 'http://192.168.22.31');
    const app = await buildApp();

    const response = await app.inject({
      method: 'OPTIONS',
      url: '/rooms',
      headers: {
        origin: 'http://192.168.22.31',
        'access-control-request-method': 'GET',
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('http://192.168.22.31');
    expect(response.headers['access-control-allow-credentials']).toBe('true');

    await app.close();
  });

  it('keeps the legacy CHAT_CORS_ALLOWED_ORIGINS fallback for existing server env files', async () => {
    vi.stubEnv('CHAT_CORS_ALLOWED_ORIGINS', 'http://192.168.22.37');
    const app = await buildApp();

    const response = await app.inject({
      method: 'OPTIONS',
      url: '/rooms',
      headers: {
        origin: 'http://192.168.22.37',
        'access-control-request-method': 'GET',
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('http://192.168.22.37');
    expect(response.headers['access-control-allow-credentials']).toBe('true');

    await app.close();
  });

  it('allows private network preflight requests for configured origins', async () => {
    vi.stubEnv('CORS_ALLOWED_ORIGINS', 'http://localhost:5175');
    const app = await buildApp();

    const response = await app.inject({
      method: 'OPTIONS',
      url: '/rooms',
      headers: {
        origin: 'http://localhost:5175',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'authorization,content-type',
        'access-control-request-private-network': 'true',
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5175');
    expect(response.headers['access-control-allow-private-network']).toBe('true');

    await app.close();
  });

  it('does not allow private network preflight requests for unknown origins', async () => {
    vi.stubEnv('CORS_ALLOWED_ORIGINS', 'http://localhost:5175');
    const app = await buildApp();

    const response = await app.inject({
      method: 'OPTIONS',
      url: '/rooms',
      headers: {
        origin: 'http://localhost:5176',
        'access-control-request-method': 'GET',
        'access-control-request-private-network': 'true',
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers['access-control-allow-private-network']).toBeUndefined();

    await app.close();
  });
});
