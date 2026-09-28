import type { Game } from "./game";
// Fictional development fixtures, not external game metadata.
export const seedGames: Game[] = [
  {
    title: "The Last Signal",
    platforms: ["PC"],
    tags: ["Adventure", "Sci-fi"],
    status: "Playing",
    rating: 8,
    playtimeMinutes: 425,
  },
  {
    title: "Ember Valley",
    platforms: ["PC", "Switch"],
    tags: ["RPG", "Exploration"],
    status: "Backlog",
  },
  {
    title: "Orbit Runner",
    platforms: ["PC"],
    tags: ["Arcade"],
    status: "Completed",
    rating: 9,
    playtimeMinutes: 182,
  },
  {
    title: "Quiet Tides",
    platforms: ["Switch"],
    tags: ["Puzzle", "Relaxing"],
    status: "Unplayed",
  },
  {
    title: "Iron Circuit",
    platforms: ["PlayStation", "PC"],
    tags: ["Racing"],
    status: "Dropped",
    rating: 5,
    playtimeMinutes: 95,
  },
  {
    title: "Hollow Moon",
    platforms: ["Xbox", "PC"],
    tags: ["Adventure"],
    status: "Unplayed",
  },
].map(
  (game, index) =>
    ({
      ...game,
      id: `demo-${index + 1}`,
      cover: { type: "placeholder" },
      createdAt: `2026-01-0${index + 1}T12:00:00.000Z`,
      updatedAt: `2026-01-0${index + 1}T12:00:00.000Z`,
    }) as Game,
);
