-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "titleKey" TEXT NOT NULL,
    "igdbId" INTEGER,
    "steamAppId" INTEGER,
    "data" JSONB NOT NULL,
    "coverKey" TEXT,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoverObject" (
    "key" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoverObject_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "SteamImportReceipt" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,

    CONSTRAINT "SteamImportReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Game_titleKey_key" ON "Game"("titleKey");

-- CreateIndex
CREATE UNIQUE INDEX "Game_igdbId_key" ON "Game"("igdbId");

-- CreateIndex
CREATE UNIQUE INDEX "Game_steamAppId_key" ON "Game"("steamAppId");

-- CreateIndex
CREATE UNIQUE INDEX "Game_coverKey_key" ON "Game"("coverKey");

-- CreateIndex
CREATE INDEX "CoverObject_state_updatedAt_idx" ON "CoverObject"("state", "updatedAt");
