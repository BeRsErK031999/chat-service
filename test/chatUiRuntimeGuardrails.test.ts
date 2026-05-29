import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  getActivityItemKeyboardAction,
  getRelativeActivityItemId,
} from '../frontend/src/chat-ui/components/activityKeyboard.js';
import {
  buildRuntimeAssertionStatuses,
  buildRuntimeDiagnosticsSnapshot,
  describeActivityItem,
} from '../frontend/src/chat-ui/devRuntimeDiagnostics.js';
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

  it('builds a safe runtime diagnostics snapshot from existing diagnostics', () => {
    const diagnostics = [
      diagnostic({
        kind: 'connected',
        status: 'connected',
        activeEventSourceCount: 1,
        reconnectAttemptCount: 1,
        lastConnectedAt: '2026-05-26T11:00:00.000Z',
      }),
      diagnostic({
        kind: 'duplicate_event',
        status: 'connected',
        eventName: 'message.created',
        activeEventSourceCount: 1,
      }),
      diagnostic({
        kind: 'reconnect_failed',
        status: 'disconnected',
        reconnectAttemptCount: 2,
        reconnectFailureCount: 1,
        activeEventSourceCount: 1,
      }),
    ];

    expect(buildRuntimeDiagnosticsSnapshot(diagnostics, 'connected')).toEqual({
      eventSourceState: 'disconnected',
      activeEventSourceCount: 1,
      reconnectCount: 2,
      lastConnectTime: '2026-05-26T11:00:00.000Z',
      lastReconnectTime: '2026-05-26T11:00:00.000Z',
      leakMarkers: 0,
      duplicateEventCount: 1,
      duplicateConnectionPreventionCount: 0,
      reconnectFailedCount: 1,
    });
  });

  it('reports runtime assertion PASS and FAIL without throwing into the UI layer', () => {
    expect(
      buildRuntimeAssertionStatuses([
        diagnostic({ kind: 'connected', activeEventSourceCount: 1 }),
      ]),
    ).toEqual([
      { name: 'assertSingleEventSource', status: 'PASS', detail: 'ok' },
      { name: 'assertNoLeakMarkers', status: 'PASS', detail: 'ok' },
      { name: 'assertNoTokenDiagnostics', status: 'PASS', detail: 'ok' },
      { name: 'assertRuntimeDiagnosticsSafe', status: 'PASS', detail: 'ok' },
    ]);

    const failedStatuses = buildRuntimeAssertionStatuses([
      diagnostic({ kind: 'connected', activeEventSourceCount: 2 }),
    ]);

    expect(failedStatuses[0]).toMatchObject({
      name: 'assertSingleEventSource',
      status: 'FAIL',
    });
    expect(failedStatuses[3]).toMatchObject({
      name: 'assertRuntimeDiagnosticsSafe',
      status: 'FAIL',
    });
  });

  it('keeps diagnostics panel activity descriptions free of message bodies and titles', () => {
    expect(
      describeActivityItem({
        ...notificationActivity,
        title: 'Authorization bearer should stay hidden',
        summary: 'accessToken secret should stay hidden',
      }),
    ).toBe('id:notification:notification-1 | kind:notification | room:room-1');
  });

  it('gates the diagnostics panel behind VITE_CHAT_DIAGNOSTICS', () => {
    const chatWidgetPath = fileURLToPath(
      new URL('../frontend/src/chat-ui/ChatWidget.tsx', import.meta.url),
    );
    const panelPath = fileURLToPath(
      new URL('../frontend/src/chat-ui/components/DevRuntimeDiagnosticsPanel.tsx', import.meta.url),
    );
    const helperPath = fileURLToPath(
      new URL('../frontend/src/chat-ui/devRuntimeDiagnostics.ts', import.meta.url),
    );
    const chatWidgetSource = readFileSync(chatWidgetPath, 'utf8');
    const panelSource = readFileSync(panelPath, 'utf8');
    const helperSource = readFileSync(helperPath, 'utf8');

    expect(helperSource).toContain("VITE_CHAT_DIAGNOSTICS === 'true'");
    expect(chatWidgetSource).toContain('CHAT_DIAGNOSTICS_ENABLED ? (');
    expect(panelSource).toContain('data-chat-diagnostics-panel="true"');
    expect(panelSource).not.toContain('accessToken');
    expect(panelSource).not.toContain('Authorization');
    expect(panelSource).not.toContain('bearer');
    expect(panelSource).not.toContain('CHAT_INTERNAL_AUTH_SECRET');
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
