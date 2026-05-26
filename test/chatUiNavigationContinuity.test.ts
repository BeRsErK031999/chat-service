import { afterEach, describe, expect, it } from 'vitest';

import {
  NAVIGATION_CONTINUITY_STORAGE_KEY,
  clearRememberedNavigationTarget,
  getRememberedNavigationTarget,
  getRememberedNavigationTargetResult,
  rememberNavigationTarget,
  restoreNavigationTargetFromCanonical,
} from '../frontend/src/chat-ui/navigationContinuity.js';
import { parseNavigationTarget } from '../frontend/src/chat-ui/navigation.js';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

class ThrowingStorage extends MemoryStorage {
  override getItem(): string | null {
    throw new Error('storage unavailable');
  }

  override setItem(): void {
    throw new Error('storage unavailable');
  }

  override removeItem(): void {
    throw new Error('storage unavailable');
  }
}

const setSessionStorage = (storage: Storage | undefined): void => {
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: storage,
  });
};

describe('chat UI navigation continuity', () => {
  afterEach(() => {
    clearRememberedNavigationTarget();
    setSessionStorage(undefined);
  });

  it('remembers only the canonical navigation target string and timestamp', () => {
    const storage = new MemoryStorage();
    setSessionStorage(storage);

    const remembered = rememberNavigationTarget({
      roomId: 'room-1',
      messageId: 'message-1',
      taskId: 'task-1',
      source: 'activity',
    });

    expect(remembered).toEqual({
      id: 'chat-nav:v1?roomId=room-1&messageId=message-1&taskId=task-1&source=activity',
      roomId: 'room-1',
      messageId: 'message-1',
      taskId: 'task-1',
      source: 'activity',
    });
    expect(storage.getItem(NAVIGATION_CONTINUITY_STORAGE_KEY)).toMatch(
      /"target":"chat-nav:v1\?roomId=room-1&messageId=message-1&taskId=task-1&source=activity"/,
    );
  });

  it('restores canonical targets with message highlight context', () => {
    rememberNavigationTarget({
      roomId: 'room-1',
      messageId: 'message-1',
      source: 'notification',
    });

    expect(getRememberedNavigationTarget()).toEqual({
      id: 'chat-nav:v1?roomId=room-1&messageId=message-1&source=notification',
      roomId: 'room-1',
      messageId: 'message-1',
      source: 'notification',
    });
  });

  it('skips malformed and stale stored values without throwing', () => {
    const storage = new MemoryStorage();
    setSessionStorage(storage);
    storage.setItem(NAVIGATION_CONTINUITY_STORAGE_KEY, 'not-json');

    expect(getRememberedNavigationTargetResult()).toEqual({
      status: 'failed',
      target: null,
    });

    storage.setItem(
      NAVIGATION_CONTINUITY_STORAGE_KEY,
      JSON.stringify({
        target: 'chat-nav:v1?roomId=room-1',
        rememberedAt: '2026-05-24T00:00:00.000Z',
      }),
    );

    expect(
      getRememberedNavigationTargetResult({
        maxAgeMs: 1000,
        now: new Date('2026-05-26T00:00:00.000Z'),
      }),
    ).toEqual({
      status: 'skipped',
      target: null,
    });
  });

  it('falls back to memory when session storage is unavailable', () => {
    setSessionStorage(new ThrowingStorage());

    rememberNavigationTarget({
      roomId: 'room-1',
      taskId: 'task-1',
      source: 'activity',
    });

    expect(getRememberedNavigationTarget()).toEqual({
      id: 'chat-nav:v1?roomId=room-1&taskId=task-1&source=activity',
      roomId: 'room-1',
      taskId: 'task-1',
      source: 'activity',
    });
  });

  it('keeps legacy query parsing available without accepting it as canonical restore storage', () => {
    expect(parseNavigationTarget('roomId=room-1&source=activity')).toEqual({
      id: 'chat-nav:v1?roomId=room-1&source=activity',
      roomId: 'room-1',
      source: 'activity',
    });
    expect(restoreNavigationTargetFromCanonical('roomId=room-1&source=activity')).toBeNull();
  });

  it('does not store sensitive fields or raw response data', () => {
    const storage = new MemoryStorage();
    setSessionStorage(storage);

    rememberNavigationTarget({
      roomId: 'room-1',
      messageId: 'message-1',
      taskId: 'task-1',
      source: 'notification',
    });

    const storedValue = storage.getItem(NAVIGATION_CONTINUITY_STORAGE_KEY) ?? '';

    expect(storedValue).not.toContain('bearer');
    expect(storedValue).not.toContain('accessToken');
    expect(storedValue).not.toContain('Authorization');
    expect(storedValue).not.toContain('displayName');
    expect(storedValue).not.toContain('body');
    expect(storedValue).not.toContain('secret');
  });
});
