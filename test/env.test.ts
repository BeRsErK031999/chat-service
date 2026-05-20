import { describe, expect, it, vi } from 'vitest';

describe('loadEnv', () => {
  it('parses a valid environment', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/chat_service');
    const { loadEnv } = await import('../src/config/env.js');
    const result = loadEnv({
      PORT: '4100',
      LOG_LEVEL: 'debug',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/chat_service',
      AUTH_MODE: 'integrated',
    });

    expect(result).toEqual({
      PORT: 4100,
      LOG_LEVEL: 'debug',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/chat_service',
      AUTH_MODE: 'integrated',
      CHAT_INTERNAL_AUTH_SECRET: undefined,
      CHAT_ALLOW_DEV_USER_ID: true,
    });
  });

  it('defaults optional runtime values', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/chat_service');
    const { loadEnv } = await import('../src/config/env.js');
    const result = loadEnv({
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/chat_service',
    });

    expect(result.PORT).toBe(3000);
    expect(result.LOG_LEVEL).toBe('info');
    expect(result.AUTH_MODE).toBe('standalone');
    expect(result.CHAT_ALLOW_DEV_USER_ID).toBe(true);
  });

  it('rejects unsupported auth modes', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/chat_service');
    const { loadEnv } = await import('../src/config/env.js');
    expect(() =>
      loadEnv({
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/chat_service',
        AUTH_MODE: 'local',
      }),
    ).toThrow();
  });
});
