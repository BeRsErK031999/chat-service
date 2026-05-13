import { describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';

describe('health routes', () => {
  it('returns health status', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
    });

    await app.close();
  });

  it('returns readiness status', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/ready',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ready',
    });

    await app.close();
  });
});
