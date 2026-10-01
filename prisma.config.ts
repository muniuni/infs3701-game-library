import "dotenv/config";
import { storageConfig } from "./scripts/storage-config.mjs";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: storageConfig().url },
});
