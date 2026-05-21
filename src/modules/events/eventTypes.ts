import { z } from 'zod';

export const eventsQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  accessToken: z.string().min(1).optional(),
});

export type ServerEventMap = {
  'message.created': {
    roomId: string;
    messageId: string;
    senderId: string | null;
    createdAt: string;
    preview: string | null;
  };
  'notification.created': {
    notificationId: string;
    roomId: string | null;
    messageId: string | null;
    title: string;
    body: string;
  };
  'notification.read': {
    notificationId: string;
  };
  'room.read': {
    roomId: string;
    userId: string;
  };
  'presence.changed': {
    userId: string;
    status: 'online' | 'offline';
    lastSeenAt: string;
  };
};

export type ServerEventName = keyof ServerEventMap;

export type ServerEventPayload<TEventName extends ServerEventName> = ServerEventMap[TEventName];
