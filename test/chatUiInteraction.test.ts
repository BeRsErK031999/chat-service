import { describe, expect, it } from 'vitest';

import {
  DEFAULT_INTERACTION_HINT_DEBOUNCE_MS,
  DEFAULT_INTERACTION_HINT_STALE_MS,
  createInteractionHintId,
  normalizeInteractionHint,
  pruneStaleInteractionHints,
  shouldEmitInteractionHint,
} from '../frontend/src/chat-ui/interaction.js';

describe('chat UI interaction hints', () => {
  it('normalizes minimal active room hints with debounce and stale metadata', () => {
    expect(
      normalizeInteractionHint(
        {
          kind: 'active_in_room',
          roomId: ' room-1 ',
          userId: ' user-1 ',
          taskId: ' task-1 ',
        },
        new Date('2026-05-26T10:00:00.000Z'),
      ),
    ).toEqual({
      id: 'active_in_room:room-1:user-1',
      kind: 'active_in_room',
      roomId: 'room-1',
      userId: 'user-1',
      taskId: 'task-1',
      occurredAt: '2026-05-26T10:00:00.000Z',
      expiresAt: '2026-05-26T10:00:10.000Z',
      debounceMs: DEFAULT_INTERACTION_HINT_DEBOUNCE_MS,
      staleAfterMs: DEFAULT_INTERACTION_HINT_STALE_MS,
    });
  });

  it('drops hints without room or user identity', () => {
    expect(normalizeInteractionHint({ kind: 'typing', roomId: '', userId: 'user-1' })).toBeNull();
    expect(normalizeInteractionHint({ kind: 'typing', roomId: 'room-1', userId: ' ' })).toBeNull();
  });

  it('expires stale hints without persistence', () => {
    const activeHint = normalizeInteractionHint(
      {
        kind: 'typing',
        roomId: 'room-1',
        userId: 'user-1',
        staleAfterMs: 5_000,
      },
      new Date('2026-05-26T10:00:00.000Z'),
    );
    const staleHint = normalizeInteractionHint(
      {
        kind: 'viewing',
        roomId: 'room-1',
        userId: 'user-2',
        staleAfterMs: 1_000,
      },
      new Date('2026-05-26T09:59:00.000Z'),
    );

    expect(
      pruneStaleInteractionHints(
        [activeHint, staleHint].filter((hint): hint is NonNullable<typeof hint> => hint !== null),
        new Date('2026-05-26T10:00:02.000Z'),
      ).map((hint) => hint.id),
    ).toEqual(['typing:room-1:user-1']);
  });

  it('prevents noisy repeated updates inside the debounce window', () => {
    const previous = normalizeInteractionHint(
      {
        kind: 'typing',
        roomId: 'room-1',
        userId: 'user-1',
        debounceMs: 3_000,
      },
      new Date('2026-05-26T10:00:00.000Z'),
    );
    const next = normalizeInteractionHint(
      {
        kind: 'typing',
        roomId: 'room-1',
        userId: 'user-1',
        debounceMs: 3_000,
      },
      new Date('2026-05-26T10:00:02.000Z'),
    );

    expect(previous).not.toBeNull();
    expect(next).not.toBeNull();
    expect(shouldEmitInteractionHint(previous, next as NonNullable<typeof next>)).toBe(false);
  });

  it('emits when the room, user, or debounce window changes enough', () => {
    const previous = normalizeInteractionHint(
      { kind: 'typing', roomId: 'room-1', userId: 'user-1', debounceMs: 3_000 },
      new Date('2026-05-26T10:00:00.000Z'),
    );
    const next = normalizeInteractionHint(
      { kind: 'typing', roomId: 'room-1', userId: 'user-1', debounceMs: 3_000 },
      new Date('2026-05-26T10:00:03.000Z'),
    );

    expect(createInteractionHintId('viewing', 'room-1', 'user-1')).toBe('viewing:room-1:user-1');
    expect(shouldEmitInteractionHint(previous, next as NonNullable<typeof next>)).toBe(true);
  });
});
