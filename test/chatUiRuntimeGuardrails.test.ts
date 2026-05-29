import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  getActivityItemKeyboardAction,
  getRelativeActivityItemId,
} from '../frontend/src/chat-ui/components/activityKeyboard.js';
import {
  assertNoLeakMarkers,
  assertNoTokenDiagnostics,
  assertRuntimeDiagnosticsSafe,
  assertSingleEventSource,
} from '../frontend/src/chat-ui/runtimeAssertions.js';
import type { ChatActivityItem, ChatRealtimeDiagnostic } from '../frontend/src/chat-ui/types.js';

const notificationActivity: ChatActivityItem = {
  id: 'notification:notification-1',
  kind: 'notification',
  attentionState: 'attention-needed',
  target: {
    id: 'notification-1',
    roomId: 'room-1',
    messageId: 'message-1',
    source: 'notification',
  },
  notificationId: 'notification-1',
  roomId: 'room-1',
  messageId: 'message-1',
  title: 'New reply',
  summary: 'Reply preview',
  occurredAt: '2026-05-26T11:00:00.000Z',
  priority: 'HIGH',
};

const diagnostic = (
  input: Partial<ChatRealtimeDiagnostic> & Pick<ChatRealtimeDiagnostic, 'kind'>,
): ChatRealtimeDiagnostic => ({
  status: input.status ?? 'connected',
  timestamp: input.timestamp ?? '2026-05-26T11:00:00.000Z',
  ...input,
});

describe('chat UI runtime regression guardrails', () => {
  it('keeps ActivityPanel keyboard actions executable without trapping focus', () => {
    expect(getActivityItemKeyboardAction({ key: 'Enter' }, notificationActivity)).toEqual({
      type: 'ignore',
    });
    expect(getActivityItemKeyboardAction({ key: 'c', ctrlKey: true }, notificationActivity)).toEqual({
      type: 'copy-reference',
    });
    expect(getActivityItemKeyboardAction({ key: 'c', metaKey: true }, notificationActivity)).toEqual({
      type: 'copy-reference',
    });
    expect(
      getActivityItemKeyboardAction({ key: 'Enter', shiftKey: true }, notificationActivity),
    ).toEqual({
      type: 'mark-read',
      notificationId: 'notification-1',
    });
    expect(getActivityItemKeyboardAction({ key: 'Escape' }, notificationActivity)).toEqual({
      type: 'restore-focus',
    });
  });

  it('traverses activity items with stable wraparound focus targets', () => {
    const itemIds = ['activity-1', 'activity-2', 'activity-3'];

    expect(getRelativeActivityItemId(itemIds, 'activity-1', 1)).toBe('activity-2');
    expect(getRelativeActivityItemId(itemIds, 'activity-1', -1)).toBe('activity-3');
    expect(getRelativeActivityItemId(itemIds, 'missing-activity', 1)).toBe('activity-1');
    expect(getRelativeActivityItemId(itemIds, 'missing-activity', -1)).toBe('activity-3');
  });

  it('allows workflow activity cycling to reuse the same activity ordering helpers', () => {
    expect(getActivityItemKeyboardAction({ key: 'ArrowDown' }, notificationActivity)).toEqual({
      type: 'focus-relative',
      direction: 1,
    });
    expect(getActivityItemKeyboardAction({ key: 'ArrowUp' }, notificationActivity)).toEqual({
      type: 'focus-relative',
      direction: -1,
    });
  });

  it('rejects token-like diagnostics and raw auth header payloads', () => {
    expect(() =>
      assertNoTokenDiagnostics([
        diagnostic({ kind: 'connected', selectedRoomId: 'room-1', activeEventSourceCount: 1 }),
      ]),
    ).not.toThrow();
    expect(() =>
      assertNoTokenDiagnostics({
        kind: 'connected',
        accessToken: 'secret-token',
      }),
    ).toThrow(/sensitive token material/);
    expect(() =>
      assertNoTokenDiagnostics({
        headers: {
          Authorization: 'Bearer secret-token',
        },
      }),
    ).toThrow(/sensitive token material/);
  });

  it('asserts a single EventSource and no duplicate connection leak markers', () => {
    const diagnostics = [
      diagnostic({ kind: 'connect_start', activeEventSourceCount: 0 }),
      diagnostic({ kind: 'connected', activeEventSourceCount: 1 }),
      diagnostic({ kind: 'room_switched', selectedRoomId: 'room-2', activeEventSourceCount: 1 }),
      diagnostic({
        kind: 'navigation_target_restored',
        selectedRoomId: 'room-2',
        activeEventSourceCount: 1,
      }),
    ];

    expect(() => assertRuntimeDiagnosticsSafe(diagnostics)).not.toThrow();
    expect(() =>
      assertSingleEventSource([
        diagnostic({ kind: 'connected', activeEventSourceCount: 2 }),
      ]),
    ).toThrow(/at most one active EventSource/);
    expect(() =>
      assertNoLeakMarkers([
        diagnostic({ kind: 'duplicate_connection_prevented', duplicateConnectionPreventionCount: 1 }),
      ]),
    ).toThrow(/leak markers/);
  });

  it('keeps selected room changes out of EventSource creation dependencies', () => {
    const realtimeHookPath = fileURLToPath(
      new URL('../frontend/src/chat-ui/hooks/useChatRealtime.ts', import.meta.url),
    );
    const source = readFileSync(realtimeHookPath, 'utf8');

    expect(source).toContain('new EventSource(client.getEventsUrl())');
    expect(source).toContain('}, [client, connectionVersion, enabled]);');
    expect(source).not.toContain('}, [client, connectionVersion, enabled, selectedRoomId]);');
  });

  it('keeps ChatWidget continuity controls wired after navigation restore', () => {
    const chatWidgetPath = fileURLToPath(
      new URL('../frontend/src/chat-ui/ChatWidget.tsx', import.meta.url),
    );
    const source = readFileSync(chatWidgetPath, 'utf8');

    expect(source).toContain('onOpenRecentTask={selectRecentTaskRoom}');
    expect(source).toContain('selectRoom(lastActiveRoomIdRef.current, { preserveLastActive: true })');
    expect(source).toContain('selectedRoomId === focusedNavigationTarget?.roomId');
    expect(source).toContain('highlightedMessageId: focusedNavigationTarget.messageId');
    expect(source).toContain('selectRelativeActivityItem(workflowActivityItems, 1)');
    expect(source).toContain('selectRelativeActivityItem(workflowActivityItems, -1)');
  });
});
