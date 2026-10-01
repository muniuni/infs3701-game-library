import "dotenv/config";
import { assertStorage } from "./storage-config.mjs";
const config = assertStorage({
  ...process.env,
  NODE_ENV: process.env.NODE_ENV || "production",
});
console.log(`Storage verified: ${config.mode}, ${config.path}`);
