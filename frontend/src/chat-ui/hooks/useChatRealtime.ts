import { useEffect, useRef, useState } from 'react';

import type { ChatApiClient } from '../api';
import type { ChatRealtimeDiagnostic, ChatRealtimeDiagnosticKind, RealtimeStatus } from '../types';

type MessageCreatedEvent = {
  roomId: string;
  messageId: string;
};

type NotificationCreatedEvent = {
  notificationId: string;
};

type NotificationReadEvent = {
  notificationId: string;
};

type RoomReadEvent = {
  roomId: string;
};

type PresenceChangedEvent = {
  userId: string;
  status: 'online' | 'offline';
  lastSeenAt: string;
};

type UseChatRealtimeParams = {
  client: ChatApiClient;
  selectedRoomId: string | null;
  enabled: boolean;
  onRoomsRefresh: () => void;
  onMessagesRefresh: () => void;
  onNotificationsRefresh: () => void;
  onPresenceRefresh?: ((event: PresenceChangedEvent) => void) | undefined;
  onRealtimeStatusChange?: ((status: RealtimeStatus) => void) | undefined;
  onRealtimeDiagnostic?: ((diagnostic: ChatRealtimeDiagnostic) => void) | undefined;
};

const MAX_SEEN_EVENTS = 200;

type RealtimeHandlerRefs = {
  selectedRoomId: string | null;
  status: RealtimeStatus;
  onRoomsRefresh: () => void;
  onMessagesRefresh: () => void;
  onNotificationsRefresh: () => void;
  onPresenceRefresh?: ((event: PresenceChangedEvent) => void) | undefined;
  onRealtimeDiagnostic?: ((diagnostic: ChatRealtimeDiagnostic) => void) | undefined;
};

type RealtimeLifecycleCounters = {
  activeEventSourceCount: number;
  reconnectAttemptCount: number;
  reconnectSuccessCount: number;
  reconnectFailureCount: number;
  cleanupCount: number;
  duplicateConnectionPreventionCount: number;
  lastConnectedAt?: string;
  lastDisconnectedAt?: string;
  lastReconnectReason?: 'online' | 'pageshow' | 'eventsource-error';
};

