import { randomUUID } from "node:crypto";
import { PrismaClient, Prisma } from "../generated/prisma/client";
import {
  createGameSchema,
  updateGameSchema,
  type Game,
  type CreateGameInput,
  type UpdateGameInput,
} from "./game";
import {
  DuplicateGameError,
  titleKey,
  type GameRepository,
} from "./repository";
import type { CoverStorage, ImageUpload } from "./cover-storage";

const json = (game: Game) =>
  JSON.parse(JSON.stringify(game)) as Prisma.InputJsonValue;
const record = (data: Prisma.JsonValue) =>
  structuredClone(data) as unknown as Game;
const optionalFields = (input: CreateGameInput | UpdateGameInput) =>
  Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      value === null ? undefined : value,
    ]),
  );

export class SqliteGameRepository implements GameRepository {
  constructor(
    public db: PrismaClient,
    private storage: CoverStorage,
  ) {}
  async listGames() {
    return (await this.db.game.findMany()).map((row) => record(row.data));
  }
  async getGame(id: string) {
    const row = await this.db.game.findUnique({ where: { id } });
    return row ? record(row.data) : undefined;
  }
  async createGame(input: CreateGameInput, image?: ImageUpload) {
    return (await this.save(undefined, createGameSchema.parse(input), image))!;
  }
  async updateGame(id: string, input: UpdateGameInput, image?: ImageUpload) {
    return this.save(id, updateGameSchema.parse(input), image);
  }
  private async save(
    id: string | undefined,
    input: CreateGameInput | UpdateGameInput,
    image?: ImageUpload,
  ) {
    let key: string | undefined;
    let retiredKey: string | undefined;
    let putCompleted = false;
    try {
      if (id && !(await this.getGame(id))) return undefined;
      if (image) {
        key = `covers/${randomUUID()}`;
        // Register before writing: crashes and ambiguous storage outcomes are recoverable.
        await this.db.coverObject.create({ data: { key, state: "pending" } });
        await this.storage.put(key, image);
        putCompleted = true;
      }
      const saved = await this.db.$transaction(async (tx) => {
        const previous = id
          ? await tx.game.findUnique({ where: { id } })
          : null;
        if (id && !previous) return undefined;
        const now = new Date().toISOString();
        const game = {
          ...(previous
            ? record(previous.data)
            : { id: randomUUID(), createdAt: now }),
          ...optionalFields(input),
          updatedAt: now,
        } as Game;
        const coverKey =
          key ||
          (input.cover === undefined ? previous?.coverKey : null) ||
          null;
        if (key) {
          const attached = await tx.coverObject.updateMany({
            where: { key, state: "pending" },
            data: { state: "attached" },
          });
          if (attached.count !== 1)
            throw new Error("Upload expired; retry saving.");
          game.cover = { type: "upload", url: `/api/covers/${key.slice(7)}` };
        }
        const data = {
          titleKey: titleKey(game.title),
          data: json(game),
          coverKey,
        };
        if (previous) await tx.game.update({ where: { id }, data });
        else await tx.game.create({ data: { id: game.id, ...data } });
        if (previous?.coverKey && previous.coverKey !== coverKey) {
          retiredKey = previous.coverKey;
          await tx.coverObject.update({
            where: { key: previous.coverKey },
            data: { state: "garbage" },
          });
        }
        return game;
      });
      if (!saved && key)
        await this.db.coverObject.update({
          where: { key },
          data: { state: "garbage" },
        });
      await this.tryCleanup([key, retiredKey]);
      return saved;
    } catch (error) {
      if (key && !putCompleted) {
        // An ambiguous PUT may still complete remotely. Keep the pending ledger
        // for a second deletion after the 24-hour expiry, even if deletion works now.
        await this.storage.delete(key).catch(() => {});
      } else if (key) {
        // Never retire an attached object if a response failed after a commit.
        await this.db.coverObject
          .updateMany({
            where: { key, state: "pending" },
            data: { state: "garbage" },
          })
          .catch(() => {});
        await this.tryCleanup([key]);
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new DuplicateGameError();
      throw error;
    }
  }
  async deleteGame(id: string) {
    let retiredKey: string | undefined;
    const deleted = await this.db.$transaction(async (tx) => {
      const previous = await tx.game.findUnique({ where: { id } });
      if (!previous) return false;
      await tx.game.delete({ where: { id } });
      if (previous.coverKey) {
        retiredKey = previous.coverKey;
        await tx.coverObject.update({
          where: { key: previous.coverKey },
          data: { state: "garbage" },
        });
      }
      return true;
    });
    await this.tryCleanup([retiredKey]);
    return deleted;
  }
  async getCover(id: string) {
    if (!/^[0-9a-f-]{36}$/.test(id)) return undefined;
    const key = `covers/${id}`;
    if (!(await this.db.game.findUnique({ where: { coverKey: key } })))
      return undefined;
    return this.storage.get(key);
  }
  async cleanup(keys?: string[]) {
    // Claim abandoned uploads atomically so they can no longer be attached.
    if (!keys)
      await this.db.coverObject.updateMany({
        where: {
          state: "pending",
          updatedAt: { lt: new Date(Date.now() - 86_400_000) },
        },
        data: { state: "garbage" },
      });
    const pending = await this.db.coverObject.findMany({
      where: { state: "garbage", ...(keys ? { key: { in: keys } } : {}) },
      take: 100,
      orderBy: { updatedAt: "asc" },
    });
    let failures = 0;
    for (const object of pending) {
      try {
        await this.storage.delete(object.key);
        await this.db.coverObject.deleteMany({
          where: { key: object.key, state: "garbage" },
        });
      } catch {
        failures++;
      }
    }
    if (failures) throw new Error(`${failures} cover deletions pending retry.`);
    return pending.length;
  }
  private async tryCleanup(candidates: (string | undefined)[]) {
    const keys = candidates.filter((key): key is string => Boolean(key));
    if (!keys.length) return;
    // Commit is already successful. Failed cleanup stays in the durable ledger.
    await this.cleanup(keys).catch((error) =>
      console.error("Cover cleanup pending", error),
    );
  }
}
