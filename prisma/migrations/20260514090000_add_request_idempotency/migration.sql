-- CreateEnum
CREATE TYPE "RequestIdempotencyStatus" AS ENUM ('COMPLETED');

-- CreateTable
CREATE TABLE "RequestIdempotencyRecord" (
    "id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" "RequestIdempotencyStatus" NOT NULL DEFAULT 'COMPLETED',
    "userId" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "resultMessageId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequestIdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RequestIdempotencyRecord_scope_key_key" ON "RequestIdempotencyRecord"("scope", "key");

-- CreateIndex
CREATE INDEX "RequestIdempotencyRecord_userId_createdAt_idx" ON "RequestIdempotencyRecord"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RequestIdempotencyRecord_roomId_createdAt_idx" ON "RequestIdempotencyRecord"("roomId", "createdAt");

-- CreateIndex
CREATE INDEX "RequestIdempotencyRecord_resultMessageId_idx" ON "RequestIdempotencyRecord"("resultMessageId");

-- AddForeignKey
ALTER TABLE "RequestIdempotencyRecord" ADD CONSTRAINT "RequestIdempotencyRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestIdempotencyRecord" ADD CONSTRAINT "RequestIdempotencyRecord_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestIdempotencyRecord" ADD CONSTRAINT "RequestIdempotencyRecord_resultMessageId_fkey" FOREIGN KEY ("resultMessageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
