import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { assertStorage } from "../../scripts/storage-config.mjs";
import {
  databaseCaFile,
  pgPoolConfig,
} from "../../scripts/database-config.mjs";

// DATABASE_CA_FILE (set on AWS) turns on verified TLS: see database-config.mjs.
export function createDatabase(
  url = assertStorage().url,
  caFile = databaseCaFile(),
) {
  return new PrismaClient({ adapter: new PrismaPg(pgPoolConfig(url, caFile)) });
}
