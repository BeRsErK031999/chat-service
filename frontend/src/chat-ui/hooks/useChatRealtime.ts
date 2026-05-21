import { useEffect, useRef, useState } from 'react';

import type { ChatApiClient } from '../api';
import type { RealtimeStatus } from '../types';

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
};

const MAX_SEEN_EVENTS = 200;

export const useChatRealtime = ({
  client,
  selectedRoomId,
  enabled,
  onRoomsRefresh,
  onMessagesRefresh,
  onNotificationsRefresh,
  onPresenceRefresh,
  onRealtimeStatusChange,
}: UseChatRealtimeParams): RealtimeStatus => {
  const [status, setStatus] = useState<RealtimeStatus>(enabled ? 'disconnected' : 'disabled');
  const [connectionVersion, setConnectionVersion] = useState(0);
  const seenEventKeysRef = useRef<string[]>([]);
  const seenEventSetRef = useRef(new Set<string>());

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
    const eventSource = new EventSource(client.getEventsUrl());

    eventSource.onopen = () => {
      setStatus('connected');
      onRoomsRefresh();
      onMessagesRefresh();
      onNotificationsRefresh();
    };

    eventSource.onerror = () => {
      setStatus('disconnected');
    };

    eventSource.addEventListener('message.created', (event: MessageEvent<string>) => {
      const payload = JSON.parse(event.data) as MessageCreatedEvent;
      if (markEventSeen(`message.created:${payload.messageId}`)) {
        return;
      }

      onRoomsRefresh();

      if (payload.roomId === selectedRoomId) {
        onMessagesRefresh();
      }
    });

    eventSource.addEventListener('notification.created', (event: MessageEvent<string>) => {
      const payload = JSON.parse(event.data) as NotificationCreatedEvent;
      if (markEventSeen(`notification.created:${payload.notificationId}`)) {
        return;
      }

      onNotificationsRefresh();
    });

    eventSource.addEventListener('notification.read', (event: MessageEvent<string>) => {
      const payload = JSON.parse(event.data) as NotificationReadEvent;
      if (markEventSeen(`notification.read:${payload.notificationId}`)) {
        return;
      }

      onNotificationsRefresh();
    });

    eventSource.addEventListener('room.read', (event: MessageEvent<string>) => {
      const payload = JSON.parse(event.data) as RoomReadEvent;
      if (markEventSeen(`room.read:${payload.roomId}`)) {
        return;
      }

      onRoomsRefresh();
    });

    eventSource.addEventListener('presence.changed', (event: MessageEvent<string>) => {
      const payload = JSON.parse(event.data) as PresenceChangedEvent;
      markEventSeen(`presence.changed:${payload.userId}:${payload.status}:${payload.lastSeenAt}`);
      onPresenceRefresh?.(payload);
    });

    const handleOnline = (): void => {
      setConnectionVersion((value) => value + 1);
    };

    const handlePageShow = (event: PageTransitionEvent): void => {
      if (event.persisted) {
        setConnectionVersion((value) => value + 1);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('pageshow', handlePageShow);
      eventSource.close();
      setStatus('disconnected');
    };
  }, [
    client,
    connectionVersion,
    enabled,
    onMessagesRefresh,
    onNotificationsRefresh,
    onPresenceRefresh,
    onRoomsRefresh,
    selectedRoomId,
  ]);

  useEffect(() => {
    if (status === 'connected') {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      onRoomsRefresh();
      onMessagesRefresh();
      onNotificationsRefresh();
    }, 25_000);

    return () => window.clearInterval(intervalId);
  }, [onMessagesRefresh, onNotificationsRefresh, onRoomsRefresh, status]);

  return status;
};
