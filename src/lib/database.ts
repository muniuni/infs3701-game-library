import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { assertStorage } from "../../scripts/storage-config.mjs";

export function createDatabase(url = assertStorage().url) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}
