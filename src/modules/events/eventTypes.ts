import { z } from 'zod';

export const eventsQuerySchema = z.object({
  userId: z.string().uuid().optional(),
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
};

export type ServerEventName = keyof ServerEventMap;

export type ServerEventPayload<TEventName extends ServerEventName> = ServerEventMap[TEventName];
