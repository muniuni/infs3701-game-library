import { test, expect, type Page } from "@playwright/test";
const game = {
  id: 701,
  title: "Synthetic Adventure",
  releaseYear: 2024,
  releaseDate: "2024-02-29",
  cover: {
    type: "url",
    url: "https://images.igdb.com/igdb/image/upload/t_cover_big/synthetic.jpg",
  },
  tags: ["Puzzle", "Adventure"],
  availablePlatforms: [
    { id: 6, name: "PC" },
    { id: 130, name: "Nintendo Switch" },
  ],
  developers: ["Example Studio"],
  publishers: ["Example Publisher"],
  summary: "A synthetic game summary.",
  storyline: "A synthetic story.",
  screenshots: [{ imageId: "shot1" }, { imageId: "shot2" }],
};
async function mocks(page: Page) {
  await page.route("https://images.igdb.com/**", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#344854"/></svg>',
    }),
  );
  await page.route("**/api/igdb/search?*", (route) =>
    route.fulfill({
      json: [game, { ...game, id: 702, title: "Other Adventure" }],
    }),
  );
  await page.route("**/api/igdb/games/*", (route) =>
    route.fulfill({
      json: route.request().url().endsWith("702")
        ? { ...game, id: 702, title: "Other Adventure" }
        : game,
    }),
  );
}
async function mode(page: Page, name: string) {
  await page.getByRole("button", { name: "Choose update mode" }).click();
  await page.getByRole("menuitemradio", { name, exact: true }).click();
}
async function add(page: Page) {
  await page.goto("/");
  await page
    .locator("header")
    .getByRole("button", { name: "Add Game", exact: true })
    .click();
}
test.afterEach(async ({ request }) => {
  for (const row of await (await request.get("/api/games")).json())
    await request.delete(`/api/games/${row.id}`);
});
test.beforeEach(async ({ page, request }) => {
  page.on("dialog", (dialog) => dialog.accept());
  for (const row of await (await request.get("/api/games")).json())
    await request.delete(`/api/games/${row.id}`);
  await mocks(page);
});

