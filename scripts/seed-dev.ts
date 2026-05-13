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

const artemId = '11111111-1111-4111-8111-111111111111';
const testerId = '22222222-2222-4222-8222-222222222222';
const taskId = 'task-123';
const projectId = 'internal';

type DevUsers = {
  artem: User;
  tester: User;
};

const upsertUser = async (data: {
  id: string;
  externalUserId: string;
  email: string;
  displayName: string;
  role: string;
}): Promise<User> =>
  prisma.user.upsert({
    where: {
      id: data.id,
    },
    create: {
      id: data.id,
      externalUserId: data.externalUserId,
      email: data.email,
      displayName: data.displayName,
      role: data.role,
      status: UserStatus.ACTIVE,
      authSource: AuthSource.STANDALONE,
    },
    update: {
      externalUserId: data.externalUserId,
      email: data.email,
      displayName: data.displayName,
      role: data.role,
      status: UserStatus.ACTIVE,
      authSource: AuthSource.STANDALONE,
    },
  });

const upsertDevUsers = async (): Promise<DevUsers> => {
  const artem = await upsertUser({
    id: artemId,
    externalUserId: 'dev-artem',
    email: 'artem@example.test',
    displayName: 'Artem',
    role: 'manager',
  });

  const tester = await upsertUser({
    id: testerId,
    externalUserId: 'dev-tester',
    email: 'tester@example.test',
    displayName: 'Tester',
    role: 'tester',
  });

  return {
    artem,
    tester,
  };
};

const upsertRoomByName = async (data: {
  type: RoomType;
  name: string;
  description: string;
  createdByUserId: string;
  taskId?: string;
  projectId?: string;
  taskRoomKind?: TaskRoomKind;
}): Promise<Room> => {
  const existingRoom = await prisma.room.findFirst({
    where: {
      name: data.name,
      type: data.type,
      taskId: data.taskId ?? null,
      taskRoomKind: data.taskRoomKind ?? null,
    },
  });

  const roomData = {
    type: data.type,
    visibility: RoomVisibility.PRIVATE,
    name: data.name,
    description: data.description,
    taskId: data.taskId ?? null,
    projectId: data.projectId ?? null,
    taskRoomKind: data.taskRoomKind ?? null,
    createdByUserId: data.createdByUserId,
    isArchived: false,
  };

  if (existingRoom !== null) {
    return prisma.room.update({
      where: {
        id: existingRoom.id,
      },
      data: roomData,
    });
  }

  return prisma.room.create({
    data: roomData,
  });
};

const upsertRooms = async (users: DevUsers): Promise<Room[]> => {
  const directRoom = await upsertRoomByName({
    type: RoomType.DIRECT,
    name: 'Direct Chat',
    description: 'Temporary direct chat for manual testing.',
    createdByUserId: users.artem.id,
  });

  const teamRoom = await upsertRoomByName({
    type: RoomType.GROUP,
    name: 'Team Room',
    description: 'Temporary group room for manual testing.',
    createdByUserId: users.artem.id,
  });

  const taskRoom = await upsertRoomByName({
    type: RoomType.TASK,
    name: 'task-123/internal',
    description: 'Temporary task room for manual testing.',
    createdByUserId: users.artem.id,
    taskId,
    projectId,
    taskRoomKind: TaskRoomKind.INTERNAL,
  });

  await prisma.taskRoomLink.upsert({
    where: {
      taskId_kind: {
        taskId,
        kind: TaskRoomKind.INTERNAL,
      },
    },
    create: {
      taskId,
      projectId,
      roomId: taskRoom.id,
      kind: TaskRoomKind.INTERNAL,
      source: AuthSource.STANDALONE,
      isPrimary: true,
    },
    update: {
      projectId,
      roomId: taskRoom.id,
      source: AuthSource.STANDALONE,
      isPrimary: true,
    },
  });

  return [directRoom, teamRoom, taskRoom];
};

const upsertMembership = async (
  room: Room,
  user: User,
  role: RoomMemberRole,
): Promise<void> => {
  await prisma.roomMember.upsert({
    where: {
      roomId_userId: {
        roomId: room.id,
        userId: user.id,
      },
    },
    create: {
      roomId: room.id,
      userId: user.id,
      role,
      source: RoomMemberSource.STANDALONE,
      notificationLevel: NotificationLevel.ALL,
    },
    update: {
      role,
      source: RoomMemberSource.STANDALONE,
      notificationLevel: NotificationLevel.ALL,
      leftAt: null,
    },
  });
};

