import type { Game } from "./game";
export type Filters = {
  query: string;
  status: string;
  platform: string;
  tag: string;
  rating: string;
  sort: string;
};
export const initialFilters: Filters = {
  query: "",
  status: "",
  platform: "",
  tag: "",
  rating: "",
  sort: "createdAt",
};
export function selectGames(games: Game[], filters: Filters): Game[] {
  return games
    .filter(
      (game) =>
        game.title.toLowerCase().includes(filters.query.trim().toLowerCase()) &&
        (!filters.status || game.status === filters.status) &&
        (!filters.platform || game.platforms.includes(filters.platform)) &&
        (!filters.tag || game.tags.includes(filters.tag)) &&
        (!filters.rating || game.rating === Number(filters.rating)),
    )
    .sort((a, b) => {
      if (filters.sort === "title") return a.title.localeCompare(b.title);
      const key = filters.sort as
        | "releaseDate"
        | "rating"
        | "playtimeMinutes"
        | "createdAt"
        | "updatedAt";
      const left = a[key],
        right = b[key];
      if (left === undefined && right === undefined)
        return a.title.localeCompare(b.title);
      if (left === undefined) return 1;
      if (right === undefined) return -1;
      const result =
        typeof left === "number" && typeof right === "number"
          ? right - left
          : String(right).localeCompare(String(left));
      return result || a.title.localeCompare(b.title);
    });
}
