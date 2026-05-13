export type DevUser = {
  id: string;
  label: string;
};

export const devUsers = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    label: 'Artem',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    label: 'Tester',
  },
] as const satisfies readonly DevUser[];

export type RoomType = 'TASK' | 'DIRECT' | 'GROUP' | 'SYSTEM';

export type MessageType = 'TEXT' | 'SYSTEM_EVENT';

export type Message = {
  id: string;
  roomId: string;
  senderUserId: string | null;
  type: MessageType;
  body: string | null;
  eventType: string | null;
  eventPayload: unknown;
  sourceEventId: string | null;
  sequence: number;
  createdAt: string;
  updatedAt: string;
};

export type RoomListItem = {
  id: string;
  type: RoomType;
  name: string | null;
  description: string | null;
  taskId: string | null;
  projectId: string | null;
  taskRoomKind: string | null;
  lastMessageAt: string | null;
  lastMessage: Message | null;
  unreadCount: number;
};

export type Notification = {
  id: string;
  userId: string;
  roomId: string | null;
  messageId: string | null;
  type: string;
  title: string;
  body: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH';
  deliveryState: 'PENDING' | 'DELIVERED' | 'READ' | 'FAILED' | 'SUPPRESSED';
  readAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '/chat/api';

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const request = async <T>(
  userId: string,
  path: string,
  init: RequestInit = {},
): Promise<T> => {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-user-id': userId,
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new ApiError(body || response.statusText, response.status);
  }

  return (await response.json()) as T;
};

export const getRooms = (userId: string): Promise<RoomListItem[]> =>
  request<RoomListItem[]>(userId, '/rooms');

export const getMessages = (userId: string, roomId: string): Promise<Message[]> =>
  request<Message[]>(userId, `/rooms/${roomId}/messages?limit=50`);

export const sendMessage = (
  userId: string,
  roomId: string,
  body: string,
): Promise<Message> =>
  request<Message>(userId, `/rooms/${roomId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      body,
    }),
  });

export const markRoomRead = (
  userId: string,
  roomId: string,
  lastReadSequence: number,
): Promise<unknown> =>
  request<unknown>(userId, `/rooms/${roomId}/read`, {
    method: 'POST',
    body: JSON.stringify({
      lastReadSequence,
    }),
  });

export const getNotifications = (userId: string): Promise<Notification[]> =>
  request<Notification[]>(userId, '/notifications?state=all&limit=50');

export const markNotificationRead = (
  userId: string,
  notificationId: string,
): Promise<Notification> =>
  request<Notification>(userId, `/notifications/${notificationId}/read`, {
    method: 'POST',
  });
