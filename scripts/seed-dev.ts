import 'dotenv/config';

import {
  AuthSource,
  MessageType,
  NotificationDeliveryState,
  NotificationLevel,
  NotificationPriority,
  RoomMemberRole,
  RoomMemberSource,
  RoomType,
  RoomVisibility,
  TaskRoomKind,
  UserStatus,
} from '@prisma/client';
import { PrismaClient } from '@prisma/client';
import type { Message, Prisma, Room, User } from '@prisma/client';

const prisma = new PrismaClient();

const devTaskId = 'task-123';
const devProjectId = 'project-123';
const devRoomKind = TaskRoomKind.INTERNAL;

type DevUsers = {
  manager: User;
  employee: User;
  observer: User;
};

const upsertDevUsers = async (): Promise<DevUsers> => {
  const manager = await prisma.user.upsert({
    where: {
      externalUserId: 'dev-manager',
    },
    create: {
      externalUserId: 'dev-manager',
      email: 'dev-manager@example.test',
      displayName: 'Dev Manager',
      role: 'manager',
      status: UserStatus.ACTIVE,
      authSource: AuthSource.STANDALONE,
    },
    update: {
      email: 'dev-manager@example.test',
      displayName: 'Dev Manager',
      role: 'manager',
      status: UserStatus.ACTIVE,
      authSource: AuthSource.STANDALONE,
    },
  });

  const employee = await prisma.user.upsert({
    where: {
      externalUserId: 'dev-employee',
    },
    create: {
      externalUserId: 'dev-employee',
      email: 'dev-employee@example.test',
      displayName: 'Dev Employee',
      role: 'employee',
      status: UserStatus.ACTIVE,
      authSource: AuthSource.STANDALONE,
    },
    update: {
      email: 'dev-employee@example.test',
      displayName: 'Dev Employee',
      role: 'employee',
      status: UserStatus.ACTIVE,
      authSource: AuthSource.STANDALONE,
    },
  });

  const observer = await prisma.user.upsert({
    where: {
      externalUserId: 'dev-observer',
    },
    create: {
      externalUserId: 'dev-observer',
      email: 'dev-observer@example.test',
      displayName: 'Dev Observer',
      role: 'observer',
      status: UserStatus.ACTIVE,
      authSource: AuthSource.STANDALONE,
    },
    update: {
      email: 'dev-observer@example.test',
      displayName: 'Dev Observer',
      role: 'observer',
      status: UserStatus.ACTIVE,
      authSource: AuthSource.STANDALONE,
    },
  });

  return {
    manager,
    employee,
    observer,
  };
};

const upsertDevRoom = async (manager: User): Promise<Room> => {
  const existingRoom = await prisma.room.findFirst({
    where: {
      type: RoomType.TASK,
      taskId: devTaskId,
      projectId: devProjectId,
      taskRoomKind: devRoomKind,
    },
  });

  if (existingRoom !== null) {
    return prisma.room.update({
      where: {
        id: existingRoom.id,
      },
      data: {
        visibility: RoomVisibility.PRIVATE,
        name: 'Dev Task Room',
        description: 'Local development task chat room.',
        createdByUserId: manager.id,
        isArchived: false,
      },
    });
  }

  return prisma.room.create({
    data: {
      type: RoomType.TASK,
      visibility: RoomVisibility.PRIVATE,
      name: 'Dev Task Room',
      description: 'Local development task chat room.',
      taskId: devTaskId,
      projectId: devProjectId,
      taskRoomKind: devRoomKind,
      createdByUserId: manager.id,
    },
  });
};

const upsertMemberships = async (room: Room, users: DevUsers): Promise<void> => {
  await prisma.roomMember.upsert({
    where: {
      roomId_userId: {
        roomId: room.id,
        userId: users.manager.id,
      },
    },
    create: {
      roomId: room.id,
      userId: users.manager.id,
      role: RoomMemberRole.MANAGER,
      source: RoomMemberSource.STANDALONE,
      notificationLevel: NotificationLevel.ALL,
    },
    update: {
      role: RoomMemberRole.MANAGER,
      source: RoomMemberSource.STANDALONE,
      notificationLevel: NotificationLevel.ALL,
      leftAt: null,
    },
  });

  await prisma.roomMember.upsert({
    where: {
      roomId_userId: {
        roomId: room.id,
        userId: users.employee.id,
      },
    },
    create: {
      roomId: room.id,
      userId: users.employee.id,
      role: RoomMemberRole.MEMBER,
      source: RoomMemberSource.STANDALONE,
      notificationLevel: NotificationLevel.ALL,
    },
    update: {
      role: RoomMemberRole.MEMBER,
      source: RoomMemberSource.STANDALONE,
      notificationLevel: NotificationLevel.ALL,
      leftAt: null,
    },
  });
};

const upsertMessage = async (
  room: Room,
  sequence: number,
  data: {
    senderUserId?: string;
    type: MessageType;
    body?: string;
    eventType?: string;
    eventPayload?: Prisma.InputJsonValue;
    sourceEventId: string;
  },
): Promise<Message> =>
  prisma.message.upsert({
    where: {
      sourceEventId: data.sourceEventId,
    },
    create: {
      roomId: room.id,
      senderUserId: data.senderUserId ?? null,
      type: data.type,
      body: data.body ?? null,
      eventType: data.eventType ?? null,
      eventPayload: data.eventPayload ?? {},
      sourceEventId: data.sourceEventId,
      sequence,
    },
    update: {
      senderUserId: data.senderUserId ?? null,
      type: data.type,
      body: data.body ?? null,
      eventType: data.eventType ?? null,
      eventPayload: data.eventPayload ?? {},
      sequence,
    },
  });

