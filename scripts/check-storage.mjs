import "dotenv/config";
import { assertStorage, describeDatabase } from "./storage-config.mjs";
const config = assertStorage({
  ...process.env,
  NODE_ENV: process.env.NODE_ENV || "production",
});
console.log(
  `Storage configured: ${config.mode} covers, PostgreSQL at ${describeDatabase(config.url)}`,
);