export const useChatRealtime = ({
  client,
  selectedRoomId,
  enabled,
  onRoomsRefresh,
  onMessagesRefresh,
  onNotificationsRefresh,
  onPresenceRefresh,
  onRealtimeStatusChange,
  onRealtimeDiagnostic,
}: UseChatRealtimeParams): RealtimeStatus => {
  const [status, setStatus] = useState<RealtimeStatus>(enabled ? 'disconnected' : 'disabled');
  const [connectionVersion, setConnectionVersion] = useState(0);
  const seenEventKeysRef = useRef<string[]>([]);
  const seenEventSetRef = useRef(new Set<string>());
  const eventSourceRef = useRef<EventSource | null>(null);
  const lifecycleCountersRef = useRef<RealtimeLifecycleCounters>({
    activeEventSourceCount: 0,
    reconnectAttemptCount: 0,
    reconnectSuccessCount: 0,
    reconnectFailureCount: 0,
    cleanupCount: 0,
    duplicateConnectionPreventionCount: 0,
  });
  const handlerRefs = useRef<RealtimeHandlerRefs>({
    selectedRoomId,
    status,
    onRoomsRefresh,
    onMessagesRefresh,
    onNotificationsRefresh,
    onPresenceRefresh,
    onRealtimeDiagnostic,
  });

  handlerRefs.current = {
    selectedRoomId,
    status,
    onRoomsRefresh,
    onMessagesRefresh,
    onNotificationsRefresh,
    onPresenceRefresh,
    onRealtimeDiagnostic,
  };

  const emitDiagnostic = (
    kind: ChatRealtimeDiagnosticKind,
    eventName?: string,
    nextStatus: RealtimeStatus = handlerRefs.current.status,
  ): void => {
    const lifecycleCounters = lifecycleCountersRef.current;
    handlerRefs.current.onRealtimeDiagnostic?.({
      kind,
      status: nextStatus,
      timestamp: new Date().toISOString(),
      ...(eventName !== undefined ? { eventName } : {}),
      selectedRoomId: handlerRefs.current.selectedRoomId,
      activeEventSourceCount: lifecycleCounters.activeEventSourceCount,
      reconnectAttemptCount: lifecycleCounters.reconnectAttemptCount,
      reconnectSuccessCount: lifecycleCounters.reconnectSuccessCount,
      reconnectFailureCount: lifecycleCounters.reconnectFailureCount,
      cleanupCount: lifecycleCounters.cleanupCount,
      duplicateConnectionPreventionCount: lifecycleCounters.duplicateConnectionPreventionCount,
      ...(lifecycleCounters.lastConnectedAt !== undefined
        ? { lastConnectedAt: lifecycleCounters.lastConnectedAt }
        : {}),
      ...(lifecycleCounters.lastDisconnectedAt !== undefined
        ? { lastDisconnectedAt: lifecycleCounters.lastDisconnectedAt }
        : {}),
      ...(lifecycleCounters.lastReconnectReason !== undefined
        ? { lastReconnectReason: lifecycleCounters.lastReconnectReason }
        : {}),
    });
  };

  const markEventSeen = (eventKey: string): boolean => {
    if (seenEventSetRef.current.has(eventKey)) {
      return true;
    }

    seenEventSetRef.current.add(eventKey);
    seenEventKeysRef.current.push(eventKey);

    while (seenEventKeysRef.current.length > MAX_SEEN_EVENTS) {
      const staleKey = seenEventKeysRef.current.shift();

      if (staleKey !== undefined) {
        seenEventSetRef.current.delete(staleKey);
      }
    }

    return false;
  };

  useEffect(() => {
    onRealtimeStatusChange?.(status);
  }, [onRealtimeStatusChange, status]);

  useEffect(() => {
    if (!enabled) {
      setStatus('disabled');
      return undefined;
    }

    setStatus('connecting');
    emitDiagnostic('connect_start', undefined, 'connecting');

    if (eventSourceRef.current !== null) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      lifecycleCountersRef.current.activeEventSourceCount = 0;
      lifecycleCountersRef.current.cleanupCount += 1;
      lifecycleCountersRef.current.duplicateConnectionPreventionCount += 1;
      emitDiagnostic('duplicate_connection_prevented', undefined, 'connecting');
    }

    const eventSource = new EventSource(client.getEventsUrl());
    eventSourceRef.current = eventSource;
    lifecycleCountersRef.current.activeEventSourceCount = 1;

    eventSource.onopen = () => {
      setStatus('connected');
      const now = new Date().toISOString();
      lifecycleCountersRef.current.lastConnectedAt = now;
      if (lifecycleCountersRef.current.reconnectAttemptCount > 0) {
        lifecycleCountersRef.current.reconnectSuccessCount += 1;
        emitDiagnostic('reconnect_succeeded', undefined, 'connected');
      }
      emitDiagnostic('connected', undefined, 'connected');
      handlerRefs.current.onRoomsRefresh();
      handlerRefs.current.onMessagesRefresh();
      handlerRefs.current.onNotificationsRefresh();
    };

    eventSource.onerror = () => {
      setStatus('disconnected');
      lifecycleCountersRef.current.lastDisconnectedAt = new Date().toISOString();
      lifecycleCountersRef.current.lastReconnectReason = 'eventsource-error';
      lifecycleCountersRef.current.reconnectAttemptCount += 1;
      lifecycleCountersRef.current.reconnectFailureCount += 1;
      emitDiagnostic('reconnect_failed', undefined, 'disconnected');
      emitDiagnostic('disconnected', undefined, 'disconnected');
    };

    eventSource.addEventListener('message.created', (event: MessageEvent<string>) => {
      const eventName = 'message.created';
      let payload: MessageCreatedEvent;

      try {
        payload = JSON.parse(event.data) as MessageCreatedEvent;
      } catch {
        emitDiagnostic('parse_error', eventName);
        return;
      }

      if (markEventSeen(`${eventName}:${payload.messageId}`)) {
        emitDiagnostic('duplicate_event', eventName);
        return;
      }

      emitDiagnostic('event_received', eventName);
      handlerRefs.current.onRoomsRefresh();

      if (payload.roomId === handlerRefs.current.selectedRoomId) {
        handlerRefs.current.onMessagesRefresh();
      }
    });

    eventSource.addEventListener('notification.created', (event: MessageEvent<string>) => {
      const eventName = 'notification.created';
      let payload: NotificationCreatedEvent;

      try {
        payload = JSON.parse(event.data) as NotificationCreatedEvent;
      } catch {
        emitDiagnostic('parse_error', eventName);
        return;
      }

      if (markEventSeen(`${eventName}:${payload.notificationId}`)) {
        emitDiagnostic('duplicate_event', eventName);
        return;
      }

      emitDiagnostic('event_received', eventName);
      handlerRefs.current.onNotificationsRefresh();
    });

    eventSource.addEventListener('notification.read', (event: MessageEvent<string>) => {
      const eventName = 'notification.read';
      let payload: NotificationReadEvent;

      try {
        payload = JSON.parse(event.data) as NotificationReadEvent;
      } catch {
        emitDiagnostic('parse_error', eventName);
        return;
      }

      if (markEventSeen(`${eventName}:${payload.notificationId}`)) {
        emitDiagnostic('duplicate_event', eventName);
        return;
      }

      emitDiagnostic('event_received', eventName);
      handlerRefs.current.onNotificationsRefresh();
    });

    eventSource.addEventListener('room.read', (event: MessageEvent<string>) => {
      const eventName = 'room.read';
      let payload: RoomReadEvent;

      try {
        payload = JSON.parse(event.data) as RoomReadEvent;
      } catch {
        emitDiagnostic('parse_error', eventName);
        return;
      }

      if (markEventSeen(`${eventName}:${payload.roomId}`)) {
        emitDiagnostic('duplicate_event', eventName);
        return;
      }

      emitDiagnostic('event_received', eventName);
      handlerRefs.current.onRoomsRefresh();
    });

    eventSource.addEventListener('presence.changed', (event: MessageEvent<string>) => {
      const eventName = 'presence.changed';
      let payload: PresenceChangedEvent;

      try {
        payload = JSON.parse(event.data) as PresenceChangedEvent;
      } catch {
        emitDiagnostic('parse_error', eventName);
        return;
      }

      markEventSeen(`${eventName}:${payload.userId}:${payload.status}:${payload.lastSeenAt}`);
      emitDiagnostic('event_received', eventName);
      handlerRefs.current.onPresenceRefresh?.(payload);
    });

    const handleOnline = (): void => {
      lifecycleCountersRef.current.reconnectAttemptCount += 1;
      lifecycleCountersRef.current.lastReconnectReason = 'online';
      emitDiagnostic('reconnect_requested');
      setConnectionVersion((value) => value + 1);
    };

    const handlePageShow = (event: PageTransitionEvent): void => {
      if (event.persisted) {
        lifecycleCountersRef.current.reconnectAttemptCount += 1;
        lifecycleCountersRef.current.lastReconnectReason = 'pageshow';
        emitDiagnostic('reconnect_requested');
        setConnectionVersion((value) => value + 1);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('pageshow', handlePageShow);
      eventSource.close();
      if (eventSourceRef.current === eventSource) {
        eventSourceRef.current = null;
      }
      lifecycleCountersRef.current.activeEventSourceCount = eventSourceRef.current === null ? 0 : 1;
      lifecycleCountersRef.current.cleanupCount += 1;
      emitDiagnostic('cleanup');
      setStatus('disconnected');
    };
  }, [client, connectionVersion, enabled]);

  useEffect(() => {
    if (status === 'connected') {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      emitDiagnostic('polling_refresh');
      handlerRefs.current.onRoomsRefresh();
      handlerRefs.current.onMessagesRefresh();
      handlerRefs.current.onNotificationsRefresh();
    }, 25_000);

    return () => window.clearInterval(intervalId);
  }, [status]);

  return status;
};
