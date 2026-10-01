import { SqliteGameRepository } from "./sqlite-game-repository";
import { createDatabase } from "./database";
import { S3CoverStorage } from "./cover-storage";
const globalStore = globalThis as typeof globalThis & {
  gameRepository?: SqliteGameRepository;
};
// Lazy initialization permits builds without accessing production storage.
export function getRepository() {
  return (globalStore.gameRepository ??= new SqliteGameRepository(
    createDatabase(),
    new S3CoverStorage(),
  ));
}
