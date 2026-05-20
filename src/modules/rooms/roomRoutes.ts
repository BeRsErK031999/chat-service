import { MessageType } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';

import {
  publishMessageCreated,
  publishNotificationCreated,
  publishRoomRead,
} from '../events/eventPublisher.js';
import { sseConnectionManager } from '../events/sseConnectionManager.js';
import type { SseConnectionManager } from '../events/sseConnectionManager.js';
import {
  createMessageWithNotifications,
  createMessageWithNotificationsIdempotent,
  listRoomMessages,
} from '../messages/messageService.js';
import { markRoomRead } from '../read-states/readStateService.js';
import {
  authenticateRequest,
  getAuthenticatedUser,
} from '../auth/authMiddleware.js';
import { canReadRoom, canWriteRoom } from './roomPermissions.js';
import { listRoomsForUser, lookupTaskRoomForUser } from './roomService.js';
import {
  idempotencyKeyHeaderSchema,
  markRoomReadBodySchema,
  postRoomMessageBodySchema,
  roomIdParamsSchema,
  roomMessagesQuerySchema,
  taskRoomLookupQuerySchema,
} from './roomSchemas.js';

export const registerRoomRoutes = (
  app: FastifyInstance,
  prisma: PrismaClient,
  eventManager: SseConnectionManager = sseConnectionManager,
): void => {
  app.get('/rooms', { preHandler: authenticateRequest }, async (request) => {
    const user = getAuthenticatedUser(request);

    return listRoomsForUser(prisma, user.id);
  });

  app.get('/task-rooms/lookup', { preHandler: authenticateRequest }, async (request) => {
    const user = getAuthenticatedUser(request);
    const query = taskRoomLookupQuerySchema.parse(request.query);

    return lookupTaskRoomForUser(prisma, {
      userId: user.id,
      taskId: query.taskId,
      roomScope: query.roomScope,
    });
  });

  app.get('/rooms/:roomId/messages', { preHandler: authenticateRequest }, async (request) => {
    const user = getAuthenticatedUser(request);
    const params = roomIdParamsSchema.parse(request.params);
    const query = roomMessagesQuerySchema.parse(request.query);

    await canReadRoom(prisma, params.roomId, user.id);

    const listInput = {
      roomId: params.roomId,
      limit: query.limit,
    };

    if (query.beforeSequence !== undefined) {
      return listRoomMessages(prisma, {
        ...listInput,
        beforeSequence: query.beforeSequence,
      });
    }

    return listRoomMessages(prisma, listInput);
  });

  app.post('/rooms/:roomId/messages', { preHandler: authenticateRequest }, async (request) => {
    const user = getAuthenticatedUser(request);
    const params = roomIdParamsSchema.parse(request.params);
    const body = postRoomMessageBodySchema.parse(request.body);
    const idempotencyKey = idempotencyKeyHeaderSchema.parse(
      request.headers['idempotency-key'],
    );

    await canWriteRoom(prisma, params.roomId, user.id);

    const input = {
      roomId: params.roomId,
      senderUserId: user.id,
      type: MessageType.TEXT,
      body: body.body,
      eventPayload: {},
    };

    const result =
      idempotencyKey !== undefined
        ? await createMessageWithNotificationsIdempotent(prisma, input, idempotencyKey)
        : await createMessageWithNotifications(prisma, input);

    if (result.created) {
      await publishMessageCreated(prisma, result.message, eventManager);
      for (const notification of result.notifications) {
        publishNotificationCreated(notification, eventManager);
      }
    }

    return result.message;
  });

  app.post('/rooms/:roomId/read', { preHandler: authenticateRequest }, async (request) => {
    const user = getAuthenticatedUser(request);
    const params = roomIdParamsSchema.parse(request.params);
    const body = markRoomReadBodySchema.parse(request.body);

    await canReadRoom(prisma, params.roomId, user.id);

    const readState = await markRoomRead(prisma, {
      roomId: params.roomId,
      userId: user.id,
      lastReadSequence: body.lastReadSequence,
    });

    publishRoomRead(readState, eventManager);

    return readState;
  });
};