const upsertMessages = async (room: Room, users: DevUsers): Promise<Message[]> => {
  const messages = [
    await upsertMessage(room, 1, {
      type: MessageType.SYSTEM_EVENT,
      eventType: 'task.created',
      eventPayload: {
        taskId: devTaskId,
        projectId: devProjectId,
      },
      sourceEventId: 'dev-seed:task-123:system-event:task-created',
    }),
    await upsertMessage(room, 2, {
      senderUserId: users.manager.id,
      type: MessageType.TEXT,
      body: 'Please check the task details before the daily sync.',
      sourceEventId: 'dev-seed:task-123:message:manager-1',
    }),
    await upsertMessage(room, 3, {
      senderUserId: users.employee.id,
      type: MessageType.TEXT,
      body: 'I reviewed it and left the latest status here.',
      sourceEventId: 'dev-seed:task-123:message:employee-1',
    }),
  ];

  const lastMessage = messages[messages.length - 1];

  if (lastMessage !== undefined) {
    await prisma.room.update({
      where: {
        id: room.id,
      },
      data: {
        lastMessageId: lastMessage.id,
        lastMessageAt: lastMessage.createdAt,
      },
    });
  }

  return messages;
};

const upsertReadStates = async (room: Room, users: DevUsers, messages: Message[]): Promise<void> => {
  const managerLastRead = messages[2];
  const employeeLastRead = messages[1];

  if (managerLastRead === undefined || employeeLastRead === undefined) {
    throw new Error('Expected dev seed messages to exist.');
  }

  await prisma.readState.upsert({
    where: {
      userId_roomId: {
        userId: users.manager.id,
        roomId: room.id,
      },
    },
    create: {
      roomId: room.id,
      userId: users.manager.id,
      lastReadMessageId: managerLastRead.id,
      lastReadSequence: managerLastRead.sequence,
      lastReadAt: new Date(),
      unreadCountSnapshot: 0,
    },
    update: {
      lastReadMessageId: managerLastRead.id,
      lastReadSequence: managerLastRead.sequence,
      lastReadAt: new Date(),
      unreadCountSnapshot: 0,
    },
  });

  await prisma.readState.upsert({
    where: {
      userId_roomId: {
        userId: users.employee.id,
        roomId: room.id,
      },
    },
    create: {
      roomId: room.id,
      userId: users.employee.id,
      lastReadMessageId: employeeLastRead.id,
      lastReadSequence: employeeLastRead.sequence,
      lastReadAt: new Date(),
      unreadCountSnapshot: 1,
    },
    update: {
      lastReadMessageId: employeeLastRead.id,
      lastReadSequence: employeeLastRead.sequence,
      lastReadAt: new Date(),
      unreadCountSnapshot: 1,
    },
  });
};

const upsertEmployeeNotification = async (
  room: Room,
  employee: User,
  message: Message,
): Promise<void> => {
  const sourceEventId = 'dev-seed:task-123:notification:employee-1';
  const existingNotification = await prisma.notification.findFirst({
    where: {
      userId: employee.id,
      sourceEventId,
    },
  });

  const data = {
    roomId: room.id,
    messageId: message.id,
    type: 'message',
    title: 'New task chat message',
    body: 'Dev Manager posted a message in Dev Task Room.',
    priority: NotificationPriority.NORMAL,
    payload: {
      taskId: devTaskId,
      roomId: room.id,
    },
    deliveryState: NotificationDeliveryState.DELIVERED,
    readAt: null,
    deliveredAt: new Date(),
    sourceEventId,
  };

  if (existingNotification === null) {
    await prisma.notification.create({
      data: {
        userId: employee.id,
        ...data,
      },
    });
    return;
  }

  await prisma.notification.update({
    where: {
      id: existingNotification.id,
    },
    data,
  });
};

const printSummary = (users: DevUsers, room: Room): void => {
  const baseUrl = 'http://localhost:4100';

  console.log('Dev seed complete.');
  console.log('');
  console.log('Users:');
  console.log(`manager:  ${users.manager.id}`);
  console.log(`employee: ${users.employee.id}`);
  console.log(`observer: ${users.observer.id}`);
  console.log('');
  console.log(`Room: ${room.id}`);
  console.log('');
  console.log('Example curl commands:');
  console.log(`curl -H "x-user-id: ${users.employee.id}" ${baseUrl}/rooms`);
  console.log(`curl -H "x-user-id: ${users.employee.id}" ${baseUrl}/rooms/${room.id}/messages`);
  console.log(`curl -H "x-user-id: ${users.employee.id}" "${baseUrl}/notifications?state=all"`);
};

const main = async (): Promise<void> => {
  const users = await upsertDevUsers();
  const room = await upsertDevRoom(users.manager);

  await upsertMemberships(room, users);
  const messages = await upsertMessages(room, users);
  await upsertReadStates(room, users, messages);

  const managerMessage = messages[1];

  if (managerMessage === undefined) {
    throw new Error('Expected manager seed message to exist.');
  }

  await upsertEmployeeNotification(room, users.employee, managerMessage);
  printSummary(users, room);
};

try {
  await main();
} finally {
  await prisma.$disconnect();
}
