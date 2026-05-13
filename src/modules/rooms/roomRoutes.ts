import { MessageType } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';

import { createMessage, listRoomMessages } from '../messages/messageService.js';
import { markRoomRead } from '../read-states/readStateService.js';
import { getAuthenticatedUser, requireDevAuth } from '../../shared/auth/devAuth.js';
import { canReadRoom, canWriteRoom } from './roomPermissions.js';
import { listRoomsForUser } from './roomService.js';
import {
  markRoomReadBodySchema,
  postRoomMessageBodySchema,
  roomIdParamsSchema,
  roomMessagesQuerySchema,
} from './roomSchemas.js';

export const registerRoomRoutes = (app: FastifyInstance, prisma: PrismaClient): void => {
  app.get('/rooms', { preHandler: requireDevAuth }, async (request) => {
    const user = getAuthenticatedUser(request);

    return listRoomsForUser(prisma, user.id);
  });

  app.get('/rooms/:roomId/messages', { preHandler: requireDevAuth }, async (request) => {
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

  app.post('/rooms/:roomId/messages', { preHandler: requireDevAuth }, async (request) => {
    const user = getAuthenticatedUser(request);
    const params = roomIdParamsSchema.parse(request.params);
    const body = postRoomMessageBodySchema.parse(request.body);

    await canWriteRoom(prisma, params.roomId, user.id);

    return createMessage(prisma, {
      roomId: params.roomId,
      senderUserId: user.id,
      type: MessageType.TEXT,
      body: body.body,
      eventPayload: {},
    });
  });

  app.post('/rooms/:roomId/read', { preHandler: requireDevAuth }, async (request) => {
    const user = getAuthenticatedUser(request);
    const params = roomIdParamsSchema.parse(request.params);
    const body = markRoomReadBodySchema.parse(request.body);

    await canReadRoom(prisma, params.roomId, user.id);

    return markRoomRead(prisma, {
      roomId: params.roomId,
      userId: user.id,
      lastReadSequence: body.lastReadSequence,
    });
  });
};
