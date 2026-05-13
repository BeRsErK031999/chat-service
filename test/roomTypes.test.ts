import { RoomType, TaskRoomKind } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { canRoomAcceptUserMessages } from '../src/modules/rooms/roomTypes.js';

describe('canRoomAcceptUserMessages', () => {
  it('allows active task discussion rooms', () => {
    expect(
      canRoomAcceptUserMessages({
        type: RoomType.TASK,
        taskRoomKind: TaskRoomKind.INTERNAL,
        isArchived: false,
      }),
    ).toBe(true);
  });

  it('blocks archived rooms', () => {
    expect(
      canRoomAcceptUserMessages({
        type: RoomType.GROUP,
        taskRoomKind: null,
        isArchived: true,
      }),
    ).toBe(false);
  });

  it('blocks system rooms', () => {
    expect(
      canRoomAcceptUserMessages({
        type: RoomType.SYSTEM,
        taskRoomKind: null,
        isArchived: false,
      }),
    ).toBe(false);
  });

  it('blocks task system-events rooms', () => {
    expect(
      canRoomAcceptUserMessages({
        type: RoomType.TASK,
        taskRoomKind: TaskRoomKind.SYSTEM_EVENTS,
        isArchived: false,
      }),
    ).toBe(false);
  });
});
