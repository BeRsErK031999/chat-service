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
});
