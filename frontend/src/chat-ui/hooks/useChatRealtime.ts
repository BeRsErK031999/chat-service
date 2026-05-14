import { useEffect, useState } from 'react';

import type { ChatApiClient } from '../api';
import type { RealtimeStatus } from '../types';

type MessageCreatedEvent = {
  roomId: string;
};

type UseChatRealtimeParams = {
  client: ChatApiClient;
  selectedRoomId: string | null;
  enabled: boolean;
  onRoomsRefresh: () => void;
  onMessagesRefresh: () => void;
  onNotificationsRefresh: () => void;
  onRealtimeStatusChange?: ((status: RealtimeStatus) => void) | undefined;
};

export const useChatRealtime = ({
  client,
  selectedRoomId,
  enabled,
  onRoomsRefresh,
  onMessagesRefresh,
  onNotificationsRefresh,
  onRealtimeStatusChange,
}: UseChatRealtimeParams): RealtimeStatus => {
  const [status, setStatus] = useState<RealtimeStatus>(enabled ? 'disconnected' : 'disabled');

  useEffect(() => {
    onRealtimeStatusChange?.(status);
  }, [onRealtimeStatusChange, status]);

  useEffect(() => {
    if (!enabled) {
      setStatus('disabled');
      return undefined;
    }

    setStatus('disconnected');
    const eventSource = new EventSource(client.getEventsUrl());

    eventSource.onopen = () => {
      setStatus('connected');
    };

    eventSource.onerror = () => {
      setStatus('disconnected');
    };

    eventSource.addEventListener('message.created', (event: MessageEvent<string>) => {
      const payload = JSON.parse(event.data) as MessageCreatedEvent;
      onRoomsRefresh();

      if (payload.roomId === selectedRoomId) {
        onMessagesRefresh();
      }
    });

    eventSource.addEventListener('notification.created', () => {
      onNotificationsRefresh();
    });

    eventSource.addEventListener('notification.read', () => {
      onNotificationsRefresh();
    });

    eventSource.addEventListener('room.read', () => {
      onRoomsRefresh();
    });

    return () => {
      eventSource.close();
      setStatus('disconnected');
    };
  }, [
    client,
    enabled,
    onMessagesRefresh,
    onNotificationsRefresh,
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
