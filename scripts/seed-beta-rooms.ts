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

const betaManagerId = '33333333-3333-4333-8333-333333333333';
const betaTesterId = '44444444-4444-4444-8444-444444444444';
const betaSupportId = '55555555-5555-4555-8555-555555555555';
const betaProjectId = 'beta-test-object';
const betaTaskId = 'beta-deadline-check';

type SeedTarget = 'development' | 'dev' | 'test' | 'staging';

type BetaUsers = {
  manager: User;
  tester: User;
  support: User;
};

type BetaRoomSeed = {
  key: string;
  type: RoomType;
  name: string;
  description: string;
  taskId?: string;
  projectId?: string;
  taskRoomKind?: TaskRoomKind;
};

type BetaMessageSeed = {
  senderUserId?: string;
  type: MessageType;
  body?: string;
  eventType?: string;
  eventPayload?: Prisma.InputJsonValue;
  sourceEventKey: string;
};

const betaRooms: BetaRoomSeed[] = [
  {
    key: 'general',
    type: RoomType.GROUP,
    name: 'Общий чат beta',
    description: 'Общий beta-чат для проверки сообщений, unread и activity.',
  },
  {
    key: 'project-test-object',
    type: RoomType.GROUP,
    name: 'Проект: Тестовый объект',
    description: 'Beta-комната проекта для проверки проектного контекста.',
    projectId: betaProjectId,
  },
  {
    key: 'task-deadline-check',
    type: RoomType.TASK,
    name: 'Задача: Проверка сроков',
    description: 'Beta-комната задачи для проверки обсуждения сроков.',
    taskId: betaTaskId,
    projectId: betaProjectId,
    taskRoomKind: TaskRoomKind.INTERNAL,
  },
  {
    key: 'support-bugs',
    type: RoomType.GROUP,
    name: 'Поддержка / баги',
    description: 'Комната для сообщений о проблемах beta-сборки.',
  },
  {
    key: 'direct-chat',
    type: RoomType.DIRECT,
    name: 'Direct Chat',
    description: 'Прямой beta-чат между тестировщиком и менеджером.',
  },
];

const allowedTargets = new Set<SeedTarget>(['development', 'dev', 'test', 'staging']);

const parseArgs = (): { dryRun: boolean } => ({
  dryRun: process.argv.slice(2).includes('--dry-run'),
});

const resolveSeedTarget = (): string =>
  process.env.CHAT_BETA_SEED_TARGET?.trim() || process.env.NODE_ENV?.trim() || 'development';

