import { test, expect, type Download } from "@playwright/test";

async function readDownload(download: Download) {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
test.beforeEach(async ({ request }) => {
  for (const game of await (await request.get("/api/games")).json())
    await request.delete(`/api/games/${game.id}`);
});
test.afterEach(async ({ request }) => {
  for (const game of await (await request.get("/api/games")).json())
    await request.delete(`/api/games/${game.id}`);
});

test("JSON download includes fresh unfiltered games, metadata and personal records without images or internal IDs", async ({
  page,
  request,
}) => {
  const first = await (
    await request.post("/api/games", {
      data: {
        title: "Visible game",
        status: "Completed",
        platforms: ["PC"],
        tags: ["Puzzle"],
        rating: 9,
        playtimeMinutes: 0,
        review: "日本語\nNotes",
        igdbId: 321,
        steamAppId: 654,
        availablePlatforms: [{ id: 6, name: "PC" }],
        developers: ["Studio"],
        publishers: ["Publisher"],
        summary: "Summary",
        storyline: "Story",
        releaseDate: "2020-01-01",
        cover: { type: "url", url: "https://example.com/excluded.jpg" },
        screenshots: [{ imageId: "excluded_screenshot" }],
      },
    })
  ).json();
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Search titles", exact: true })
    .fill("Nothing matches");
  // Added after initial load: exporting cannot use either filtered or cached UI state.
  await request.post("/api/games", { data: { title: "Hidden fresh game" } });
  await page
    .getByRole("button", { name: "Import / Export", exact: true })
    .click();
  await page.screenshot({ path: "test-results/export-desktop-menu.png" });
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("menuitem", { name: "Export library (JSON)", exact: true })
    .click();
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  const download = await downloadPromise;
  const data = await readDownload(download);
  expect(download.suggestedFilename()).toBe(
    `game-library-${data.exportedAt.slice(0, 10)}.json`,
  );
  expect(data.schemaVersion).toBe(1);
  expect(new Date(data.exportedAt).toISOString()).toBe(data.exportedAt);
  expect(data.gameCount).toBe(2);
  expect(data.games).toHaveLength(2);
  expect(
    data.games.find((game: { title: string }) => game.title === first.title),
  ).toEqual({
    title: first.title,
    status: "Completed",
    platforms: ["PC"],
    tags: ["Puzzle"],
    rating: 9,
    playtimeMinutes: 0,
    review: "日本語\nNotes",
    igdbId: 321,
    steamAppId: 654,
    availablePlatforms: [{ id: 6, name: "PC" }],
    developers: ["Studio"],
    publishers: ["Publisher"],
    summary: "Summary",
    storyline: "Story",
    releaseDate: "2020-01-01",
    createdAt: first.createdAt,
    updatedAt: first.updatedAt,
  });
  expect(JSON.stringify(data)).not.toContain(first.id);
  expect(JSON.stringify(data)).not.toContain("excluded");
  expect(await (await request.get("/api/games")).json()).toHaveLength(2);
});

test("empty library exports through keyboard menu on mobile and failed export can retry", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  const trigger = page.getByRole("button", {
    name: "Import / Export",
    exact: true,
  });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("menuitem", { name: "Import from Steam", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("menuitem", { name: "Export library (JSON)", exact: true }),
  ).toBeFocused();
  await page.screenshot({ path: "test-results/export-mobile-menu.png" });
  const downloadPromise = page.waitForEvent("download");
  await page.keyboard.press("Enter");
  const confirmation = page.getByRole("dialog", { name: "Export library?" });
  await expect(
    confirmation.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  await page.screenshot({
    path: "test-results/export-mobile-confirmation.png",
  });
  await page.keyboard.press("Tab");
  await expect(
    confirmation.getByRole("button", { name: "Export JSON", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  const data = await readDownload(await downloadPromise);
  expect(data.gameCount).toBe(0);
  expect(data.games).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const response = await request.get("/api/games/export?query=ignored");
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(response.headers()["content-disposition"]).toMatch(/^attachment;/);
  await page.route("**/api/games/export", (route) =>
    route.fulfill({ status: 500, json: { error: "Failure" } }),
  );
  await trigger.click();
  await page
    .getByRole("menuitem", { name: "Export library (JSON)", exact: true })
    .click();
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Could not export the library" }),
  ).toContainText("Could not export the library");
  await page.unroute("**/api/games/export");
  const retry = page.waitForEvent("download");
  await page.getByRole("button", { name: "Retry export", exact: true }).click();
  expect((await readDownload(await retry)).games).toEqual([]);
  await expect(
    page.getByRole("alert").filter({ hasText: "Could not export the library" }),
  ).toHaveCount(0);
});

test("export confirmation cancels without requesting or downloading and restores focus", async ({
  page,
}) => {
  let requests = 0;
  let downloads = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/games/export")) requests++;
  });
  page.on("download", () => downloads++);
  await page.goto("/");
  const trigger = page.getByRole("button", {
    name: "Import / Export",
    exact: true,
  });
  for (const dismissal of ["Cancel", "Escape", "Close dialog"]) {
    await trigger.click();
    await page
      .getByRole("menuitem", { name: "Export library (JSON)", exact: true })
      .click();
    const confirmation = page.getByRole("dialog", { name: "Export library?" });
    await expect(confirmation).toBeVisible();
    await expect(
      confirmation.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeFocused();
    await page.screenshot({
      path: "test-results/export-desktop-confirmation.png",
    });
    if (dismissal === "Escape") await page.keyboard.press("Escape");
    else
      await confirmation
        .getByRole("button", { name: dismissal, exact: true })
        .click();
    await expect(confirmation).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(requests).toBe(0);
    expect(downloads).toBe(0);
  }
});
