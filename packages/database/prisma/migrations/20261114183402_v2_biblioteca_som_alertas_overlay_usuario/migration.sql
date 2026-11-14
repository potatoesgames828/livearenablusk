-- AlterTable
ALTER TABLE "Overlay" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'SESSION',
ADD COLUMN     "settings" JSONB NOT NULL DEFAULT '{}',
ALTER COLUMN "sessionId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "FavoriteGame" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavoriteGame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoundAsset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoundAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "trigger" JSONB NOT NULL,
    "message" TEXT NOT NULL,
    "emoji" TEXT NOT NULL DEFAULT '🎉',
    "color" TEXT NOT NULL DEFAULT '#a855f7',
    "soundId" TEXT,
    "volume" INTEGER NOT NULL DEFAULT 80,
    "durationMs" INTEGER NOT NULL DEFAULT 4000,
    "cooldownMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoundBinding" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "soundId" TEXT NOT NULL,
    "volume" INTEGER NOT NULL DEFAULT 80,

    CONSTRAINT "SoundBinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FavoriteGame_tenantId_userId_gameId_key" ON "FavoriteGame"("tenantId", "userId", "gameId");

-- CreateIndex
CREATE INDEX "SoundAsset_tenantId_idx" ON "SoundAsset"("tenantId");

-- CreateIndex
CREATE INDEX "AlertRule_tenantId_idx" ON "AlertRule"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SoundBinding_tenantId_slot_key" ON "SoundBinding"("tenantId", "slot");

-- AddForeignKey
ALTER TABLE "FavoriteGame" ADD CONSTRAINT "FavoriteGame_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoundAsset" ADD CONSTRAINT "SoundAsset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertRule" ADD CONSTRAINT "AlertRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoundBinding" ADD CONSTRAINT "SoundBinding_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
