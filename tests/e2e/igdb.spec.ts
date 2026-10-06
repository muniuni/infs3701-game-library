import { test, expect, type Page } from "@playwright/test";
const proposal = {
  id: 101,
  title: "IGDB synthetic adventure",
  releaseYear: 2024,
  releaseDate: "2024-02-29",
  tags: ["Puzzle", "Adventure"],
  cover: {
    type: "url",
    url: "https://images.igdb.com/igdb/image/upload/t_cover_big/synthetic.jpg",
  },
};
const second = {
  ...proposal,
  id: 102,
  title: "Second synthetic game",
  tags: ["Strategy"],
  releaseDate: "2025-05-06",
};
async function mock(page: Page) {
  const sharp = (await import("sharp")).default;
  const png = await sharp({
    create: { width: 8, height: 8, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  await page.route("https://images.igdb.com/**", (route) =>
    route.fulfill({ contentType: "image/png", body: png }),
  );
  await page.route("**/api/igdb/search?*", (route) =>
    route.fulfill({ json: [proposal, second] }),
  );
  await page.route("**/api/igdb/games/*", (route) =>
    route.fulfill({
      json: route.request().url().endsWith("102") ? second : proposal,
    }),
  );
  return png;
}
async function add(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Add Game", exact: true })
    .first()
    .click();
}
async function autoSelect(
  page: Page,
  query = "Synthetic",
  name = proposal.title,
) {
  await page.getByRole("combobox", { name: "Title", exact: true }).fill(query);
  await page.getByRole("option", { name: new RegExp(name) }).click();
}
async function explicitSelect(page: Page) {
  await page.getByRole("button", { name: "Autofill", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Search", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /IGDB synthetic adventure/ }).click();
}
test("Create autocomplete applies immediately, merges manual tags, supports Undo and saves only on Create", async ({
  page,
  request,
}) => {
  await mock(page);
  await add(page);
  await page.getByLabel("Platforms", { exact: true }).fill("Switch");
  await page.getByLabel("Tags", { exact: true }).fill("Favourite, puzzle");
  await page.getByLabel("Review", { exact: true }).fill("Keep my review");
  await page.getByLabel("Playtime hours").fill("3");
  await page.getByRole("radio", { name: "8 out of 10", exact: true }).check();
  const before = (await (await request.get("/api/games")).json()).length;
  await autoSelect(page, "My synthetic title");
  await expect(
    page.getByRole("heading", { name: "Choose fields to apply" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "Title", exact: true }),
  ).toHaveValue(proposal.title);
  await expect(page.getByLabel("Release date", { exact: true })).toHaveValue(
    proposal.releaseDate,
  );
  await expect(page.locator('input[name="tags"][type="hidden"]')).toHaveValue(
    "Favourite,puzzle,Adventure",
  );
  await expect(
    page.getByText("Autofilled 4 fields", { exact: true }),
  ).toBeVisible();
  expect((await (await request.get("/api/games")).json()).length).toBe(before);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Title", exact: true }),
  ).toHaveValue("My synthetic title");
  await expect(page.getByLabel("Release date", { exact: true })).toHaveValue(
    "",
  );
  await expect(page.locator('input[name="tags"][type="hidden"]')).toHaveValue(
    "Favourite,puzzle",
  );
  await expect(page.locator(".form-cover-preview img")).toHaveAttribute(
    "src",
    "/cover-placeholder.svg",
  );
  await autoSelect(page);
  await expect(page.getByLabel("Review", { exact: true })).toHaveValue(
    "Keep my review",
  );
  await page.getByRole("button", { name: "Create game" }).click();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: proposal.title }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toHaveCount(0);
  const saved = (await (await request.get("/api/games")).json()).find(
    (game: { title: string }) => game.title === proposal.title,
  );
  expect(saved.cover).toEqual(proposal.cover);
  expect(saved.tags).toEqual(["Favourite", "puzzle", "Adventure"]);
  expect(saved.platforms).toEqual(["Switch"]);
  expect(saved.playtimeMinutes).toBe(180);
  expect(saved.rating).toBe(8);
  expect(saved.igdbId).toBeUndefined();
  await request.delete(`/api/games/${saved.id}`);
});
test("Create title debounce, keyboard dismissal, stale cancellation and mobile autocomplete preserve manual entry", async ({
  page,
}) => {
  await mock(page);
  let calls = 0;
  let oldStarted = false;
  let releaseOld!: () => void;
  const oldGate = new Promise<void>((resolve) => {
    releaseOld = resolve;
  });
  await page.unroute("**/api/igdb/search?*");
  await page.route("**/api/igdb/search?*", async (route) => {
    calls++;
    const query = new URL(route.request().url()).searchParams.get("q");
    if (query === "Old query") {
      oldStarted = true;
      await oldGate;
      await route
        .fulfill({ json: [{ ...proposal, title: "Stale result" }] })
        .catch(() => {});
    } else await route.fulfill({ json: [proposal, second] });
  });
  await add(page);
  const title = page.getByRole("combobox", { name: "Title", exact: true });
  await title.fill("ab");
  await page.waitForTimeout(350);
  expect(calls).toBe(0);
  await title.fill("abc");
  await title.fill("abcd");
  await expect(page.getByRole("option")).toHaveCount(2);
  expect(calls).toBe(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/igdb-autocomplete-mobile.png",
    fullPage: true,
  });
  const box = await page.locator(".igdb-suggestions").boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await title.press("Escape");
  await expect(page.getByRole("option")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(title).toHaveValue("abcd");
  await title.fill("Old query");
  await expect.poll(() => oldStarted).toBe(true);
  await title.fill("New query");
  await expect(page.getByRole("option")).toHaveCount(2);
  releaseOld();
  await page.waitForTimeout(50);
  await expect(page.getByRole("option", { name: /Stale result/ })).toHaveCount(
    0,
  );
  await title.press("ArrowDown");
  await title.press("ArrowDown");
  await title.press("ArrowUp");
  await title.press("Enter");
  await expect(title).toHaveValue(proposal.title);
  await title.fill("Manual title");
  await expect(page.getByRole("option")).toHaveCount(2);
  await title.press("Tab");
  await expect(page.getByRole("option")).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
});
test("Create preferences persist and upload takes precedence", async ({
  page,
  request,
}) => {
  const png = await mock(page);
  await add(page);
  await page.getByText("Autofill fields", { exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Autofill title", exact: true })
    .uncheck();
  await page
    .getByRole("checkbox", { name: "Autofill release date", exact: true })
    .uncheck();
  await page.getByText("Autofill fields", { exact: true }).click();
  await page
    .getByLabel("Upload cover image")
    .setInputFiles({ name: "tiny.png", mimeType: "image/png", buffer: png });
  await autoSelect(page, "Manual upload title");
  await expect(
    page.getByRole("combobox", { name: "Title", exact: true }),
  ).toHaveValue("Manual upload title");
  await expect(page.getByLabel("Release date", { exact: true })).toHaveValue(
    "",
  );
  await expect(page.locator(".form-cover-preview img")).toHaveAttribute(
    "src",
    /^blob:/,
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".form-cover-preview img")).toHaveAttribute(
    "src",
    /^blob:/,
  );
  await autoSelect(page, "Manual upload title ");
  await expect(
    page.getByRole("heading", { name: "Choose fields to apply" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Create game" }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "Manual upload title" }),
  ).toBeVisible();
  const saved = (await (await request.get("/api/games")).json()).find(
    (game: { title: string }) => game.title === "Manual upload title",
  );
  expect(saved.cover.type).toBe("upload");
  await request.delete(`/api/games/${saved.id}`);
  await page.reload();
  await page
    .getByRole("button", { name: "Add Game", exact: true })
    .first()
    .click();
  await page.getByText("Autofill fields", { exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Autofill title", exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Autofill release date", exact: true }),
  ).not.toBeChecked();
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("game-library.igdb-fields.v1")!),
  );
  expect(Object.keys(stored).sort()).toEqual([
    "cover",
    "releaseDate",
    "tags",
    "title",
  ]);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
});
test("Undo pauses on hover/focus, later autofill supersedes the snapshot and close clears it", async ({
  page,
}) => {
  await mock(page);
  await add(page);
  await page.clock.install();
  await autoSelect(page, "First manual title");
  await page.locator(".autofill-notice").hover();
  await page.clock.fastForward(11000);
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).focus();
  await page.mouse.move(0, 0);
  await page.clock.fastForward(11000);
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Review", { exact: true }).click();
  await page.clock.fastForward(11000);
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toHaveCount(0);
  await autoSelect(page, "First again");
  await autoSelect(page, "Second query", second.title);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Title", exact: true }),
  ).toHaveValue("Second query");
  await expect(page.getByLabel("Release date", { exact: true })).toHaveValue(
    proposal.releaseDate,
  );
  await autoSelect(page);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("button", { name: "Add Game", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toHaveCount(0);
});
test("provider failures and unavailable browser storage permit manual Create", async ({
  page,
  request,
}) => {
  await mock(page);
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error("Unavailable");
    };
    Storage.prototype.setItem = () => {
      throw new Error("Unavailable");
    };
  });
  await page.unroute("**/api/igdb/search?*");
  await page.route("**/api/igdb/search?*", (route) =>
    route.fulfill({ status: 503, json: { error: "Not configured" } }),
  );
  await add(page);
  await page
    .getByRole("combobox", { name: "Title", exact: true })
    .fill("Manual after IGDB failure");
  await expect(
    page.getByText(/Game suggestions are unavailable/),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Title", exact: true })
    .press("Escape");
  await page.getByRole("button", { name: "Create game" }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "Manual after IGDB failure" }),
  ).toBeVisible();
  const saved = (await (await request.get("/api/games")).json()).find(
    (game: { title: string }) => game.title === "Manual after IGDB failure",
  );
  await request.delete(`/api/games/${saved.id}`);
});
test("Edit title is independent from IGDB; explicit comparison preserves values until Save", async ({
  page,
  request,
}) => {
  await mock(page);
  const png = await (
    await import("sharp")
  )
    .default({
      create: { width: 8, height: 8, channels: 3, background: "blue" },
    })
    .png()
    .toBuffer();
  const created = await request.post("/api/games", {
    multipart: {
      input: JSON.stringify({
        title: "Existing manual game",
        tags: ["Favourite"],
        releaseDate: proposal.releaseDate,
        review: "Keep review",
      }),
      cover: { name: "cover.png", mimeType: "image/png", buffer: png },
    },
  });
  const saved = await created.json();
  let providerCalls = 0;
  page.on("request", (req) => {
    if (req.url().includes("/api/igdb/")) providerCalls++;
  });
  await page.goto("/");
  await page.getByRole("textbox", { name: "Search titles" }).fill(saved.title);
  await page.locator(".game-card").click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Title", exact: true })
    .fill("Edited manual title");
  await page.waitForTimeout(400);
  expect(providerCalls).toBe(0);
  await page.screenshot({
    path: "test-results/igdb-edit-form.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Autofill", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /IGDB synthetic adventure/ }),
  ).toBeVisible();
  await page.mouse.click(4, 4);
  await expect(
    page.getByRole("textbox", { name: "Title", exact: true }),
  ).toHaveValue("Edited manual title");
  await expect(page.getByRole("dialog")).toBeVisible();
  await explicitSelect(page);
  await expect(
    page.getByRole("heading", { name: "Choose fields to apply" }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "Title", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Genres (Tags)", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Cover", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Release date", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("textbox", { name: "Title", exact: true }),
  ).toHaveValue("Edited manual title");
  await explicitSelect(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/igdb-edit-mobile.png",
    fullPage: true,
  });
  await page.getByRole("checkbox", { name: "Title", exact: true }).uncheck();
  await page
    .getByRole("checkbox", { name: "Genres (Tags)", exact: true })
    .check();
  await page.getByRole("button", { name: "Apply selected" }).click();
  expect(
    (await (await request.get(`/api/games/${saved.id}`)).json()).cover,
  ).toEqual(saved.cover);
  await expect(
    page.getByRole("textbox", { name: "Title", exact: true }),
  ).toHaveValue("Edited manual title");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("button", { name: "Edit", exact: true }),
  ).toBeVisible();
  const updated = await (await request.get(`/api/games/${saved.id}`)).json();
  expect(updated.cover).toEqual(proposal.cover);
  expect(updated.tags).toEqual(["Favourite", ...proposal.tags]);
  expect(updated.review).toBe("Keep review");
  expect((await request.get(saved.cover.url)).status()).toBe(404);
  await request.delete(`/api/games/${saved.id}`);
});
test("IGDB API retains input validation and optional configuration", async ({
  request,
}) => {
  expect((await request.get("/api/igdb/search?q=")).status()).toBe(400);
  expect((await request.get("/api/igdb/games/invalid")).status()).toBe(400);
  const response = await request.get("/api/igdb/search?q=Synthetic");
  expect(response.status()).toBe(503);
  expect(response.headers()["cache-control"]).toBe("no-store");
});

test("Create suggestions support trackpad-style wheel scrolling without counts or manual search", async ({
  page,
}) => {
  await mock(page);
  await page.unroute("**/api/igdb/search?*");
  await page.route("**/api/igdb/search?*", (route) =>
    route.fulfill({
      json: Array.from({ length: 20 }, (_, i) => ({
        ...proposal,
        id: 200 + i,
        title: `Scrollable game ${i}`,
      })),
    }),
  );
  await add(page);
  await page.getByRole("combobox", { name: "Title" }).fill("Scrollable");
  await expect(page.getByRole("option")).toHaveCount(20);
  await expect(
    page.getByRole("button", { name: "Search manually" }),
  ).toHaveCount(0);
  await expect(page.getByText(/games found\./)).toHaveCount(0);
  await page.locator(".igdb-suggestion-list").hover();
  await page.mouse.wheel(0, 420);
  await expect
    .poll(() =>
      page.locator(".igdb-suggestion-list").evaluate((el) => el.scrollTop),
    )
    .toBeGreaterThan(0);
  await page.getByRole("combobox", { name: "Title" }).press("Escape");
  await expect(page.getByRole("dialog")).toBeVisible();
});
