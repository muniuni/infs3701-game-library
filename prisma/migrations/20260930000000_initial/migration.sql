CREATE TABLE "Game" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "titleKey" TEXT NOT NULL,
  "data" JSONB NOT NULL,
  "coverKey" TEXT
);
CREATE UNIQUE INDEX "Game_titleKey_key" ON "Game"("titleKey");
CREATE UNIQUE INDEX "Game_coverKey_key" ON "Game"("coverKey");
CREATE TABLE "CoverObject" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "state" TEXT NOT NULL,
  "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "CoverObject_state_updatedAt_idx" ON "CoverObject"("state", "updatedAt");