const assertSeedTargetAllowed = (): SeedTarget => {
  const target = resolveSeedTarget().toLowerCase();

  if (!allowedTargets.has(target as SeedTarget)) {
    throw new Error(
      `Refusing to seed beta chat rooms for target "${target}". Set CHAT_BETA_SEED_TARGET to development, test, or staging.`,
    );
  }

  return target as SeedTarget;
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

const upsertBetaUsers = async (): Promise<BetaUsers> => {
  const manager = await upsertUser({
    id: betaManagerId,
    externalUserId: 'beta-manager-1',
    email: 'beta.manager@example.local',
    displayName: 'Beta Manager',
    role: 'manager',
  });

  const tester = await upsertUser({
    id: betaTesterId,
    externalUserId: 'beta-tester-1',
    email: 'beta.tester@example.local',
    displayName: 'Beta Tester',
    role: 'tester',
  });

  const support = await upsertUser({
    id: betaSupportId,
    externalUserId: 'beta-support-1',
    email: 'beta.support@example.local',
    displayName: 'Beta Support',
    role: 'support',
  });

  return {
    manager,
    tester,
    support,
  };
};

const upsertRoom = async (seed: BetaRoomSeed, createdByUserId: string): Promise<Room> => {
  const existingRoom = await prisma.room.findFirst({
    where: {
      name: seed.name,
      type: seed.type,
      taskId: seed.taskId ?? null,
      projectId: seed.projectId ?? null,
      taskRoomKind: seed.taskRoomKind ?? null,
    },
  });

  const data = {
    type: seed.type,
    visibility: RoomVisibility.PRIVATE,
    name: seed.name,
    description: seed.description,
    taskId: seed.taskId ?? null,
    projectId: seed.projectId ?? null,
    taskRoomKind: seed.taskRoomKind ?? null,
    createdByUserId,
    isArchived: false,
  };

  if (existingRoom !== null) {
    return prisma.room.update({
      where: {
        id: existingRoom.id,
      },
      data,
    });
  }

  return prisma.room.create({
    data,
  });
};

const upsertTaskRoomLink = async (room: Room): Promise<void> => {
  if (room.taskId === null || room.taskRoomKind === null) {
    return;
  }

  await prisma.taskRoomLink.upsert({
    where: {
      taskId_kind: {
        taskId: room.taskId,
        kind: room.taskRoomKind,
      },
    },
    create: {
      taskId: room.taskId,
      projectId: room.projectId,
      roomId: room.id,
      kind: room.taskRoomKind,
      source: AuthSource.STANDALONE,
      isPrimary: true,
    },
    update: {
      projectId: room.projectId,
      roomId: room.id,
      source: AuthSource.STANDALONE,
      isPrimary: true,
    },
  });
};

const upsertRooms = async (users: BetaUsers): Promise<Room[]> => {
  const rooms: Room[] = [];

  for (const seed of betaRooms) {
    const room = await upsertRoom(seed, users.manager.id);
    await upsertTaskRoomLink(room);
    rooms.push(room);
  }

  return rooms;
};

const upsertMembership = async (room: Room, user: User, role: RoomMemberRole): Promise<void> => {
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

const upsertMemberships = async (rooms: Room[], users: BetaUsers): Promise<void> => {
  await Promise.all(
    rooms.flatMap((room) => [
      upsertMembership(room, users.manager, RoomMemberRole.MANAGER),
      upsertMembership(room, users.tester, RoomMemberRole.MEMBER),
      upsertMembership(room, users.support, RoomMemberRole.OBSERVER),
    ]),
  );
};

const upsertMessage = async (
  room: Room,
  sequence: number,
  data: BetaMessageSeed,
): Promise<Message> =>
  prisma.message.upsert({
    where: {
      sourceEventId: `beta-seed:${room.id}:${data.sourceEventKey}`,
    },
    create: {
      roomId: room.id,
      senderUserId: data.senderUserId ?? null,
      type: data.type,
      body: data.body ?? null,
      eventType: data.eventType ?? null,
      eventPayload: data.eventPayload ?? {},
      sourceEventId: `beta-seed:${room.id}:${data.sourceEventKey}`,
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

const buildRoomMessages = (room: Room, users: BetaUsers): BetaMessageSeed[] => [
  {
    type: MessageType.SYSTEM_EVENT,
    eventType: 'beta.room-ready',
    eventPayload: {
      roomId: room.id,
      roomName: room.name,
      seededFor: 'desktop-beta-testing',
    },
    sourceEventKey: 'room-ready',
  },
  {
    senderUserId: users.manager.id,
    type: MessageType.TEXT,
    body: `Добро пожаловать в "${room.name ?? room.id}". Эта комната создана для beta-проверки реального chat-service.`,
    sourceEventKey: 'welcome',
  },
  {
    senderUserId: users.tester.id,
    type: MessageType.TEXT,
    body: 'Проверяю unread/activity: это сообщение должно помочь увидеть новое событие в списке комнат.',
    sourceEventKey: 'unread-activity',
  },
  {
    senderUserId: users.manager.id,
    type: MessageType.TEXT,
    body: 'Пример обсуждения задачи: проверьте сроки, переключение комнат и возврат к последнему контексту.',
    sourceEventKey: 'task-discussion',
  },
  {
    senderUserId: users.support.id,
    type: MessageType.TEXT,
    body: 'Highlight sample: приложите скриншот и краткие шаги, если поведение отличается от ожидаемого.',
    sourceEventKey: 'highlight',
  },
];

const seedRoomMessages = async (room: Room, users: BetaUsers): Promise<Message[]> => {
  const messages: Message[] = [];
  const seeds = buildRoomMessages(room, users);

  for (const [index, seed] of seeds.entries()) {
    messages.push(await upsertMessage(room, index + 1, seed));
  }

  const lastMessage = messages[messages.length - 1];

  if (lastMessage === undefined) {
    throw new Error('Expected beta seed messages to exist.');
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
  users: BetaUsers,
  messages: Message[],
): Promise<void> => {
  const managerReadMessage = messages[4];
  const testerReadMessage = messages[2];
  const supportReadMessage = messages[1];

  if (
    managerReadMessage === undefined ||
    testerReadMessage === undefined ||
    supportReadMessage === undefined
  ) {
    throw new Error('Expected beta read-state messages to exist.');
  }

  await upsertReadState(room, users.manager, managerReadMessage, 0);
  await upsertReadState(room, users.tester, testerReadMessage, 2);
  await upsertReadState(room, users.support, supportReadMessage, 3);
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
      seededFor: 'desktop-beta-testing',
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

const printDryRunSummary = (target: SeedTarget): void => {
  console.log(`Beta room seed dry run for ${target}. No database writes were made.`);
  console.log('');
  console.log('Users:');
  console.log(`Beta Manager: ${betaManagerId} (externalUserId beta-manager-1)`);
  console.log(`Beta Tester:  ${betaTesterId} (externalUserId beta-tester-1)`);
  console.log(`Beta Support: ${betaSupportId} (externalUserId beta-support-1)`);
  console.log('');
  console.log('Rooms:');
  betaRooms.forEach((room) => {
    console.log(`- ${room.name}`);
  });
};

const printSummary = (target: SeedTarget, users: BetaUsers, rooms: Room[]): void => {
  console.log(`Beta room seed complete for ${target}.`);
  console.log('');
  console.log('Users:');
  console.log(
    `Beta Manager: ${users.manager.id} (externalUserId ${users.manager.externalUserId ?? ''})`,
  );
  console.log(
    `Beta Tester:  ${users.tester.id} (externalUserId ${users.tester.externalUserId ?? ''})`,
  );
  console.log(
    `Beta Support: ${users.support.id} (externalUserId ${users.support.externalUserId ?? ''})`,
  );
  console.log('');
  console.log('Rooms:');
  rooms.forEach((room) => {
    console.log(`${room.name}: ${room.id}`);
  });
  console.log('');
  console.log(
    'Use the UUID user IDs for chat bearer tokens. Friendly beta IDs are stored as externalUserId only.',
  );
};

const main = async (): Promise<void> => {
  const args = parseArgs();
  const target = assertSeedTargetAllowed();

  if (args.dryRun) {
    printDryRunSummary(target);
    return;
  }

  const users = await upsertBetaUsers();
  const rooms = await upsertRooms(users);
  await upsertMemberships(rooms, users);

  for (const room of rooms) {
    const messages = await seedRoomMessages(room, users);
    await upsertReadStates(room, users, messages);

    const activityMessage = messages[2];

    if (activityMessage === undefined) {
      throw new Error('Expected beta activity message to exist.');
    }

    await upsertNotification({
      user: users.tester,
      room,
      message: activityMessage,
      sourceEventId: `beta-seed:${room.id}:notification:tester`,
      title: `New beta activity in ${room.name ?? room.id}`,
      body: `There is seeded activity in ${room.name ?? room.id}.`,
    });
  }

  printSummary(target, users, rooms);
};

try {
  await main();
} finally {
  await prisma.$disconnect();
}
