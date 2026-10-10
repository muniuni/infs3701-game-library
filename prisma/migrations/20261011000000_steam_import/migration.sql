ALTER TABLE "Game" ADD COLUMN "steamAppId" INTEGER;
CREATE UNIQUE INDEX "Game_steamAppId_key" ON "Game"("steamAppId");
CREATE TABLE "SteamImportReceipt" ("id" TEXT NOT NULL PRIMARY KEY, "fingerprint" TEXT NOT NULL, "gameId" TEXT NOT NULL);
