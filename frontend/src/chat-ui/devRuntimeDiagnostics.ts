import {
  assertNoLeakMarkers,
  assertNoTokenDiagnostics,
  assertRuntimeDiagnosticsSafe,
  assertSingleEventSource,
} from './runtimeAssertions.js';
import type {
  ChatActivityItem,
  ChatRealtimeDiagnostic,
  NormalizedChatWidgetNavigationTarget,
  RealtimeStatus,
} from './types.js';

type DiagnosticsImportMeta = ImportMeta & {
  readonly env?: {
    readonly VITE_CHAT_DIAGNOSTICS?: string;
  };
};

export const CHAT_DIAGNOSTICS_ENABLED =
  (import.meta as DiagnosticsImportMeta).env?.VITE_CHAT_DIAGNOSTICS === 'true';

export type RuntimeAssertionStatus = {
  name: string;
  status: 'PASS' | 'FAIL';
  detail: string;
};

export type RuntimeDiagnosticsSnapshot = {
  eventSourceState: RealtimeStatus;
  activeEventSourceCount: number;
  reconnectCount: number;
  lastConnectTime: string;
  lastReconnectTime: string;
  leakMarkers: number;
  duplicateEventCount: number;
  duplicateConnectionPreventionCount: number;
  reconnectFailedCount: number;
};

const missingValue = '-';

const countDiagnostics = (
  diagnostics: readonly ChatRealtimeDiagnostic[],
  kind: ChatRealtimeDiagnostic['kind'],
): number => diagnostics.filter((diagnostic) => diagnostic.kind === kind).length;

const getLatestNumber = (
  diagnostics: readonly ChatRealtimeDiagnostic[],
  key: keyof Pick<
    ChatRealtimeDiagnostic,
    | 'activeEventSourceCount'
    | 'reconnectAttemptCount'
    | 'reconnectFailureCount'
    | 'duplicateConnectionPreventionCount'
  >,
): number => {
  for (const diagnostic of [...diagnostics].reverse()) {
    const value = diagnostic[key];

    if (typeof value === 'number') {
      return value;
    }
  }

  return 0;
};

const getLatestTimestamp = (
  diagnostics: readonly ChatRealtimeDiagnostic[],
  predicate: (diagnostic: ChatRealtimeDiagnostic) => boolean,
): string => {
  const diagnostic = [...diagnostics].reverse().find(predicate);
  return diagnostic?.timestamp ?? missingValue;
};

export const buildRuntimeDiagnosticsSnapshot = (
  diagnostics: readonly ChatRealtimeDiagnostic[],
  fallbackStatus: RealtimeStatus,
): RuntimeDiagnosticsSnapshot => {
  const latest = diagnostics[diagnostics.length - 1];
  const duplicateConnectionPreventionCount = getLatestNumber(
    diagnostics,
    'duplicateConnectionPreventionCount',
  );

  return {
    eventSourceState: latest?.status ?? fallbackStatus,
    activeEventSourceCount: getLatestNumber(diagnostics, 'activeEventSourceCount'),
    reconnectCount: getLatestNumber(diagnostics, 'reconnectAttemptCount'),
    lastConnectTime:
      latest?.lastConnectedAt ??
      getLatestTimestamp(diagnostics, (diagnostic) => diagnostic.kind === 'connected'),
    lastReconnectTime: getLatestTimestamp(
      diagnostics,
      (diagnostic) =>
        diagnostic.kind === 'reconnect_requested' ||
        diagnostic.kind === 'reconnect_succeeded' ||
        diagnostic.kind === 'reconnect_failed',
    ),
    leakMarkers: duplicateConnectionPreventionCount,
    duplicateEventCount: countDiagnostics(diagnostics, 'duplicate_event'),
    duplicateConnectionPreventionCount,
    reconnectFailedCount:
      getLatestNumber(diagnostics, 'reconnectFailureCount') ||
      countDiagnostics(diagnostics, 'reconnect_failed'),
  };
};

const runtimeAssertionChecks = [
  {
    name: 'assertSingleEventSource',
    run: assertSingleEventSource,
  },
  {
    name: 'assertNoLeakMarkers',
    run: assertNoLeakMarkers,
  },
  {
    name: 'assertNoTokenDiagnostics',
    run: assertNoTokenDiagnostics,
  },
  {
    name: 'assertRuntimeDiagnosticsSafe',
    run: assertRuntimeDiagnosticsSafe,
  },
] as const;

export const buildRuntimeAssertionStatuses = (
  diagnostics: readonly ChatRealtimeDiagnostic[],
): RuntimeAssertionStatus[] =>
  runtimeAssertionChecks.map((check) => {
    try {
      check.run(diagnostics);

      return {
        name: check.name,
        status: 'PASS',
        detail: 'ok',
      };
    } catch (error) {
      return {
        name: check.name,
        status: 'FAIL',
        detail: error instanceof Error ? error.message : 'runtime assertion failed',
      };
    }
  });

export const describeNavigationTarget = (
  target: NormalizedChatWidgetNavigationTarget | null,
): string => {
  if (target === null) {
    return missingValue;
  }

  return [
    target.roomId !== undefined ? `room:${target.roomId}` : undefined,
    target.messageId !== undefined ? `message:${target.messageId}` : undefined,
    target.taskId !== undefined ? `task:${target.taskId}` : undefined,
    target.source !== undefined ? `source:${target.source}` : undefined,
  ]
    .filter((value): value is string => value !== undefined)
    .join(' | ');
};

export const describeActivityItem = (item: ChatActivityItem | null): string => {
  if (item === null) {
    return missingValue;
  }

  return [
    `id:${item.id}`,
    `kind:${item.kind}`,
    item.roomId !== undefined ? `room:${item.roomId}` : undefined,
    item.taskId !== undefined ? `task:${item.taskId}` : undefined,
  ]
    .filter((value): value is string => value !== undefined)
    .join(' | ');
};
