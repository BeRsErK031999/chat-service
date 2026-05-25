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
  getRoomScopeLabel,
  getTaskReferenceLabel,
  getPresenceLabel,
  isTaskRoom,
} from './components';
import { useChatClient } from './hooks/useChatClient';
import { useChatRealtime } from './hooks/useChatRealtime';
import type {
  ChatMessage,
  ChatWidgetAuth,
  ChatWidgetProps,
  LocalMessage,
  Message,
  Notification,
  PresenceState,
  RoomListItem,
} from './types';

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
  const [pendingMessages, setPendingMessages] = useState<LocalMessage[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [presenceByUserId, setPresenceByUserId] = useState<ReadonlyMap<string, PresenceState>>(
    () => new Map(),
  );
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
  const selectedRoomScopeLabel = useMemo(
    () => (selectedRoom !== null ? getRoomScopeLabel(selectedRoom, context) : null),
    [context, selectedRoom],
  );

  const selectedTaskReferenceLabel = useMemo(
    () => (selectedRoom !== null ? getTaskReferenceLabel(selectedRoom) : null),
    [selectedRoom],
  );

  const visibleMessages = useMemo<ChatMessage[]>(
    () =>
      [...messages, ...pendingMessages]
        .filter((message) => message.roomId === selectedRoomId)
        .sort((left, right) => left.sequence - right.sequence),
    [messages, pendingMessages, selectedRoomId],
  );

  const lastSequence = visibleMessages[visibleMessages.length - 1]?.sequence ?? 0;

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
      setPendingMessages((currentMessages) =>
        currentMessages.filter(
          (message) =>
            message.roomId !== selectedRoomId ||
            !nextMessages.some((serverMessage) => serverMessage.id === message.id),
        ),
      );
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

  const updatePresence = useCallback((event: { userId: string } & PresenceState) => {
    setPresenceByUserId((currentPresence) => {
      const nextPresence = new Map(currentPresence);
      nextPresence.set(event.userId, {
        status: event.status,
        lastSeenAt: event.lastSeenAt,
      });

      return nextPresence;
    });
  }, []);

  const realtimeStatus = useChatRealtime({
    client,
    selectedRoomId,
    enabled: enableRealtime,
    onRoomsRefresh: triggerRoomsRefresh,
    onMessagesRefresh: triggerMessagesRefresh,
    onNotificationsRefresh: triggerNotificationsRefresh,
    onPresenceRefresh: updatePresence,
    onRealtimeStatusChange: callbacks?.onRealtimeStatusChange,
  });

  const currentUserPresence = useMemo<PresenceState>(
    () => ({
      status: realtimeStatus === 'connected' ? 'online' : 'offline',
      lastSeenAt: new Date().toISOString(),
    }),
    [realtimeStatus],
  );

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

  const sendDraft = async (body: string, idempotencyKey: string, localMessageId: string): Promise<void> => {
    if (selectedRoomId === null) {
      return;
    }

    setIsSending(true);
    try {
      const sentMessage = await client.sendMessage(selectedRoomId, body, idempotencyKey);
      callbacks?.onMessageSent?.(sentMessage);
      setPendingMessages((currentMessages) =>
        currentMessages.filter((message) => message.id !== localMessageId),
      );
      await refreshAll();
    } catch (caughtError) {
      setPendingMessages((currentMessages) =>
        currentMessages.map((message) =>
          message.id === localMessageId
            ? {
                ...message,
                clientState: 'error',
              }
            : message,
        ),
      );
      setError(reportError(caughtError, 'Failed to send message.', true));
    } finally {
      setIsSending(false);
    }
  };

  const handleSend = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    if (selectedRoomId === null || draft.trim().length === 0) {
      return;
    }

    const body = draft.trim();
    const idempotencyKey = client.createMessageIdempotencyKey();
    const localMessageId = `local-${idempotencyKey}`;
    const localSequence = lastSequence + 1;
    const now = new Date().toISOString();

    setPendingMessages((currentMessages) => [
      ...currentMessages,
      {
        id: localMessageId,
        roomId: selectedRoomId,
        senderUserId: currentUser.id,
        type: 'TEXT',
        body,
        eventType: null,
        eventPayload: {},
        sourceEventId: null,
        sequence: localSequence,
        createdAt: now,
        updatedAt: now,
        clientState: 'pending',
        idempotencyKey,
      },
    ]);
    setDraft('');

    await sendDraft(body, idempotencyKey, localMessageId);
  };

  const handleRetryMessage = async (messageId: string): Promise<void> => {
    const message = pendingMessages.find((item) => item.id === messageId);

    if (message === undefined || message.body === null) {
      return;
    }

    setPendingMessages((currentMessages) =>
      currentMessages.map((item) =>
        item.id === messageId
          ? {
              ...item,
              clientState: 'pending',
            }
          : item,
      ),
    );

    await sendDraft(message.body, message.idempotencyKey, message.id);
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
        <div className="chat-ui-current-presence">
          <span
            className={
              currentUserPresence.status === 'online'
                ? 'chat-ui-presence-dot chat-ui-presence-online'
                : 'chat-ui-presence-dot'
            }
            aria-label={getPresenceLabel(currentUserPresence)}
            title={getPresenceLabel(currentUserPresence)}
          />
          <span>{getPresenceLabel(currentUserPresence)}</span>
        </div>

        <RoomList
          rooms={rooms}
          selectedRoomId={selectedRoomId}
          isLoading={isLoadingRooms}
          {...(context !== undefined ? { context } : {})}
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
            {selectedRoom !== null ? (
              <div className="chat-ui-room-context">
                <span>{isTaskRoom(selectedRoom) ? 'Task discussion' : selectedRoom.type}</span>
                {selectedRoomScopeLabel !== null ? <span>{selectedRoomScopeLabel}</span> : null}
                {selectedTaskReferenceLabel !== null ? (
                  <span>Task {selectedTaskReferenceLabel}</span>
                ) : null}
                {context?.source !== undefined ? <span>{context.source}</span> : null}
              </div>
            ) : null}
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
          messages={visibleMessages}
          selectedRoom={selectedRoom}
          currentUserId={currentUser.id}
          presenceByUserId={presenceByUserId}
          isLoading={isLoadingMessages}
          onRetryMessage={(messageId) => void handleRetryMessage(messageId)}
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
