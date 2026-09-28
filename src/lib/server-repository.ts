import { InMemoryGameRepository, type GameRepository } from "./repository";
import { seedGames } from "./seed";
const globalStore = globalThis as typeof globalThis & {
  gameRepository?: GameRepository;
};
// One process-wide repository shared by all route handlers, including development reloads.
export const repository = (globalStore.gameRepository ??=
  new InMemoryGameRepository(
    process.env.NODE_ENV === "development" ? seedGames : [],
  ));
