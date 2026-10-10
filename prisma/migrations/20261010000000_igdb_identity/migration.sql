ALTER TABLE "Game" ADD COLUMN "igdbId" INTEGER;
CREATE UNIQUE INDEX "Game_igdbId_key" ON "Game"("igdbId");
