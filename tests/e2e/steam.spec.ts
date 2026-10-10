import { test, expect, type Page } from "@playwright/test";
const owned = [
  { appId: 1001, title: "Steam Adventure", playtimeMinutes: 125 },
  { appId: 1002, title: "Steam Puzzle", playtimeMinutes: 45 },
];
const metadata = {
  id: 9001,
  title: "Steam Adventure",
  tags: ["Adventure"],
  developers: ["Studio"],
  summary: "A game from Steam.",
  availablePlatforms: [{ id: 6, name: "PC" }],
};
async function open(page: Page, first = true) {
  await page.getByRole("button", { name: "Import Steam", exact: true }).click();
  if (first) {
    await expect(page.getByLabel("Steam profile URL or ID64")).toBeFocused();
    await page
      .getByLabel("Steam profile URL or ID64")
      .fill("76561198000000000");
    await page.getByRole("button", { name: "Load library" }).click();
  }
}
async function mode(page: Page, label: string) {
  await page.getByRole("button", { name: "Choose import update mode" }).click();
  await page.getByRole("menuitemradio", { name: label, exact: true }).click();
}
test.beforeEach(async ({ page, request }) => {
  for (const game of await (await request.get("/api/games")).json())
    await request.delete(`/api/games/${game.id}`);
  await page.route("**/api/steam/preview", (route) =>
    route.fulfill({ json: { steamId: "76561198000000000", games: owned } }),
  );
  await page.route("**/api/steam/enrich", (route) =>
    route.fulfill({
      json: route
        .request()
        .postDataJSON()
        .appIds.map((appId: number) => ({
          appId,
          game: appId === 1001 ? metadata : undefined,
          ambiguous: false,
        })),
    }),
  );
  await page.goto("/");
});
test.afterEach(async ({ request }) => {
  for (const game of await (await request.get("/api/games")).json())
    await request.delete(`/api/games/${game.id}`);
});
test("Steam shows enriched list directly, saves status and account, and reimports playtime", async ({
  page,
  request,
}) => {
  await open(page);
  await expect(
    page.getByRole("checkbox", { name: "Import Steam Adventure", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("button", { name: "Continue", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Status for Steam Adventure" })
    .click();
  await page.getByRole("option", { name: "Completed", exact: true }).click();
  expect(await (await request.get("/api/games")).json()).toHaveLength(0);
  await page
    .getByRole("button", { name: "Import 2 games", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  let games = await (await request.get("/api/games")).json();
  const game = games.find(
    (item: { steamAppId: number }) => item.steamAppId === 1001,
  );
  expect(game.platforms).toEqual(["Steam"]);
  expect(game.status).toBe("Completed");
  expect(game.summary).toBe(metadata.summary);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("game-library:steam-account:v1"),
    ),
  ).toBe("76561198000000000");
  await request.patch(`/api/games/${game.id}`, {
    data: { playtimeMinutes: 10, review: "Keep my notes" },
  });
  await page.reload();
  await open(page, false);
  await expect(
    page.getByRole("checkbox", { name: "Import Steam Adventure", exact: true }),
  ).not.toBeChecked();
  await expect(page.getByLabel("Steam profile URL or ID64")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Update playtime", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Review Steam Adventure", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Update Playtime for Steam Adventure" }),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Import 1 game", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  games = await (await request.get("/api/games")).json();
  const updated = games.find((item: { id: string }) => item.id === game.id);
  expect(updated.playtimeMinutes).toBe(125);
  expect(updated.review).toBe("Keep my notes");
  expect(updated.status).toBe("Completed");
  expect(games).toHaveLength(2);
});
test("Global modes gate individual editing, preserve overrides and status, and remember only global mode", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page
    .getByRole("button", { name: "Review Steam Adventure", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Update mode for Steam Adventure" }),
  ).toHaveCount(0);
  await mode(page, "Replace current data");
  await mode(page, "Customize per game");
  await expect(
    page.getByRole("combobox", { name: "Update mode for Steam Adventure" }),
  ).toContainText("Replace current data");
  await page
    .getByRole("combobox", { name: "Update mode for Steam Adventure" })
    .click();
  await page
    .getByRole("option", { name: "Select manually", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Update Summary for Steam Adventure" })
    .uncheck();
  await mode(page, "Update if empty");
  await expect(
    page.getByRole("checkbox", { name: "Update Summary for Steam Adventure" }),
  ).toHaveCount(0);
  await mode(page, "Customize per game");
  await expect(
    page.getByRole("checkbox", { name: "Update Summary for Steam Adventure" }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "Default fields" }),
  ).toHaveCount(0);
  await page.screenshot({ path: "test-results/steam-review-mobile.png" });
  expect(
    await page
      .locator(".steam-dialog")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await open(page, false);
  await expect(
    page.getByRole("checkbox", { name: "Import Steam Adventure", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Choose import update mode" }).click();
  await expect(
    page.getByRole("menuitemradio", { name: "Customize per game" }),
  ).toHaveAttribute("data-state", "checked");
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Review Steam Adventure", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Update mode for Steam Adventure" }),
  ).toContainText("Update if empty");
});
test("Without randomUUID, Steam imports and retries lost responses without duplicates", async ({
  page,
  request,
}) => {
  await page.route("**/api/steam/enrich", (route) =>
    route.fulfill({ status: 503, json: { error: "IGDB unavailable" } }),
  );
  // Reproduce the missing API on plain HTTP while retaining secure random bytes.
  await page.evaluate(() => {
    Object.defineProperty(crypto, "randomUUID", {
      value: undefined,
      configurable: true,
    });
  });
  const operations: { appId: number; operationId: string }[] = [];
  let failed = false;
  await page.route("**/api/steam/import", async (route) => {
    const entry = route.request().postDataJSON().entries[0];
    operations.push({
      appId: entry.steam.appId,
      operationId: entry.operationId,
    });
    expect(entry.operationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    if (!failed) {
      failed = true;
      await route.fetch();
      await route.fulfill({ status: 502, json: { error: "Lost response" } });
    } else await route.continue();
  });
  await open(page);
  await expect(
    page.getByRole("checkbox", { name: "Import Steam Adventure", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Continue without missing metadata" })
    .click();
  await page
    .getByRole("button", { name: "Import 2 games", exact: true })
    .click();
  await expect(page.getByText("Lost response", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Retry 1 game", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await (await request.get("/api/games")).json()).toHaveLength(2);
  expect(operations).toHaveLength(3);
  expect(operations[2]).toEqual(operations[0]);
  expect(operations[1].operationId).not.toBe(operations[0].operationId);
});
test("ID matches are unselected on first display; changing status selects them without changing metadata", async ({
  page,
  request,
}) => {
  await request.post("/api/games", {
    data: {
      title: "Renamed library game",
      igdbId: 9001,
      playtimeMinutes: 9,
      rating: 8,
    },
  });
  await page.reload();
  await open(page);
  await expect(
    page.getByRole("checkbox", { name: "Import Steam Adventure", exact: true }),
  ).not.toBeChecked();
  await page
    .getByRole("combobox", { name: "Status for Steam Adventure" })
    .click();
  await page.getByRole("option", { name: "Playing", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Import Steam Adventure", exact: true }),
  ).toBeChecked();
  await mode(page, "Replace current data");
  await mode(page, "Update if empty");
  await expect(
    page.getByRole("combobox", { name: "Status for Steam Adventure" }),
  ).toContainText("Playing");
  await page.screenshot({ path: "test-results/steam-review-desktop.png" });
  await page
    .getByRole("button", { name: "Import 2 games", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const games = await (await request.get("/api/games")).json();
  const linked = games.find(
    (game: { steamAppId: number }) => game.steamAppId === 1001,
  );
  expect(linked.status).toBe("Playing");
  expect(linked.title).toBe("Renamed library game");
  expect(linked.playtimeMinutes).toBe(9);
  expect(linked.rating).toBe(8);
});
test("Account can be forgotten and failed loads retain the saved ID", async ({
  page,
}) => {
  await open(page);
  await expect(
    page.getByRole("checkbox", { name: "Import Steam Adventure", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Change account" }).click();
  await page.route("**/api/steam/preview", (route) =>
    route.fulfill({ status: 403, json: { error: "Private library" } }),
  );
  await page.getByLabel("Steam profile URL or ID64").fill("76561198000000001");
  await page.getByRole("button", { name: "Load library" }).click();
  await expect(
    page.getByText("Private library", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("game-library:steam-account:v1"),
    ),
  ).toBe("76561198000000000");
  await page.getByRole("button", { name: "Change account" }).click();
  await page.getByRole("button", { name: "Forget account" }).click();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("game-library:steam-account:v1"),
    ),
  ).toBeNull();
});

test("Steam loading reserves the list space and never shows unenriched rows", async ({
  page,
}) => {
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await page.route("**/api/steam/enrich", async (route) => {
    await pending;
    await route.fulfill({
      json: [{ appId: 1001, game: metadata }, { appId: 1002 }],
    });
  });
  await open(page);
  await expect(
    page.getByText("Loading metadata 0 / 2", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "Import Steam Adventure", exact: true }),
  ).toHaveCount(0);
  const before = await page.locator(".steam-dialog").boundingBox();
  finish();
  await expect(
    page.getByRole("checkbox", { name: "Import Steam Adventure", exact: true }),
  ).toBeVisible();
  const after = await page.locator(".steam-dialog").boundingBox();
  expect(after?.height).toBe(before?.height);
});

test("Import ID creation failure stays recoverable in the dialog", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page);
  await page.evaluate(() => {
    Object.defineProperty(crypto, "randomUUID", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(crypto, "getRandomValues", {
      value: undefined,
      configurable: true,
    });
  });
  await page
    .getByRole("button", { name: "Import 2 games", exact: true })
    .click();
  await expect(
    page
      .getByText(
        "Your browser cannot create an import ID. Try another browser.",
      )
      .first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry 2 games", exact: true }),
  ).toBeEnabled();
  expect(await (await request.get("/api/games")).json()).toHaveLength(0);
  expect(errors).toEqual([]);
  await page.evaluate(() => {
    Reflect.deleteProperty(crypto, "randomUUID");
    Reflect.deleteProperty(crypto, "getRandomValues");
  });
  await page
    .getByRole("button", { name: "Retry 2 games", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await (await request.get("/api/games")).json()).toHaveLength(2);
});
