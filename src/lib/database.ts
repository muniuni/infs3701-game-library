import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client";
import { assertStorage } from "../../scripts/storage-config.mjs";

export function createDatabase() {
  const { url } = assertStorage();
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });
}
