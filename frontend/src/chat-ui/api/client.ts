import type {
  ChatWidgetAuth,
  ChatWidgetRoomScope,
  Message,
  Notification,
  RoomListItem,
  TaskRoomLookupResult,
} from '../types';

export type ChatApiClientConfig = {
  apiBaseUrl: string;
  auth: ChatWidgetAuth;
};

export type ChatApiClient = {
  getRooms: () => Promise<RoomListItem[]>;
  lookupTaskRoom: (taskId: string, roomScope: ChatWidgetRoomScope) => Promise<TaskRoomLookupResult>;
  getMessages: (roomId: string) => Promise<Message[]>;
  createMessageIdempotencyKey: () => string;
  sendMessage: (roomId: string, body: string, idempotencyKey?: string) => Promise<Message>;
  markRoomRead: (roomId: string, lastReadSequence: number) => Promise<unknown>;
  getNotifications: () => Promise<Notification[]>;
  markNotificationRead: (notificationId: string) => Promise<Notification>;
  getEventsUrl: () => string;
};

export class ChatApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const buildAuthHeaders = (auth: ChatWidgetAuth): HeadersInit => {
  if (auth.strategy === 'dev-user-id') {
    return {
      'x-user-id': auth.userId,
    };
  }

  if (auth.strategy === 'bearer' && auth.token !== undefined) {
    return {
      authorization: `Bearer ${auth.token}`,
    };
  }

  return {};
};

const createIdempotencyKey = (): string => {
  if (globalThis.crypto?.randomUUID !== undefined) {
    return globalThis.crypto.randomUUID();
  }

  if (globalThis.crypto?.getRandomValues !== undefined) {
    const values = new Uint32Array(4);
    globalThis.crypto.getRandomValues(values);
    return Array.from(values, (value) => value.toString(16).padStart(8, '0')).join('-');
  }

  return `message-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const request = async <T>(
  config: ChatApiClientConfig,
  path: string,
  init: RequestInit = {},
): Promise<T> => {
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...buildAuthHeaders(config.auth),
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    const isAccessDenied = response.status === 403 || response.status === 404;

    if (isAccessDenied && (path.startsWith('/rooms/') || path.startsWith('/task-rooms/'))) {
      throw new ChatApiError('You do not have access to this room.', response.status);
    }

    if (isAccessDenied && path.startsWith('/notifications/')) {
      throw new ChatApiError('Notification was not found.', response.status);
    }

    throw new ChatApiError(body || response.statusText, response.status);
  }

  return (await response.json()) as T;
};

export const createChatApiClient = (config: ChatApiClientConfig): ChatApiClient => ({
  getRooms: () => request<RoomListItem[]>(config, '/rooms'),

  lookupTaskRoom: (taskId, roomScope) => {
    const query = new URLSearchParams({
      taskId,
      roomScope,
    });

    return request<TaskRoomLookupResult>(config, `/task-rooms/lookup?${query.toString()}`);
  },

  getMessages: (roomId) => request<Message[]>(config, `/rooms/${roomId}/messages?limit=50`),

  createMessageIdempotencyKey: createIdempotencyKey,

  sendMessage: (roomId, body, idempotencyKey = createIdempotencyKey()) =>
    request<Message>(config, `/rooms/${roomId}/messages`, {
      method: 'POST',
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        body,
      }),
    }),

  markRoomRead: (roomId, lastReadSequence) =>
    request<unknown>(config, `/rooms/${roomId}/read`, {
      method: 'POST',
      body: JSON.stringify({
        lastReadSequence,
      }),
    }),

  getNotifications: () => request<Notification[]>(config, '/notifications?state=all&limit=50'),

  markNotificationRead: (notificationId) =>
    request<Notification>(config, `/notifications/${notificationId}/read`, {
      method: 'POST',
    }),

  getEventsUrl: () => {
    const url = new URL(`${config.apiBaseUrl}/events`, window.location.origin);

    if (config.auth.strategy === 'dev-user-id') {
      url.searchParams.set('userId', config.auth.userId);
    }

    if (config.auth.strategy === 'bearer' && config.auth.token !== undefined) {
      url.searchParams.set('accessToken', config.auth.token);
    }

    return url.toString();
  },
});