const upsertMemberships = async (rooms: Room[], users: DevUsers): Promise<void> => {
  await Promise.all(
    rooms.flatMap((room) => [
      upsertMembership(room, users.artem, RoomMemberRole.MANAGER),
      upsertMembership(room, users.tester, RoomMemberRole.MEMBER),
    ]),
  );
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

const seedRoomMessages = async (room: Room, users: DevUsers): Promise<Message[]> => {
  const roomKey = room.name ?? room.id;
  const messages = [
    await upsertMessage(room, 1, {
      type: MessageType.SYSTEM_EVENT,
      eventType: 'manual-testing.room-ready',
      eventPayload: {
        roomName: room.name,
      },
      sourceEventId: `dev-seed:${roomKey}:system-ready`,
    }),
    await upsertMessage(room, 2, {
      senderUserId: users.artem.id,
      type: MessageType.TEXT,
      body: `Artem started testing in ${room.name}.`,
      sourceEventId: `dev-seed:${roomKey}:artem-1`,
    }),
    await upsertMessage(room, 3, {
      senderUserId: users.tester.id,
      type: MessageType.TEXT,
      body: `Tester can read and reply in ${room.name}.`,
      sourceEventId: `dev-seed:${roomKey}:tester-1`,
    }),
  ];

  const lastMessage = messages[messages.length - 1];

  if (lastMessage === undefined) {
    throw new Error('Expected seeded messages to exist.');
  }

  await prisma.room.update({
    where: {
      id: room.id,
    },
    data: {
      lastMessageId: lastMessage.id,
      lastMessageAt: lastMessage.createdAt,
    },
  });

  return messages;
};

const upsertReadState = async (
  room: Room,
  user: User,
  message: Message,
  unreadCountSnapshot: number,
): Promise<void> => {
  await prisma.readState.upsert({
    where: {
      userId_roomId: {
        userId: user.id,
        roomId: room.id,
      },
    },
    create: {
      roomId: room.id,
      userId: user.id,
      lastReadMessageId: message.id,
      lastReadSequence: message.sequence,
      lastReadAt: new Date(),
      unreadCountSnapshot,
    },
    update: {
      lastReadMessageId: message.id,
      lastReadSequence: message.sequence,
      lastReadAt: new Date(),
      unreadCountSnapshot,
    },
  });
};

const upsertReadStates = async (
  room: Room,
  users: DevUsers,
  messages: Message[],
): Promise<void> => {
  const artemReadMessage = messages[2];
  const testerReadMessage = messages[1];

  if (artemReadMessage === undefined || testerReadMessage === undefined) {
    throw new Error('Expected seeded read-state messages to exist.');
  }

  await upsertReadState(room, users.artem, artemReadMessage, 0);
  await upsertReadState(room, users.tester, testerReadMessage, 1);
};

const upsertNotification = async (data: {
  user: User;
  room: Room;
  message: Message;
  sourceEventId: string;
  title: string;
  body: string;
}): Promise<void> => {
  const existingNotification = await prisma.notification.findFirst({
    where: {
      userId: data.user.id,
      sourceEventId: data.sourceEventId,
    },
  });

  const notificationData = {
    roomId: data.room.id,
    messageId: data.message.id,
    type: 'message',
    title: data.title,
    body: data.body,
    priority: NotificationPriority.NORMAL,
    payload: {
      roomId: data.room.id,
      roomName: data.room.name,
    },
    deliveryState: NotificationDeliveryState.DELIVERED,
    readAt: null,
    deliveredAt: new Date(),
    sourceEventId: data.sourceEventId,
  };

  if (existingNotification === null) {
    await prisma.notification.create({
      data: {
        userId: data.user.id,
        ...notificationData,
      },
    });
    return;
  }

  await prisma.notification.update({
    where: {
      id: existingNotification.id,
    },
    data: notificationData,
  });
};

const printSummary = (users: DevUsers, rooms: Room[]): void => {
  console.log('Dev seed complete.');
  console.log('');
  console.log('Users:');
  console.log(`Artem:  ${users.artem.id}`);
  console.log(`Tester: ${users.tester.id}`);
  console.log('');
  console.log('Rooms:');
  rooms.forEach((room) => {
    console.log(`${room.name}: ${room.id}`);
  });
  console.log('');
  console.log('Open the playground at /chat/ after deploy.');
};

const main = async (): Promise<void> => {
  const users = await upsertDevUsers();
  const rooms = await upsertRooms(users);

  await upsertMemberships(rooms, users);

  for (const room of rooms) {
    const messages = await seedRoomMessages(room, users);
    await upsertReadStates(room, users, messages);

    const artemMessage = messages[1];

    if (artemMessage === undefined) {
      throw new Error('Expected Artem seed message to exist.');
    }

    await upsertNotification({
      user: users.tester,
      room,
      message: artemMessage,
      sourceEventId: `dev-seed:${room.name ?? room.id}:notification:tester`,
      title: `New message in ${room.name}`,
      body: `Artem posted a message in ${room.name}.`,
    });
  }

  printSummary(users, rooms);
};

try {
  await main();
} finally {
  await prisma.$disconnect();
}
