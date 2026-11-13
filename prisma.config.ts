import "dotenv/config";
import { storageConfig } from "./scripts/storage-config.mjs";
import {
  databaseCaFile,
  prismaDatasourceUrl,
} from "./scripts/database-config.mjs";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // With DATABASE_CA_FILE, Prisma Migrate gets its own TLS syntax.
  datasource: {
    url: prismaDatasourceUrl(storageConfig().url, databaseCaFile()),
  },
});
