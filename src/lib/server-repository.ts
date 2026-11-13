import { PrismaGameRepository } from "./prisma-game-repository";
import { createDatabase } from "./database";
import { createCoverStorage } from "./server-cover-storage";
const globalStore = globalThis as typeof globalThis & {
  gameRepository?: PrismaGameRepository;
};
// Lazy initialization permits builds without accessing production storage.
export function getRepository() {
  return (globalStore.gameRepository ??= new PrismaGameRepository(
    createDatabase(),
    createCoverStorage(),
  ));
}