test("Create searches, previews, selects platforms, edits metadata and saves identity only on Add", async ({
  page,
  request,
}) => {
  await add(page);
  await expect(page.getByLabel("Title", { exact: true })).toBeHidden();
  await page.getByRole("combobox", { name: "Search game title" }).fill("S");
  await page.getByRole("option", { name: /Synthetic Adventure/ }).click();
  await expect(
    page.getByRole("heading", { name: "Confirm game" }),
  ).toBeVisible();
  await expect(page.getByText("Example Studio", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Search game title" }),
  ).toHaveValue("S");
  await page.getByRole("option", { name: /Synthetic Adventure/ }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    game.title,
  );
  await expect(page.getByLabel("Summary", { exact: true })).toHaveValue(
    game.summary,
  );
  const platforms = page.getByRole("group", { name: "Platforms", exact: true });
  await expect(
    platforms.getByRole("button", { name: "PC", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await platforms.getByRole("button", { name: "PC", exact: true }).click();
  await page.getByLabel("Review", { exact: true }).fill("My review");
  await page.getByRole("button", { name: "Move screenshot 2 earlier" }).click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Confirm game" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  for (let step = 0; step < 3; step++)
    await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByLabel("Review", { exact: true })).toHaveValue(
    "My review",
  );
  expect(await (await request.get("/api/games")).json()).toHaveLength(0);
  await page.getByRole("button", { name: "Add game", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.locator(".game-card-open").first().click();
  await expect(
    page.getByRole("button", { name: "Edit", exact: true }),
  ).toBeVisible();
  const [saved] = await (await request.get("/api/games")).json();
  expect(saved.igdbId).toBe(701);
  expect(saved.platforms).toEqual(["PC"]);
  expect(saved.availablePlatforms).toHaveLength(2);
  expect(saved.summary).toBe(game.summary);
  expect(saved.screenshots[0].imageId).toBe("shot2");
  await page.reload();
  await page.locator(".game-card-open").first().click();
  await expect(page.getByText(game.summary, { exact: true })).toBeVisible();
});

test("Edit defaults to empty, supports replace and manual selection, preserves draft until Save", async ({
  page,
  request,
}) => {
  const saved = await (
    await request.post("/api/games", {
      data: {
        title: "My custom title",
        igdbId: 701,
        tags: ["Favourite"],
        summary: "My summary",
        platforms: ["Custom platform"],
        review: "Keep review",
        cover: { type: "url", url: "https://example.com/old.jpg" },
      },
    })
  ).json();
  await page.goto("/");
  await page.locator(".game-card-open").first().click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Review", { exact: true }).fill("Unsaved review");
  await page
    .getByRole("button", { name: "Update metadata", exact: true })
    .click();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Update if empty", exact: true }),
  ).toBeEnabled();
  const titleRow = page.getByRole("row").filter({
    has: page.getByRole("rowheader", { name: /Title/ }),
  });
  await expect(titleRow).toHaveClass(/is-excluded/);
  await mode(page, "Replace current data");
  await expect(titleRow).not.toHaveClass(/is-excluded/);
  await mode(page, "Select manually");
  await page.screenshot({ path: "test-results/metadata-desktop.png" });
  await expect(
    page.getByRole("checkbox", { name: "Update Title", exact: true }),
  ).toBeChecked();
  await page
    .getByRole("checkbox", { name: "Update Title", exact: true })
    .uncheck();
  await page
    .getByRole("checkbox", { name: "Update Summary", exact: true })
    .uncheck();
  await expect(titleRow).toHaveClass(/is-excluded/);
  await expect(titleRow).toContainText(game.title);
  await mode(page, "Update if empty");
  await mode(page, "Select manually");
  await expect(
    page.getByRole("checkbox", { name: "Update Title", exact: true }),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "Apply selected", exact: true })
    .click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "My custom title",
  );
  await expect(page.getByLabel("Summary", { exact: true })).toHaveValue(
    "My summary",
  );
  await expect(page.getByLabel("Review", { exact: true })).toHaveValue(
    "Unsaved review",
  );
  expect(
    (await (await request.get(`/api/games/${saved.id}`)).json()).releaseDate,
  ).toBeUndefined();
  const savedTitle1 = await page
    .getByLabel("Title", { exact: true })
    .inputValue();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .locator(".game-card-open, .kanban-open, .list-row")
    .filter({ hasText: savedTitle1 })
    .first()
    .click();
  const result = await (await request.get(`/api/games/${saved.id}`)).json();
  expect(result.tags).toEqual(["Favourite", "Puzzle", "Adventure"]);
  expect(result.cover).toEqual(game.cover);
  expect(result.platforms).toEqual(["Custom platform"]);
  expect(result.review).toBe("Unsaved review");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("button", { name: "Update metadata", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Update if empty", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("Unlinked records search explicitly; cancellation does not persist metadata or identity", async ({
  page,
  request,
}) => {
  const saved = await (
    await request.post("/api/games", { data: { title: "Unlinked" } })
  ).json();
  await page.goto("/");
  await page.locator(".game-card-open").first().click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("button", { name: "Update metadata", exact: true })
    .click();
  await page.getByRole("option", { name: /Synthetic Adventure/ }).click();
  await page
    .getByRole("button", { name: "Find another game", exact: true })
    .click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await page
    .getByRole("button", { name: "Find another game", exact: true })
    .click();
  await page.getByRole("option", { name: /Other Adventure/ }).click();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await page.locator(".game-card-open").first().click();
  expect(
    (await (await request.get(`/api/games/${saved.id}`)).json()).igdbId,
  ).toBeUndefined();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Unlinked",
  );
});

test("Manual creation stays available during provider failure and narrow screens fit", async ({
  page,
  request,
}) => {
  await page.route("**/api/igdb/search?*", (route) =>
    route.fulfill({ status: 503, json: { error: "Search unavailable." } }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await add(page);
  await page
    .getByRole("combobox", { name: "Search game title" })
    .fill("Manual game");
  await expect(page.getByRole("alert")).toHaveText("Search unavailable.");
  await page.getByRole("button", { name: "Add manually", exact: true }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Manual game",
  );
  await page.getByLabel("Summary", { exact: true }).fill("Manual summary");
  await page.getByRole("button", { name: "Add game", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.locator(".game-card-open").first().click();
  await expect(
    page.getByRole("button", { name: "Edit", exact: true }),
  ).toBeVisible();
  expect(
    (await (await request.get("/api/games")).json())[0].igdbId,
  ).toBeUndefined();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.unroute("**/api/igdb/search?*");
  await mocks(page);
  await page
    .getByRole("button", { name: "Update metadata", exact: true })
    .click();
  await page.getByRole("option", { name: /Synthetic Adventure/ }).click();
  await mode(page, "Select manually");
  await page.screenshot({ path: "test-results/metadata-mobile.png" });
  expect(
    await page
      .getByRole("dialog")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "Apply selected", exact: true }),
  ).toBeInViewport();
});

test("Search ignores stale responses and composition; keyboard selects a preview", async ({
  page,
}) => {
  const queries: string[] = [];
  await page.route("**/api/igdb/search?*", async (route) => {
    const q = new URL(route.request().url()).searchParams.get("q")!;
    queries.push(q);
    if (q === "Old") await new Promise((resolve) => setTimeout(resolve, 400));
    await route.fulfill({
      json: [{ ...game, title: q === "Old" ? "Stale result" : game.title }],
    });
  });
  await add(page);
  const input = page.getByRole("combobox", { name: "Search game title" });
  await input.dispatchEvent("compositionstart");
  await input.fill("変換");
  await page.waitForTimeout(220);
  expect(queries).toHaveLength(0);
  await input.dispatchEvent("compositionend");
  await input.fill("Old");
  await expect.poll(() => queries.includes("Old")).toBe(true);
  await input.fill("New");
  await expect(
    page.getByRole("option", { name: /Synthetic Adventure/ }),
  ).toBeVisible();
  await page.waitForTimeout(450);
  await expect(page.getByText("Stale result")).toHaveCount(0);
  await input.press("ArrowDown");
  await input.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Confirm game" }),
  ).toBeVisible();
});

test("Linked refresh retries by ID and Replace retires an uploaded cover only after Save", async ({
  page,
  request,
}) => {
  const { default: sharp } = await import("sharp");
  const buffer = await sharp({
    create: { width: 4, height: 4, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  const saved = await (
    await request.post("/api/games", {
      multipart: {
        input: JSON.stringify({ title: "Uploaded fixture", igdbId: game.id }),
        cover: { name: "cover.png", mimeType: "image/png", buffer },
      },
    })
  ).json();
  let fail = true;
  await page.route("**/api/igdb/games/*", (route) =>
    fail
      ? route.fulfill({ status: 502, json: { error: "Metadata unavailable." } })
      : route.fulfill({ json: game }),
  );
  await page.goto("/");
  await page.locator(".game-card-open").first().click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("button", { name: "Update metadata", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveText("Metadata unavailable.");
  fail = false;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await mode(page, "Replace current data");
  await page
    .getByRole("button", { name: "Replace current data", exact: true })
    .click();
  expect((await request.get(saved.cover.url)).status()).toBe(200);
  const savedTitle2 = await page
    .getByLabel("Title", { exact: true })
    .inputValue();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .locator(".game-card-open, .kanban-open, .list-row")
    .filter({ hasText: savedTitle2 })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Edit", exact: true }),
  ).toBeVisible();
  expect((await request.get(saved.cover.url)).status()).toBe(404);
  expect(
    (await (await request.get(`/api/games/${saved.id}`)).json()).cover,
  ).toEqual(game.cover);
});

test("Empty mode fills only missing values and unchanged rows cannot be selected", async ({
  page,
  request,
}) => {
  const saved = await (
    await request.post("/api/games", {
      data: {
        title: game.title,
        igdbId: game.id,
        tags: ["Favourite"],
        summary: "Keep",
        cover: game.cover,
        platforms: ["PC"],
      },
    })
  ).json();
  await page.goto("/");
  await page.locator(".game-card-open").first().click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("button", { name: "Update metadata", exact: true })
    .click();
  await mode(page, "Select manually");
  await expect(
    page.getByRole("checkbox", { name: "Update Title", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("checkbox", { name: "Update Tags", exact: true }),
  ).not.toBeChecked();
  await mode(page, "Update if empty");
  await page
    .getByRole("button", { name: "Update if empty", exact: true })
    .click();
  const savedTitle3 = await page
    .getByLabel("Title", { exact: true })
    .inputValue();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .locator(".game-card-open, .kanban-open, .list-row")
    .filter({ hasText: savedTitle3 })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Edit", exact: true }),
  ).toBeVisible();
  const result = await (await request.get(`/api/games/${saved.id}`)).json();
  expect(result.summary).toBe("Keep");
  expect(result.tags).toEqual(["Favourite"]);
  expect(result.releaseDate).toBe(game.releaseDate);
  expect(result.developers).toEqual(game.developers);
  expect(result.platforms).toEqual(["PC"]);
});

test("Dismiss confirms changes, Cancel discards, failed dismissal retains edits, and nested viewers only close themselves", async ({
  page,
  request,
}) => {
  await add(page);
  await expect(
    page.getByRole("combobox", { name: "Search game title" }),
  ).toBeFocused();
  const initial = await page.getByRole("dialog").boundingBox();
  expect(initial!.height).toBeLessThan(680);
  await page
    .getByRole("combobox", { name: "Search game title" })
    .fill("Synthetic");
  await expect(page.getByRole("option")).toHaveCount(2);
  const suggestions = await page.getByRole("dialog").boundingBox();
  expect(suggestions!.height).toBe(initial!.height);
  await page.getByRole("option", { name: /Synthetic Adventure/ }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Review", { exact: true }).fill("Saved outside");
  await page
    .getByLabel("Developers", { exact: true })
    .fill("Studio A, Studio B");
  await page.mouse.click(5, 5);
  await expect(page.getByRole("alertdialog")).toBeVisible();
  expect(await (await request.get("/api/games")).json()).toHaveLength(0);
  await page.getByRole("button", { name: "Keep editing" }).click();
  await expect(page.getByLabel("Review", { exact: true })).toHaveValue(
    "Saved outside",
  );
  await page.mouse.click(5, 5);
  await page.getByRole("button", { name: "Save and close" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const [saved] = await (await request.get("/api/games")).json();
  expect(saved.review).toBe("Saved outside");
  expect(saved.developers).toEqual(["Studio A", "Studio B"]);
  await page.locator(".game-card-open").first().click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Review", { exact: true }).fill("Discard me");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await page.locator(".game-card-open").first().click();
  expect(
    (await (await request.get(`/api/games/${saved.id}`)).json()).review,
  ).toBe("Saved outside");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Review", { exact: true }).fill("Saved by Escape");
  await page
    .getByRole("button", { name: "Enlarge screenshot 1", exact: true })
    .click();
  const stage = await page.locator(".screenshot-stage").boundingBox();
  const close = await page
    .getByRole("button", { name: "Close screenshot" })
    .boundingBox();
  expect(close!.y + close!.height).toBeLessThanOrEqual(stage!.y);
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("heading", { name: "Screenshot 2 / 2" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  expect(
    (await (await request.get(`/api/games/${saved.id}`)).json()).review,
  ).toBe("Saved outside");
  await page.getByLabel("Review", { exact: true }).focus();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Save and close" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    (await (await request.get(`/api/games/${saved.id}`)).json()).review,
  ).toBe("Saved by Escape");
  await page.locator(".game-card-open").first().click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", { name: "Save and close", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.getByLabel("Title", { exact: true }).fill(game.title);
  await page.getByLabel("Review", { exact: true }).fill("Retry me");
  await page.route("**/api/games/*", (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({ status: 503, json: { error: "Save unavailable" } })
      : route.continue(),
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", { name: "Save and close", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveText("Save unavailable");
  await expect(page.getByLabel("Review", { exact: true })).toHaveValue(
    "Retry me",
  );
  await page.unroute("**/api/games/*");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", { name: "Save and close", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    (await (await request.get(`/api/games/${saved.id}`)).json()).review,
  ).toBe("Retry me");
});

test("Comparison dismissal applies manual choices and screenshot loading keeps its bounds", async ({
  page,
  request,
}) => {
  const saved = await (
    await request.post("/api/games", {
      data: {
        title: "Keep title",
        igdbId: game.id,
        summary: "Old summary",
        screenshots: game.screenshots,
      },
    })
  ).json();
  await page.goto("/");
  await page.locator(".game-card-open").first().click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("button", { name: "Update metadata", exact: true })
    .click();
  await expect(page.getByRole("table")).toBeVisible();
  await mode(page, "Select manually");
  await page
    .getByRole("checkbox", { name: "Update Summary", exact: true })
    .check();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", { name: "Save and close", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const updated = await (await request.get(`/api/games/${saved.id}`)).json();
  expect(updated.title).toBe("Keep title");
  expect(updated.summary).toBe(game.summary);
  await page.locator(".game-card-open").first().click();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/t_1080p/**", async (route) => {
    await gate;
    await route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#344854"/></svg>',
    });
  });
  await page
    .getByRole("button", { name: "Enlarge screenshot 1", exact: true })
    .click();
  await expect(page.locator(".screenshot-stage")).toHaveAttribute(
    "aria-busy",
    "true",
  );
  const before = await page.locator(".screenshot-dialog").boundingBox();
  release();
  await expect(page.locator(".screenshot-stage")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  const after = await page.locator(".screenshot-dialog").boundingBox();
  expect(after).toEqual(before);
  await page.screenshot({ path: "test-results/screenshot-viewer.png" });
  await page.getByRole("button", { name: "Close screenshot" }).click();
  await page.locator(".detail-scroll").evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.screenshot({ path: "test-results/polished-details.png" });
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.locator(".game-form-shell").evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.screenshot({ path: "test-results/polished-form.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".game-form-shell").evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.screenshot({ path: "test-results/polished-form-mobile.png" });
});

test("Unchanged edits close quietly; changed edits can be discarded or kept", async ({
  page,
  request,
}) => {
  const saved = await (
    await request.post("/api/games", { data: { title: "Close fixture" } })
  ).json();
  await page.goto("/");
  await page.locator(".game-card-open").first().click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await page.locator(".game-card-open").first().click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Review", { exact: true }).fill("Discard this");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Review", { exact: true })).toHaveValue(
    "Discard this",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    (await (await request.get(`/api/games/${saved.id}`)).json()).review,
  ).toBeUndefined();
});

test("Search loading, empty and error states keep bounds; Cancel offers all three choices", async ({
  page,
  request,
}) => {
  let release!: () => void;
  let gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let response: "results" | "empty" | "error" = "results";
  await page.route("**/api/igdb/search?*", async (route) => {
    await gate;
    if (response === "error")
      await route.fulfill({
        status: 503,
        json: { error: "Search unavailable." },
      });
    else await route.fulfill({ json: response === "empty" ? [] : [game] });
  });
  await add(page);
  const bounds = await page.getByRole("dialog").boundingBox();
  await page
    .getByRole("combobox", { name: "Search game title" })
    .fill("Synthetic");
  await expect(
    page.getByRole("status", { name: "Searching games" }),
  ).toBeVisible();
  expect(await page.getByRole("dialog").boundingBox()).toEqual(bounds);
  await page.screenshot({ path: "test-results/search-loading.png" });
  release();
  await expect(page.getByRole("option")).toHaveCount(1);
  expect(await page.getByRole("dialog").boundingBox()).toEqual(bounds);
  response = "empty";
  gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page
    .getByRole("combobox", { name: "Search game title" })
    .fill("No match");
  await expect(
    page.getByRole("status", { name: "Searching games" }),
  ).toBeVisible();
  expect(await page.getByRole("dialog").boundingBox()).toEqual(bounds);
  release();
  await expect(
    page.getByText("No games found.", { exact: true }),
  ).toBeVisible();
  expect(await page.getByRole("dialog").boundingBox()).toEqual(bounds);
  response = "error";
  await page
    .getByRole("combobox", { name: "Search game title" })
    .fill("Manual title");
  await expect(page.getByRole("alert")).toHaveText("Search unavailable.");
  expect(await page.getByRole("dialog").boundingBox()).toEqual(bounds);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Keep editing" }),
  ).toBeFocused();
  await page.screenshot({ path: "test-results/unsaved-desktop.png" });
  await page.setViewportSize({ width: 320, height: 700 });
  await page.screenshot({ path: "test-results/unsaved-mobile.png" });
  expect(
    await page
      .getByRole("alertdialog")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.getByRole("button", { name: "Keep editing" }).click();
  await expect(
    page.getByRole("combobox", { name: "Search game title" }),
  ).toHaveValue("Manual title");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Save and close" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await (await request.get("/api/games")).json())[0].title).toBe(
    "Manual title",
  );
});
