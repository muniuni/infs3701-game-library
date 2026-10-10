import { randomUUID } from "node:crypto";
import {
  createGameSchema,
  updateGameSchema,
  type Game,
  type CreateGameInput,
  type UpdateGameInput,
} from "./game";
export interface GameRepository {
  listGames(): Promise<Game[]>;
  getGame(id: string): Promise<Game | undefined>;
  createGame(input: CreateGameInput): Promise<Game>;
  updateGame(id: string, input: UpdateGameInput): Promise<Game | undefined>;
  deleteGame(id: string): Promise<boolean>;
}
export class DuplicateGameError extends Error {
  constructor(identity: "title" | "igdb" = "title") {
    super(
      identity === "igdb"
        ? "This IGDB game is already in your library. Edit the existing game instead."
        : "A game with this title already exists. Edit its platforms instead.",
    );
  }
}
export const titleKey = (title: string) =>
  title.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
function optionalFields(input: CreateGameInput | UpdateGameInput) {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      value === null ? undefined : value,
    ]),
  );
}
export class InMemoryGameRepository implements GameRepository {
  private games = new Map<string, Game>();
  constructor(seed: Game[] = []) {
    seed.forEach((game) => this.games.set(game.id, structuredClone(game)));
  }
  async listGames() {
    return structuredClone([...this.games.values()]);
  }
  async getGame(id: string) {
    const game = this.games.get(id);
    return game && structuredClone(game);
  }
  private checkTitle(title: string, id?: string) {
    if (
      [...this.games.values()].some(
        (game) => game.id !== id && titleKey(game.title) === titleKey(title),
      )
    )
      throw new DuplicateGameError();
  }
  private checkIgdb(igdbId: number | null | undefined, id?: string) {
    if (
      igdbId &&
      [...this.games.values()].some(
        (game) => game.id !== id && game.igdbId === igdbId,
      )
    )
      throw new DuplicateGameError("igdb");
  }
  async createGame(input: CreateGameInput) {
    const parsed = createGameSchema.parse(input);
    this.checkTitle(parsed.title);
    this.checkIgdb(parsed.igdbId);
    const now = new Date().toISOString();
    const game = {
      ...optionalFields(parsed),
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    } as Game;
    this.games.set(game.id, game);
    return structuredClone(game);
  }
  async updateGame(id: string, input: UpdateGameInput) {
    const parsed = updateGameSchema.parse(input);
    const previous = this.games.get(id);
    if (!previous) return undefined;
    if (parsed.title !== undefined) this.checkTitle(parsed.title, id);
    this.checkIgdb(parsed.igdbId, id);
    const game = {
      ...previous,
      ...optionalFields(parsed),
      updatedAt: new Date().toISOString(),
    } as Game;
    this.games.set(id, game);
    return structuredClone(game);
  }
  async deleteGame(id: string) {
    return this.games.delete(id);
  }
}
