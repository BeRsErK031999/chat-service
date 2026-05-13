-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "AuthSource" AS ENUM ('TTS', 'STANDALONE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "RoomType" AS ENUM ('TASK', 'DIRECT', 'GROUP', 'SYSTEM');

-- CreateEnum
CREATE TYPE "RoomVisibility" AS ENUM ('PRIVATE', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "TaskRoomKind" AS ENUM ('INTERNAL', 'MANAGER', 'CUSTOMER', 'SYSTEM_EVENTS');

-- CreateEnum
CREATE TYPE "RoomMemberRole" AS ENUM ('OWNER', 'MANAGER', 'MEMBER', 'OBSERVER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "RoomMemberSource" AS ENUM ('TTS_TASK', 'TTS_PROJECT', 'MANUAL', 'STANDALONE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NotificationLevel" AS ENUM ('ALL', 'MENTIONS', 'NONE');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'SYSTEM_EVENT');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH');

-- CreateEnum
CREATE TYPE "NotificationDeliveryState" AS ENUM ('PENDING', 'DELIVERED', 'READ', 'FAILED', 'SUPPRESSED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "externalUserId" TEXT,
    "email" TEXT,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "authSource" "AuthSource" NOT NULL DEFAULT 'STANDALONE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" UUID NOT NULL,
    "type" "RoomType" NOT NULL,
    "visibility" "RoomVisibility" NOT NULL DEFAULT 'PRIVATE',
    "name" TEXT,
    "description" TEXT,
    "taskId" TEXT,
    "projectId" TEXT,
    "taskRoomKind" "TaskRoomKind",
    "createdByUserId" UUID,
    "createdByEventId" TEXT,
    "lastMessageId" UUID,
    "lastMessageAt" TIMESTAMP(3),
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomMember" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "RoomMemberRole" NOT NULL DEFAULT 'MEMBER',
    "source" "RoomMemberSource" NOT NULL DEFAULT 'STANDALONE',
    "notificationLevel" "NotificationLevel" NOT NULL DEFAULT 'ALL',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "mutedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "senderUserId" UUID,
    "type" "MessageType" NOT NULL,
    "body" TEXT,
    "eventType" TEXT,
    "eventPayload" JSONB NOT NULL DEFAULT '{}',
    "sourceEventId" TEXT,
    "sequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadState" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "lastReadMessageId" UUID,
    "lastReadSequence" INTEGER NOT NULL DEFAULT 0,
    "lastReadAt" TIMESTAMP(3),
    "unreadCountSnapshot" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReadState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "roomId" UUID,
    "messageId" UUID,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "deliveryState" "NotificationDeliveryState" NOT NULL DEFAULT 'PENDING',
    "readAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "sourceEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskRoomLink" (
    "id" UUID NOT NULL,
    "taskId" TEXT NOT NULL,
    "projectId" TEXT,
    "roomId" UUID NOT NULL,
    "kind" "TaskRoomKind" NOT NULL,
    "source" "AuthSource" NOT NULL DEFAULT 'STANDALONE',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdByEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskRoomLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_externalUserId_key" ON "User"("externalUserId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "Room_type_idx" ON "Room"("type");

-- CreateIndex
CREATE INDEX "Room_taskId_idx" ON "Room"("taskId");

-- CreateIndex
CREATE INDEX "Room_projectId_idx" ON "Room"("projectId");

-- CreateIndex
CREATE INDEX "Room_lastMessageAt_idx" ON "Room"("lastMessageAt");

-- CreateIndex
CREATE INDEX "Room_type_taskId_taskRoomKind_idx" ON "Room"("type", "taskId", "taskRoomKind");

-- CreateIndex
CREATE INDEX "RoomMember_userId_leftAt_idx" ON "RoomMember"("userId", "leftAt");

-- CreateIndex
CREATE INDEX "RoomMember_roomId_leftAt_idx" ON "RoomMember"("roomId", "leftAt");

-- CreateIndex
CREATE UNIQUE INDEX "RoomMember_roomId_userId_key" ON "RoomMember"("roomId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_sourceEventId_key" ON "Message"("sourceEventId");

-- CreateIndex
CREATE INDEX "Message_roomId_createdAt_idx" ON "Message"("roomId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Message_roomId_sequence_key" ON "Message"("roomId", "sequence");

-- CreateIndex
CREATE INDEX "ReadState_roomId_lastReadSequence_idx" ON "ReadState"("roomId", "lastReadSequence");

-- CreateIndex
CREATE UNIQUE INDEX "ReadState_userId_roomId_key" ON "ReadState"("userId", "roomId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_deliveryState_createdAt_idx" ON "Notification"("userId", "deliveryState", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_sourceEventId_idx" ON "Notification"("sourceEventId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskRoomLink_roomId_key" ON "TaskRoomLink"("roomId");

-- CreateIndex
CREATE INDEX "TaskRoomLink_projectId_idx" ON "TaskRoomLink"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskRoomLink_taskId_kind_key" ON "TaskRoomLink"("taskId", "kind");

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomMember" ADD CONSTRAINT "RoomMember_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomMember" ADD CONSTRAINT "RoomMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadState" ADD CONSTRAINT "ReadState_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadState" ADD CONSTRAINT "ReadState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadState" ADD CONSTRAINT "ReadState_lastReadMessageId_fkey" FOREIGN KEY ("lastReadMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskRoomLink" ADD CONSTRAINT "TaskRoomLink_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

