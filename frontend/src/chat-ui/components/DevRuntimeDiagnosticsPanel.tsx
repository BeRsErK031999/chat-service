import { useMemo } from 'react';
import type { ReactElement } from 'react';

import {
  buildRuntimeAssertionStatuses,
  buildRuntimeDiagnosticsSnapshot,
  describeActivityItem,
  describeNavigationTarget,
} from '../devRuntimeDiagnostics.js';
import type {
  ChatActivityItem,
  ChatRealtimeDiagnostic,
  NormalizedChatWidgetNavigationTarget,
  RealtimeStatus,
} from '../types.js';

type DevRuntimeDiagnosticsPanelProps = {
  diagnostics: readonly ChatRealtimeDiagnostic[];
  realtimeStatus: RealtimeStatus;
  currentTarget: NormalizedChatWidgetNavigationTarget | null;
  restoredTarget: NormalizedChatWidgetNavigationTarget | null;
  recentTaskTarget: NormalizedChatWidgetNavigationTarget | null;
  lastActivityTarget: NormalizedChatWidgetNavigationTarget | null;
  attentionCount: number;
  recentActivityCount: number;
  selectedActivity: ChatActivityItem | null;
};

type DiagnosticRow = {
  label: string;
  value: string | number;
};

const renderRows = (rows: readonly DiagnosticRow[]): ReactElement[] =>
  rows.map((row) => (
    <div className="chat-ui-dev-diagnostics-row" key={row.label}>
      <span>{row.label}</span>
      <strong>{row.value}</strong>
    </div>
  ));

export const DevRuntimeDiagnosticsPanel = ({
  diagnostics,
  realtimeStatus,
  currentTarget,
  restoredTarget,
  recentTaskTarget,
  lastActivityTarget,
  attentionCount,
  recentActivityCount,
  selectedActivity,
}: DevRuntimeDiagnosticsPanelProps): ReactElement => {
  const snapshot = useMemo(
    () => buildRuntimeDiagnosticsSnapshot(diagnostics, realtimeStatus),
    [diagnostics, realtimeStatus],
  );
  const assertionStatuses = useMemo(
    () => buildRuntimeAssertionStatuses(diagnostics),
    [diagnostics],
  );

  return (
    <aside
      className="chat-ui-dev-diagnostics"
      aria-label="Runtime diagnostics"
      data-chat-diagnostics-panel="true"
    >
      <header>
        <strong>Runtime diagnostics</strong>
        <span>dev only</span>
      </header>

      <section aria-label="Realtime diagnostics">
        <h3>Realtime</h3>
        {renderRows([
          { label: 'EventSource state', value: snapshot.eventSourceState },
          { label: 'activeEventSourceCount', value: snapshot.activeEventSourceCount },
          { label: 'reconnect count', value: snapshot.reconnectCount },
          { label: 'last connect time', value: snapshot.lastConnectTime },
          { label: 'last reconnect time', value: snapshot.lastReconnectTime },
        ])}
      </section>

      <section aria-label="Diagnostics counters">
        <h3>Diagnostics</h3>
        {renderRows([
          { label: 'leakMarkers', value: snapshot.leakMarkers },
          { label: 'duplicate_event_count', value: snapshot.duplicateEventCount },
          {
            label: 'duplicate_connection_prevention_count',
            value: snapshot.duplicateConnectionPreventionCount,
          },
          { label: 'reconnect_failed_count', value: snapshot.reconnectFailedCount },
        ])}
      </section>

      <section aria-label="Navigation diagnostics">
        <h3>Navigation</h3>
        {renderRows([
          { label: 'current target', value: describeNavigationTarget(currentTarget) },
          { label: 'restored target', value: describeNavigationTarget(restoredTarget) },
          { label: 'recent task target', value: describeNavigationTarget(recentTaskTarget) },
          { label: 'last activity target', value: describeNavigationTarget(lastActivityTarget) },
        ])}
      </section>

      <section aria-label="Activity diagnostics">
        <h3>Activity</h3>
        {renderRows([
          { label: 'attention count', value: attentionCount },
          { label: 'recent activity count', value: recentActivityCount },
          { label: 'selected activity', value: describeActivityItem(selectedActivity) },
        ])}
      </section>

      <section aria-label="Runtime assertion status">
        <h3>Assertions</h3>
        {assertionStatuses.map((assertion) => (
          <div className="chat-ui-dev-diagnostics-row" key={assertion.name}>
            <span>{assertion.name}</span>
            <strong className={`chat-ui-dev-diagnostics-${assertion.status.toLowerCase()}`}>
              {assertion.status}
            </strong>
          </div>
        ))}
      </section>
    </aside>
  );
};
