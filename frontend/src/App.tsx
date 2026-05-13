import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';

import {
  devUsers,
  getMessages,
  getNotifications,
  getRooms,
  markNotificationRead,
  markRoomRead,
  sendMessage,
} from './api';
import type { DevUser, Message, Notification, RoomListItem } from './api';

const formatTime = (value: string | null): string => {
  if (value === null) {
    return '';
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

const getRoomLabel = (room: RoomListItem): string =>
  room.name ?? room.taskId ?? `${room.type.toLowerCase()} room`;

const getPreview = (message: Message | null): string => {
  if (message === null) {
    return 'No messages yet';
  }

  if (message.type === 'SYSTEM_EVENT') {
    return message.eventType ?? 'System event';
  }

  return message.body ?? '';
};

export const App = (): ReactElement => {
  const [selectedUser, setSelectedUser] = useState<DevUser | null>(null);
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [draft, setDraft] = useState('');
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === selectedRoomId) ?? null,
    [rooms, selectedRoomId],
  );

  const sortedMessages = useMemo(
    () => [...messages].sort((left, right) => left.sequence - right.sequence),
    [messages],
  );

  const lastSequence = sortedMessages.at(-1)?.sequence ?? 0;

  const loadRooms = useCallback(async () => {
    if (selectedUser === null) {
      return;
    }

    setIsLoadingRooms(true);
    try {
      const nextRooms = await getRooms(selectedUser.id);
      setRooms(nextRooms);
      setError(null);
      setSelectedRoomId((currentRoomId) => {
        if (currentRoomId !== null && nextRooms.some((room) => room.id === currentRoomId)) {
          return currentRoomId;
        }

        return nextRooms[0]?.id ?? null;
      });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Failed to load rooms.');
    } finally {
      setIsLoadingRooms(false);
    }
  }, [selectedUser]);

  const loadMessages = useCallback(async () => {
    if (selectedUser === null || selectedRoomId === null) {
      setMessages([]);
      return;
    }

    setIsLoadingMessages(true);
    try {
      const nextMessages = await getMessages(selectedUser.id, selectedRoomId);
      setMessages(nextMessages);
      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Failed to load messages.');
    } finally {
      setIsLoadingMessages(false);
    }
  }, [selectedRoomId, selectedUser]);

  const loadNotifications = useCallback(async () => {
    if (selectedUser === null) {
      return;
    }

    setIsLoadingNotifications(true);
    try {
      const nextNotifications = await getNotifications(selectedUser.id);
      setNotifications(nextNotifications);
      setError(null);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Failed to load notifications.',
      );
    } finally {
      setIsLoadingNotifications(false);
    }
  }, [selectedUser]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadRooms(), loadMessages(), loadNotifications()]);
  }, [loadMessages, loadNotifications, loadRooms]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void loadMessages();
      void loadRooms();
    }, 4_000);

    return () => window.clearInterval(intervalId);
  }, [loadMessages, loadRooms]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void loadNotifications();
    }, 5_000);

    return () => window.clearInterval(intervalId);
  }, [loadNotifications]);

  const handleSend = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    if (selectedUser === null || selectedRoomId === null || draft.trim().length === 0) {
      return;
    }

    setIsSending(true);
    try {
      await sendMessage(selectedUser.id, selectedRoomId, draft.trim());
      setDraft('');
      await refreshAll();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Failed to send message.');
    } finally {
      setIsSending(false);
    }
  };

  const handleMarkRoomRead = async (): Promise<void> => {
    if (selectedUser === null || selectedRoomId === null || lastSequence === 0) {
      return;
    }

    try {
      await markRoomRead(selectedUser.id, selectedRoomId, lastSequence);
      await refreshAll();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Failed to mark room read.');
    }
  };

  const handleMarkNotificationRead = async (notificationId: string): Promise<void> => {
    if (selectedUser === null) {
      return;
    }

    try {
      await markNotificationRead(selectedUser.id, notificationId);
      await loadNotifications();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Failed to mark notification read.',
      );
    }
  };

  if (selectedUser === null) {
    return (
      <main className="login-screen">
        <section className="login-panel">
          <p className="eyebrow">Internal testing</p>
          <h1>Chat playground</h1>
          <div className="user-grid">
            {devUsers.map((user) => (
              <button key={user.id} type="button" onClick={() => setSelectedUser(user)}>
                <span>{user.label}</span>
                <small>{user.id}</small>
              </button>
            ))}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div>
            <p className="eyebrow">User</p>
            <strong>{selectedUser.label}</strong>
          </div>
          <button type="button" onClick={() => setSelectedUser(null)}>
            Switch
          </button>
        </div>

        <div className="toolbar">
          <button type="button" onClick={() => void refreshAll()}>
            Refresh
          </button>
          {isLoadingRooms ? <span>Loading rooms...</span> : null}
        </div>

        <nav className="room-list" aria-label="Rooms">
          {rooms.length === 0 && !isLoadingRooms ? (
            <p className="empty-state">No rooms for this user. Run the dev seed.</p>
          ) : null}
          {rooms.map((room) => (
            <button
              key={room.id}
              type="button"
              className={room.id === selectedRoomId ? 'room-item active' : 'room-item'}
              onClick={() => setSelectedRoomId(room.id)}
            >
              <span className="room-title-row">
                <strong>{getRoomLabel(room)}</strong>
                {room.unreadCount > 0 ? <em>{room.unreadCount}</em> : null}
              </span>
              <span className="room-preview">{getPreview(room.lastMessage)}</span>
              <span className="room-meta">{formatTime(room.lastMessageAt)}</span>
            </button>
          ))}
        </nav>
      </aside>

      <section className="chat-panel">
        <header className="chat-header">
          <div>
            <p className="eyebrow">Room</p>
            <h2>{selectedRoom !== null ? getRoomLabel(selectedRoom) : 'Select a room'}</h2>
          </div>
          <button
            type="button"
            onClick={() => void handleMarkRoomRead()}
            disabled={selectedRoom === null || lastSequence === 0}
          >
            Mark as read
          </button>
        </header>

        {error !== null ? <div className="error-banner">{error}</div> : null}

        <div className="messages">
          {isLoadingMessages ? <p className="loading-state">Loading messages...</p> : null}
          {selectedRoom === null && !isLoadingMessages ? (
            <p className="empty-state">Choose a room to read messages.</p>
          ) : null}
          {selectedRoom !== null && sortedMessages.length === 0 && !isLoadingMessages ? (
            <p className="empty-state">No messages yet.</p>
          ) : null}
          {sortedMessages.map((message) => (
            <article
              key={message.id}
              className={message.senderUserId === selectedUser.id ? 'message mine' : 'message'}
            >
              <div className="message-meta">
                <span>{message.senderUserId === null ? 'System' : message.senderUserId}</span>
                <time>{formatTime(message.createdAt)}</time>
              </div>
              <p>{message.type === 'SYSTEM_EVENT' ? message.eventType : message.body}</p>
            </article>
          ))}
        </div>

        <form className="composer" onSubmit={(event) => void handleSend(event)}>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Write a test message"
            disabled={selectedRoom === null || isSending}
          />
          <button
            type="submit"
            disabled={selectedRoom === null || isSending || draft.trim().length === 0}
          >
            Send
          </button>
        </form>
      </section>

      <aside className="notifications">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Notifications</p>
            <strong>{notifications.filter((item) => item.readAt === null).length} unread</strong>
          </div>
          {isLoadingNotifications ? <span>Loading...</span> : null}
        </div>

        <div className="notification-list">
          {notifications.length === 0 && !isLoadingNotifications ? (
            <p className="empty-state">No notifications.</p>
          ) : null}
          {notifications.map((notification) => (
            <article
              key={notification.id}
              className={notification.readAt === null ? 'notification unread' : 'notification'}
            >
              <strong>{notification.title}</strong>
              <p>{notification.body}</p>
              <time>{formatTime(notification.createdAt)}</time>
              {notification.readAt === null ? (
                <button
                  type="button"
                  onClick={() => void handleMarkNotificationRead(notification.id)}
                >
                  Mark read
                </button>
              ) : null}
            </article>
          ))}
        </div>
      </aside>
    </main>
  );
};
