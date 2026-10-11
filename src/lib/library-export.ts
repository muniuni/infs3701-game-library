import type { Game } from "./game";

/** Explicit projection: new storage or provider fields are never exported by default. */
export function createLibraryExport(games: readonly Game[], date = new Date()) {
  const exportedAt = date.toISOString();
  return {
    schemaVersion: 1,
    exportedAt,
    gameCount: games.length,
    games: games.map((game) => ({
      title: game.title,
      platforms: game.platforms,
      tags: game.tags,
      releaseDate: game.releaseDate ?? null,
      status: game.status,
      playtimeMinutes: game.playtimeMinutes ?? null,
      rating: game.rating ?? null,
      review: game.review ?? null,
      igdbId: game.igdbId ?? null,
      steamAppId: game.steamAppId ?? null,
      availablePlatforms:
        game.availablePlatforms === undefined
          ? []
          : (game.availablePlatforms?.map((platform) => ({
              id: platform.id,
              name: platform.name,
            })) ?? null),
      developers: game.developers === undefined ? [] : game.developers,
      publishers: game.publishers === undefined ? [] : game.publishers,
      summary: game.summary ?? null,
      storyline: game.storyline ?? null,
      createdAt: game.createdAt,
      updatedAt: game.updatedAt,
    })),
  };
}
