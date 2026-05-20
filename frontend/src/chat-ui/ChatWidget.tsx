import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';

import { ChatApiError } from './api';
import './chat-widget.css';
import {
  MessageComposer,
  MessageList,
  NotificationsPanel,
  RealtimeStatus,
  RoomList,
  getRoomLabel,
} from './components';
import { useChatClient } from './hooks/useChatClient';
import { useChatRealtime } from './hooks/useChatRealtime';
import type { ChatWidgetAuth, ChatWidgetProps, Message, Notification, RoomListItem } from './types';

const toError = (caughtError: unknown, fallback: string): Error =>
  caughtError instanceof Error ? caughtError : new Error(fallback);

export const ChatWidget = ({
  apiBaseUrl,
  currentUser,
  auth,
  context,
  initialRoomId,
  mode = 'full',
  enableRealtime = true,
  className,
  callbacks,
  labels,
}: ChatWidgetProps): ReactElement => {
  const effectiveAuth = useMemo<ChatWidgetAuth>(
    () =>
      auth ?? {
        strategy: 'dev-user-id',
        userId: currentUser.id,
      },
    [auth, currentUser.id],
  );
  const client = useChatClient(apiBaseUrl, effectiveAuth);
  const explicitRoomId = context?.roomId ?? initialRoomId ?? null;
  const taskRoomLookupContext = useMemo(
    () =>
      explicitRoomId === null && context?.taskId !== undefined && context.roomScope !== undefined
        ? {
            taskId: context.taskId,
            roomScope: context.roomScope,
          }
        : null,
    [context?.roomScope, context?.taskId, explicitRoomId],
  );
  const [lookupRoomId, setLookupRoomId] = useState<string | null>(null);
  const requestedRoomId = explicitRoomId ?? lookupRoomId;
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(requestedRoomId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [draft, setDraft] = useState('');
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastUnreadCountRef = useRef<number | null>(null);
  const lastRoomChangeRef = useRef<string | null | undefined>(undefined);
  const deniedRoomIdRef = useRef<string | null>(null);

  const reportError = useCallback(
    (caughtError: unknown, fallback: string, notifyAccessDenied = false): string => {
      const nextError = toError(caughtError, fallback);

      if (nextError instanceof ChatApiError && nextError.status === 401) {
        callbacks?.onAuthError?.(nextError);
      }

      if (
        notifyAccessDenied &&
        nextError instanceof ChatApiError &&
        (nextError.status === 403 || nextError.status === 404)
      ) {
        callbacks?.onAccessDenied?.(nextError);
      }

      return nextError.message;
    },
    [callbacks],
  );

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === selectedRoomId) ?? null,
    [rooms, selectedRoomId],
  );

  const sortedMessages = useMemo(
    () => [...messages].sort((left, right) => left.sequence - right.sequence),
    [messages],
  );

  const lastSequence = sortedMessages[sortedMessages.length - 1]?.sequence ?? 0;

  useEffect(() => {
    if (taskRoomLookupContext === null) {
      setLookupRoomId(null);
      return undefined;
    }

    let isActive = true;

    const lookupTaskRoom = async (): Promise<void> => {
      try {
        const result = await client.lookupTaskRoom(
          taskRoomLookupContext.taskId,
          taskRoomLookupContext.roomScope,
        );

        if (!isActive) {
          return;
        }

        deniedRoomIdRef.current = null;
        setLookupRoomId(result.roomId);
        setError(null);
      } catch (caughtError) {
        if (!isActive) {
          return;
        }

        setLookupRoomId(null);
        setSelectedRoomId(null);
        setError(reportError(caughtError, 'Task room is not available for this user.', true));
      }
    };

    void lookupTaskRoom();

    return () => {
      isActive = false;
    };
  }, [client, reportError, taskRoomLookupContext]);

  const loadRooms = useCallback(async () => {
    setIsLoadingRooms(true);
    try {
      const nextRooms = await client.getRooms();
      setRooms(nextRooms);
      setError(null);
      if (requestedRoomId !== null && !nextRooms.some((room) => room.id === requestedRoomId)) {
        if (deniedRoomIdRef.current !== requestedRoomId) {
          deniedRoomIdRef.current = requestedRoomId;
          const accessError = new Error('Requested room is not available for this user.');
          callbacks?.onAccessDenied?.(accessError);
          setError(accessError.message);
        }

        setSelectedRoomId(null);
        return;
      }

      if (requestedRoomId !== null) {
        deniedRoomIdRef.current = null;
        setSelectedRoomId(requestedRoomId);
        return;
      }

      if (taskRoomLookupContext !== null) {
        setSelectedRoomId(null);
        return;
      }

      setSelectedRoomId((currentRoomId) => {
        if (currentRoomId !== null && nextRooms.some((room) => room.id === currentRoomId)) {
          return currentRoomId;
        }

        return nextRooms[0]?.id ?? null;
      });
    } catch (caughtError) {
      setError(reportError(caughtError, 'Failed to load rooms.'));
    } finally {
      setIsLoadingRooms(false);
    }
  }, [callbacks, client, reportError, requestedRoomId, taskRoomLookupContext]);

  const loadMessages = useCallback(async () => {
    if (selectedRoomId === null) {
      setMessages([]);
      return;
    }

    setIsLoadingMessages(true);
    try {
      const nextMessages = await client.getMessages(selectedRoomId);
      setMessages(nextMessages);
      setError(null);
    } catch (caughtError) {
      setError(reportError(caughtError, 'Failed to load messages.', true));
    } finally {
      setIsLoadingMessages(false);
    }
  }, [client, reportError, selectedRoomId]);

  const loadNotifications = useCallback(async () => {
    setIsLoadingNotifications(true);
    try {
      const nextNotifications = await client.getNotifications();
      setNotifications(nextNotifications);
      setError(null);
    } catch (caughtError) {
      setError(reportError(caughtError, 'Failed to load notifications.'));
    } finally {
      setIsLoadingNotifications(false);
    }
  }, [client, reportError]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadRooms(), loadMessages(), loadNotifications()]);
  }, [loadMessages, loadNotifications, loadRooms]);

  const triggerRoomsRefresh = useCallback(() => {
    void loadRooms();
  }, [loadRooms]);

  const triggerMessagesRefresh = useCallback(() => {
    void loadMessages();
  }, [loadMessages]);

  const triggerNotificationsRefresh = useCallback(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const realtimeStatus = useChatRealtime({
    client,
    selectedRoomId,
    enabled: enableRealtime,
    onRoomsRefresh: triggerRoomsRefresh,
    onMessagesRefresh: triggerMessagesRefresh,
    onNotificationsRefresh: triggerNotificationsRefresh,
    onRealtimeStatusChange: callbacks?.onRealtimeStatusChange,
  });

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    const nextUnreadCount =
      rooms.reduce((total, room) => total + room.unreadCount, 0) +
      notifications.filter((notification) => notification.readAt === null).length;

    if (lastUnreadCountRef.current === nextUnreadCount) {
      return;
    }

    lastUnreadCountRef.current = nextUnreadCount;
    callbacks?.onUnreadCountChange?.(nextUnreadCount);
  }, [callbacks, notifications, rooms]);

  useEffect(() => {
    if (lastRoomChangeRef.current === selectedRoomId) {
      return;
    }

    lastRoomChangeRef.current = selectedRoomId;
    callbacks?.onRoomChange?.(selectedRoomId);
  }, [callbacks, selectedRoomId]);

  const handleSend = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    if (selectedRoomId === null || draft.trim().length === 0) {
      return;
    }

    setIsSending(true);
    try {
      const sentMessage = await client.sendMessage(selectedRoomId, draft.trim());
      callbacks?.onMessageSent?.(sentMessage);
      setDraft('');
      await refreshAll();
    } catch (caughtError) {
      setError(reportError(caughtError, 'Failed to send message.', true));
    } finally {
      setIsSending(false);
    }
  };

  const handleMarkRoomRead = async (): Promise<void> => {
    if (selectedRoomId === null || lastSequence === 0) {
      return;
    }

    try {
      await client.markRoomRead(selectedRoomId, lastSequence);
      await refreshAll();
    } catch (caughtError) {
      setError(reportError(caughtError, 'Failed to mark room read.', true));
    }
  };

  const handleMarkNotificationRead = async (notificationId: string): Promise<void> => {
    try {
      await client.markNotificationRead(notificationId);
      await loadNotifications();
    } catch (caughtError) {
      setError(reportError(caughtError, 'Failed to mark notification read.'));
    }
  };

  const shellClassName = ['chat-ui-root', `chat-ui-${mode}`, className].filter(Boolean).join(' ');

  return (
    <main className={shellClassName}>
      <aside className="chat-ui-sidebar">
        <div className="chat-ui-sidebar-header">
          <div>
            <p className="chat-ui-eyebrow">User</p>
            <strong>{currentUser.displayName}</strong>
          </div>
          {callbacks?.onClose !== undefined ? (
            <button type="button" onClick={callbacks.onClose}>
              Close
            </button>
          ) : null}
        </div>

        <div className="chat-ui-toolbar">
          <button type="button" onClick={() => void refreshAll()}>
            Refresh
          </button>
          {isLoadingRooms ? <span>Loading rooms...</span> : null}
          <RealtimeStatus status={realtimeStatus} />
        </div>

        <RoomList
          rooms={rooms}
          selectedRoomId={selectedRoomId}
          isLoading={isLoadingRooms}
          emptyLabel={labels?.roomsEmpty}
          onSelectRoom={setSelectedRoomId}
        />
      </aside>

      <section className="chat-ui-chat-panel">
        <header className="chat-ui-chat-header">
          <div>
            <p className="chat-ui-eyebrow">Room</p>
            <h2>
              {selectedRoom !== null
                ? getRoomLabel(selectedRoom)
                : (labels?.title ?? 'Select a room')}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => void handleMarkRoomRead()}
            disabled={selectedRoom === null || lastSequence === 0}
          >
            Mark as read
          </button>
        </header>

        {error !== null ? <div className="chat-ui-error-banner">{error}</div> : null}

        <MessageList
          messages={sortedMessages}
          selectedRoom={selectedRoom}
          currentUserId={currentUser.id}
          isLoading={isLoadingMessages}
          messagesEmptyLabel={labels?.messagesEmpty}
          selectRoomEmptyLabel={labels?.selectRoomEmpty}
        />

        <MessageComposer
          draft={draft}
          disabled={selectedRoom === null}
          isSending={isSending}
          onDraftChange={setDraft}
          onSend={(event) => void handleSend(event)}
        />
      </section>

      <NotificationsPanel
        notifications={notifications}
        isLoading={isLoadingNotifications}
        emptyLabel={labels?.notificationsEmpty}
        onMarkNotificationRead={(notificationId) => void handleMarkNotificationRead(notificationId)}
        onNotificationClick={callbacks?.onNotificationClick}
      />
    </main>
  );
};
