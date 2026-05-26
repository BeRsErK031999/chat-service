import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';

import { ChatApiError } from './api';
import { buildChatActivityItems } from './activity';
import './chat-widget.css';
import {
  ActivityPanel,
  MessageComposer,
  MessageList,
  RealtimeStatus,
  RoomList,
  formatRelativeActivity,
  getRoomLabel,
  getRoomScopeLabel,
  getTaskReferenceLabel,
  getPresenceLabel,
  isTaskRoom,
} from './components';
import { useChatClient } from './hooks/useChatClient';
import { useChatRealtime } from './hooks/useChatRealtime';
import { normalizeInteractionHint, shouldEmitInteractionHint } from './interaction';
import { normalizeNavigationTarget, navigationTargetFromRoom } from './navigation';
import type {
  ChatActivityItem,
  ChatMessage,
  ChatWidgetAuth,
  ChatInteractionHint,
  ChatWidgetProps,
  LocalMessage,
  Message,
  NormalizedChatWidgetNavigationTarget,
  Notification,
  PresenceState,
  RoomListItem,
} from './types';

const toError = (caughtError: unknown, fallback: string): Error =>
  caughtError instanceof Error ? caughtError : new Error(fallback);

const getRoomActivityTime = (room: RoomListItem): number => {
  if (room.lastMessageAt === null) {
    return 0;
  }

  const timestamp = new Date(room.lastMessageAt).getTime();

  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const sortRoomsByActivity = (rooms: RoomListItem[]): RoomListItem[] =>
  [...rooms].sort((left, right) => getRoomActivityTime(right) - getRoomActivityTime(left));

const getRecentActivityBoundary = (): number => Date.now() - 30 * 60_000;

export const ChatWidget = ({
  apiBaseUrl,
  currentUser,
  auth,
  context,
  initialRoomId,
  navigationTarget,
  mode = 'full',
  enableRealtime = true,
  className,
  callbacks,
  labels,
}: ChatWidgetProps): ReactElement => {
  const normalizedNavigationTarget = useMemo(
    () => normalizeNavigationTarget(navigationTarget),
    [navigationTarget],
  );
  const effectiveAuth = useMemo<ChatWidgetAuth>(
    () =>
      auth ?? {
        strategy: 'dev-user-id',
        userId: currentUser.id,
      },
    [auth, currentUser.id],
  );
  const client = useChatClient(apiBaseUrl, effectiveAuth);
  const explicitRoomId = context?.roomId ?? normalizedNavigationTarget?.roomId ?? initialRoomId ?? null;
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
  const [roomSearchQuery, setRoomSearchQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [localNavigationTarget, setLocalNavigationTarget] =
    useState<NormalizedChatWidgetNavigationTarget | null>(null);
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastUnreadCountRef = useRef<number | null>(null);
  const lastRoomChangeRef = useRef<string | null | undefined>(undefined);
  const lastSelectedNavigationTargetIdRef = useRef<string | null | undefined>(undefined);
  const lastInteractionHintRef = useRef<ChatInteractionHint | null>(null);
  const roomSwitchCountRef = useRef(0);
  const deniedRoomIdRef = useRef<string | null>(null);
  const lastNavigationTargetIdRef = useRef<string | null>(null);
  const notificationIdsRef = useRef<Set<string>>(new Set());
  const hasLoadedNotificationsRef = useRef(false);
  const lastActiveRoomIdRef = useRef<string | null>(null);
  const recentTaskRoomIdsRef = useRef<string[]>([]);
  const roomSearchInputRef = useRef<HTMLInputElement | null>(null);
  const composerInputRef = useRef<HTMLInputElement | null>(null);

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

  const unreadRooms = useMemo(
    () => sortRoomsByActivity(rooms.filter((room) => room.unreadCount > 0)),
    [rooms],
  );

  const activeDiscussionRooms = useMemo(() => {
    const recentActivityBoundary = getRecentActivityBoundary();

    return sortRoomsByActivity(
      rooms.filter((room) => {
        if (room.unreadCount > 0) {
          return true;
        }

        if (room.lastMessageAt === null) {
          return false;
        }

        return getRoomActivityTime(room) >= recentActivityBoundary;
      }),
    );
  }, [rooms]);

  const activityItems = useMemo(
    () => buildChatActivityItems({ rooms, notifications }),
    [notifications, rooms],
  );
  const focusedNavigationTarget = normalizedNavigationTarget ?? localNavigationTarget;

  const visibleMessages = useMemo<ChatMessage[]>(
    () =>
      [...messages, ...pendingMessages]
        .filter((message) => message.roomId === selectedRoomId)
        .sort((left, right) => left.sequence - right.sequence),
    [messages, pendingMessages, selectedRoomId],
  );

  const lastSequence = visibleMessages[visibleMessages.length - 1]?.sequence ?? 0;
  const activeParticipantCount = useMemo(() => {
    const activeParticipantIds = new Set<string>();

    for (const message of visibleMessages) {
      if (
        message.senderUserId !== null &&
        message.senderUserId !== currentUser.id &&
        presenceByUserId.get(message.senderUserId)?.status === 'online'
      ) {
        activeParticipantIds.add(message.senderUserId);
      }
    }

    return activeParticipantIds.size;
  }, [currentUser.id, presenceByUserId, visibleMessages]);

  const selectRoom = useCallback(
    (roomId: string | null, options: { preserveLastActive?: boolean } = {}): void => {
      setSelectedRoomId((currentRoomId) => {
        if (
          options.preserveLastActive !== true &&
          currentRoomId !== null &&
          currentRoomId !== roomId
        ) {
          lastActiveRoomIdRef.current = currentRoomId;
        }

        return roomId;
      });
    },
    [],
  );

  const selectRelativeRoom = useCallback(
    (candidates: readonly RoomListItem[], direction: 1 | -1): void => {
      if (candidates.length === 0) {
        return;
      }

      const selectedIndex = candidates.findIndex((room) => room.id === selectedRoomId);
      const fallbackIndex = direction === 1 ? 0 : candidates.length - 1;
      const nextIndex =
        selectedIndex === -1
          ? fallbackIndex
          : (selectedIndex + direction + candidates.length) % candidates.length;

      const nextRoom = candidates[nextIndex];

      if (nextRoom !== undefined) {
        selectRoom(nextRoom.id);
      }
    },
    [selectRoom, selectedRoomId],
  );

  const selectRecentTaskRoom = useCallback((): void => {
    const recentRoom = recentTaskRoomIdsRef.current
      .map((roomId) => rooms.find((room) => room.id === roomId) ?? null)
      .find((room): room is RoomListItem => room !== null);

    if (recentRoom !== undefined) {
      selectRoom(recentRoom.id);
      return;
    }

    const latestTaskRoom = sortRoomsByActivity(rooms.filter(isTaskRoom))[0];

    if (latestTaskRoom !== undefined) {
      selectRoom(latestTaskRoom.id);
    }
  }, [rooms, selectRoom]);

  const openRelatedDiscussion = useCallback((): void => {
    const relatedTaskId = selectedRoom?.taskId ?? context?.taskId ?? null;

    if (relatedTaskId === null) {
      selectRecentTaskRoom();
      return;
    }

    const relatedRoom = sortRoomsByActivity(
      rooms.filter((room) => room.id !== selectedRoomId && room.taskId === relatedTaskId),
    )[0];

    if (relatedRoom !== undefined) {
      selectRoom(relatedRoom.id);
      return;
    }

    const currentTaskRoom = rooms.find((room) => room.taskId === relatedTaskId);

    if (currentTaskRoom !== undefined) {
      selectRoom(currentTaskRoom.id);
    }
  }, [context?.taskId, rooms, selectRecentTaskRoom, selectRoom, selectedRoom, selectedRoomId]);

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
        selectRoom(null);
        setError(reportError(caughtError, 'Task room is not available for this user.', true));
      }
    };

    void lookupTaskRoom();

    return () => {
      isActive = false;
    };
  }, [client, reportError, selectRoom, taskRoomLookupContext]);

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

        selectRoom(null);
        return;
      }

      if (requestedRoomId !== null) {
        deniedRoomIdRef.current = null;
        selectRoom(requestedRoomId, { preserveLastActive: true });
        return;
      }

      if (taskRoomLookupContext !== null) {
        selectRoom(null);
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
  }, [callbacks, client, reportError, requestedRoomId, selectRoom, taskRoomLookupContext]);

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
      if (hasLoadedNotificationsRef.current) {
        for (const notification of nextNotifications) {
          if (notification.readAt === null && !notificationIdsRef.current.has(notification.id)) {
            callbacks?.onNotificationReceived?.(notification);
          }
        }
      }

      notificationIdsRef.current = new Set(nextNotifications.map((notification) => notification.id));
      hasLoadedNotificationsRef.current = true;
      setNotifications(nextNotifications);
      setError(null);
    } catch (caughtError) {
      setError(reportError(caughtError, 'Failed to load notifications.'));
    } finally {
      setIsLoadingNotifications(false);
    }
  }, [callbacks, client, reportError]);

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
    onRealtimeDiagnostic: callbacks?.onRealtimeDiagnostic,
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
    callbacks?.onActivityItemsChange?.(activityItems);
  }, [activityItems, callbacks]);

  useEffect(() => {
    if (selectedRoomId === null) {
      lastInteractionHintRef.current = null;
      callbacks?.onInteractionHintsChange?.([]);
      return;
    }

    const hint = normalizeInteractionHint({
      kind: realtimeStatus === 'connected' ? 'active_in_room' : 'viewing',
      roomId: selectedRoomId,
      userId: currentUser.id,
      ...(selectedRoom?.taskId !== null && selectedRoom?.taskId !== undefined
        ? { taskId: selectedRoom.taskId }
        : {}),
    });

    if (hint === null || !shouldEmitInteractionHint(lastInteractionHintRef.current, hint)) {
      return;
    }

    lastInteractionHintRef.current = hint;
    callbacks?.onInteractionHintsChange?.([hint]);
  }, [callbacks, currentUser.id, realtimeStatus, selectedRoom, selectedRoomId]);

  useEffect(() => {
    const selectedNavigationTarget =
      selectedRoom !== null ? navigationTargetFromRoom(selectedRoom) : null;
    const selectedNavigationTargetId = selectedNavigationTarget?.id ?? null;

    if (lastSelectedNavigationTargetIdRef.current !== selectedNavigationTargetId) {
      lastSelectedNavigationTargetIdRef.current = selectedNavigationTargetId;
      callbacks?.onNavigationTargetChange?.(selectedNavigationTarget);
    }

    if (lastRoomChangeRef.current !== selectedRoomId) {
      roomSwitchCountRef.current += 1;
      lastRoomChangeRef.current = selectedRoomId;
      callbacks?.onRoomChange?.(selectedRoomId);
      callbacks?.onRealtimeDiagnostic?.({
        kind: 'room_switched',
        status: realtimeStatus,
        timestamp: new Date().toISOString(),
        selectedRoomId,
        roomSwitchCount: roomSwitchCountRef.current,
        roomCount: rooms.length,
        unreadCount:
          rooms.reduce((total, room) => total + room.unreadCount, 0) +
          notifications.filter((notification) => notification.readAt === null).length,
      });
    }
  }, [callbacks, notifications, realtimeStatus, rooms, selectedRoom, selectedRoomId]);

  useEffect(() => {
    if (selectedRoom === null || !isTaskRoom(selectedRoom)) {
      return;
    }

    recentTaskRoomIdsRef.current = [
      selectedRoom.id,
      ...recentTaskRoomIdsRef.current.filter((roomId) => roomId !== selectedRoom.id),
    ].slice(0, 5);
  }, [selectedRoom]);

  useEffect(() => {
    if (selectedRoomId === null) {
      return;
    }

    composerInputRef.current?.focus();
  }, [selectedRoomId]);

  useEffect(() => {
    if (
      normalizedNavigationTarget === null ||
      lastNavigationTargetIdRef.current === normalizedNavigationTarget.id
    ) {
      return;
    }

    lastNavigationTargetIdRef.current = normalizedNavigationTarget.id;
    setLocalNavigationTarget(normalizedNavigationTarget);
    setRoomSearchQuery('');
    if (normalizedNavigationTarget.roomId !== undefined) {
      selectRoom(normalizedNavigationTarget.roomId);
    }

    if (normalizedNavigationTarget.taskId !== undefined) {
      recentTaskRoomIdsRef.current = [
        ...rooms
          .filter((room) => room.taskId === normalizedNavigationTarget.taskId)
          .map((room) => room.id),
        ...recentTaskRoomIdsRef.current,
      ].slice(0, 5);
    }
  }, [normalizedNavigationTarget, rooms, selectRoom]);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent): void => {
      const target = event.target;
      const isEditableTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        roomSearchInputRef.current?.focus();
        roomSearchInputRef.current?.select();
        return;
      }

      if (event.key === 'Escape' && document.activeElement === roomSearchInputRef.current) {
        if (roomSearchQuery.length > 0) {
          event.preventDefault();
          setRoomSearchQuery('');
          return;
        }

        roomSearchInputRef.current?.blur();
      }

      if (isEditableTarget) {
        return;
      }

      if (event.altKey && event.shiftKey && event.key === 'ArrowDown') {
        event.preventDefault();
        selectRelativeRoom(unreadRooms, 1);
        return;
      }

      if (event.altKey && event.shiftKey && event.key === 'ArrowUp') {
        event.preventDefault();
        selectRelativeRoom(unreadRooms, -1);
        return;
      }

      if (event.altKey && !event.shiftKey && event.key === 'ArrowDown') {
        event.preventDefault();
        selectRelativeRoom(rooms, 1);
        return;
      }

      if (event.altKey && !event.shiftKey && event.key === 'ArrowUp') {
        event.preventDefault();
        selectRelativeRoom(rooms, -1);
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        selectRelativeRoom(activeDiscussionRooms, 1);
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'l') {
        event.preventDefault();
        if (lastActiveRoomIdRef.current !== null) {
          selectRoom(lastActiveRoomIdRef.current, { preserveLastActive: true });
        }
        return;
      }

      if (event.key === '/') {
        event.preventDefault();
        roomSearchInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeDiscussionRooms, roomSearchQuery, rooms, selectRelativeRoom, selectRoom, unreadRooms]);

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

  const handleMarkRoomUnread = (): void => {
    if (selectedRoomId === null) {
      return;
    }

    setRooms((currentRooms) =>
      currentRooms.map((room) =>
        room.id === selectedRoomId
          ? {
              ...room,
              unreadCount: Math.max(room.unreadCount, 1),
            }
          : room,
      ),
    );
  };

  const handleOpenTask = (): void => {
    const taskId = selectedRoom?.taskId ?? context?.taskId;

    if (taskId === undefined || taskId === null) {
      return;
    }

    callbacks?.onTaskOpen?.(taskId);
  };

  const handleCopyTaskReference = async (): Promise<void> => {
    if (selectedTaskReferenceLabel === null) {
      return;
    }

    if (callbacks?.onTaskReferenceCopy !== undefined) {
      callbacks.onTaskReferenceCopy(selectedTaskReferenceLabel);
      return;
    }

    if (navigator.clipboard === undefined) {
      return;
    }

    try {
      await navigator.clipboard.writeText(selectedTaskReferenceLabel);
    } catch (caughtError) {
      setError(reportError(caughtError, 'Failed to copy task reference.'));
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

  const handleActivityItemClick = (item: ChatActivityItem): void => {
    setLocalNavigationTarget(item.target);
    setRoomSearchQuery('');
    callbacks?.onNavigationTargetChange?.(item.target);

    if (item.target.roomId !== undefined) {
      selectRoom(item.target.roomId);
    }

    if (item.target.taskId !== undefined) {
      recentTaskRoomIdsRef.current = [
        ...rooms.filter((room) => room.taskId === item.target.taskId).map((room) => room.id),
        ...recentTaskRoomIdsRef.current,
      ].slice(0, 5);
    }

    if (item.notificationId !== undefined) {
      const notification = notifications.find((candidate) => candidate.id === item.notificationId);

      if (notification !== undefined) {
        callbacks?.onNotificationClick?.(notification);
      }
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
          searchInputRef={roomSearchInputRef}
          searchQuery={roomSearchQuery}
          emptyLabel={labels?.roomsEmpty}
          searchEmptyLabel="No rooms match this workflow."
          onSearchQueryChange={setRoomSearchQuery}
          onSelectRoom={selectRoom}
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
            {selectedRoom !== null ? (
              <div className="chat-ui-room-awareness">
                <span className={selectedRoom.unreadCount > 0 ? 'chat-ui-attention' : undefined}>
                  {selectedRoom.unreadCount > 0
                    ? `${selectedRoom.unreadCount} unread`
                    : 'Caught up'}
                </span>
                <span>{formatRelativeActivity(selectedRoom.lastMessageAt)}</span>
                {activeParticipantCount > 0 ? (
                  <span>
                    {activeParticipantCount === 1
                      ? '1 participant active'
                      : `${activeParticipantCount} participants active`}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="chat-ui-action-bar" aria-label="Workflow actions">
            <button
              type="button"
              onClick={handleOpenTask}
              disabled={(selectedRoom?.taskId ?? context?.taskId) === undefined}
            >
              Jump to task
            </button>
            <button
              type="button"
              onClick={() => void handleCopyTaskReference()}
              disabled={selectedTaskReferenceLabel === null}
            >
              Copy ref
            </button>
            <button type="button" onClick={openRelatedDiscussion} disabled={rooms.length === 0}>
              Related
            </button>
            <button
              type="button"
              onClick={() => void handleMarkRoomRead()}
              disabled={selectedRoom === null || lastSequence === 0}
            >
              Mark read
            </button>
            <button type="button" onClick={handleMarkRoomUnread} disabled={selectedRoom === null}>
              Mark unread
            </button>
            <button type="button" onClick={selectRecentTaskRoom} disabled={rooms.length === 0}>
              Recent task
            </button>
            <button
              type="button"
              onClick={() => selectRelativeRoom(unreadRooms, 1)}
              disabled={unreadRooms.length === 0}
            >
              Next unread
            </button>
            <button
              type="button"
              onClick={() => {
                if (lastActiveRoomIdRef.current !== null) {
                  selectRoom(lastActiveRoomIdRef.current, { preserveLastActive: true });
                }
              }}
              disabled={lastActiveRoomIdRef.current === null}
            >
              Back
            </button>
          </div>
        </header>

        {error !== null ? <div className="chat-ui-error-banner">{error}</div> : null}

        <MessageList
          messages={visibleMessages}
          selectedRoom={selectedRoom}
          currentUserId={currentUser.id}
          presenceByUserId={presenceByUserId}
          {...(selectedRoomId === focusedNavigationTarget?.roomId &&
          focusedNavigationTarget.messageId !== undefined
            ? { highlightedMessageId: focusedNavigationTarget.messageId }
            : {})}
          isLoading={isLoadingMessages}
          onRetryMessage={(messageId) => void handleRetryMessage(messageId)}
          messagesEmptyLabel={labels?.messagesEmpty}
          selectRoomEmptyLabel={labels?.selectRoomEmpty}
        />

        <MessageComposer
          draft={draft}
          disabled={selectedRoom === null}
          isSending={isSending}
          inputRef={composerInputRef}
          onDraftChange={setDraft}
          onSend={(event) => void handleSend(event)}
        />
      </section>

      <ActivityPanel
        items={activityItems}
        isLoading={isLoadingNotifications}
        emptyLabel={labels?.notificationsEmpty}
        onMarkNotificationRead={(notificationId) => void handleMarkNotificationRead(notificationId)}
        onActivityItemClick={handleActivityItemClick}
      />
    </main>
  );
};
