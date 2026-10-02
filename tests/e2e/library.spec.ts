import { test, expect } from "@playwright/test";
test("API validates input and shares records across collection and item routes", async ({
  request,
}) => {
  expect(
    (
      await request.post("/api/games", {
        data: { title: "Invalid", rating: 11 },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/games", {
        data: "{",
        headers: { "Content-Type": "application/json" },
      })
    ).status(),
  ).toBe(400);
  const response = await request.post("/api/games", {
    data: { title: "API fixture" },
  });
  expect(response.status()).toBe(201);
  const game = await response.json();
  expect(
    (await (await request.get(`/api/games/${game.id}`)).json()).title,
  ).toBe("API fixture");
  expect(
    (
      await request.post("/api/games", {
        data: { title: "api fixture", platforms: ["PC"] },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await request.patch(`/api/games/${game.id}`, {
        data: { status: "Completed" },
      })
    ).status(),
  ).toBe(200);
  expect(
    (await (await request.get("/api/games")).json()).find(
      (item: { id: string }) => item.id === game.id,
    ).status,
  ).toBe("Completed");
  expect((await request.delete(`/api/games/${game.id}`)).status()).toBe(204);
  expect((await request.get(`/api/games/${game.id}`)).status()).toBe(404);
});
test("create, edit, search, all views, drag, rollback, confirmation and mobile layout", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Add Game", exact: true })
    .first()
    .click();
  await page.getByLabel("Title", { exact: false }).last().fill("UI fixture");
  await page.getByLabel("Platforms", { exact: true }).fill("PC, Switch");
  await page.getByLabel("Tags", { exact: true }).fill("Puzzle, Favourite");
  await page.getByLabel("Playtime hours").fill("2");
  await page.getByLabel("Playtime minutes").fill("15");
  await page.getByRole("button", { name: "Create game" }).click();
  await expect(
    page.getByRole("dialog").getByText("2h 15m", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/desktop-detail.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Review", { exact: true }).fill("A memorable game.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("A memorable game.")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("textbox", { name: "Search titles" }).fill("UI fixture");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.locator(".list-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Kanban", exact: true }).click();
  await page
    .locator(".kanban-card")
    .dragTo(page.getByRole("region", { name: "Playing column" }), {
      sourcePosition: { x: 15, y: 15 },
    });
  await expect(page.getByLabel("Move UI fixture to status")).toContainText(
    "Playing",
  );
  await expect(page.getByLabel("Move UI fixture to status")).toBeEnabled();
  await page.route("**/api/games/*", (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Simulated failure." }),
        })
      : route.continue(),
  );
  await page
    .getByRole("combobox", { name: "Move UI fixture to status" })
    .click();
  await page.getByRole("option", { name: "Completed", exact: true }).click();
  await expect(page.locator(".error-message[role=alert]")).toContainText(
    "previous status has been restored",
  );
  await expect(page.getByLabel("Move UI fixture to status")).toContainText(
    "Playing",
  );
  await page.unroute("**/api/games/*");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Grid", exact: true }).click();
  await page.screenshot({
    path: "test-results/mobile-grid.png",
    fullPage: true,
  });
  await page.locator(".game-card").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Keep game" }).click();
  await expect(page.getByText("A memorable game.")).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete game", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText("UI fixture deleted.");
  await expect(
    page.getByRole("heading", { name: "No games found" }),
  ).toBeVisible();
});

test("sidebar filters, token entry and cover preview", async ({
  page,
  request,
}) => {
  const created: string[] = [];
  try {
    for (let i = 1; i <= 5; i++) {
      const response = await request.post("/api/games", {
        data: {
          title: `Refinement fixture ${i}`,
          platforms: ["PC"],
          tags: ["Puzzle"],
          rating: i === 1 ? 8 : 5,
        },
      });
      created.push((await response.json()).id);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await page.getByLabel("Search titles").fill("Refinement fixture");
    await expect(page.locator(".game-card")).toHaveCount(5);
    expect(
      await page
        .locator(".game-grid")
        .evaluate(
          (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
        ),
    ).toBe(4);
    const sort = page.getByRole("combobox", { name: "Sort games" });
    await sort.focus();
    await sort.press("Enter");
    await page
      .getByRole("option", { name: "Recently added", exact: true })
      .press("ArrowDown");
    await expect(
      page.getByRole("option", { name: "Recently updated", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(sort).toContainText("Recently updated");
    const sidebar = page.getByRole("complementary", {
      name: "Library filters",
    });
    await sidebar.getByRole("button", { name: "PC", exact: true }).click();
    await sidebar.getByRole("button", { name: "Puzzle", exact: true }).click();
    await expect(sidebar.locator(".filter-group").first()).toHaveAttribute(
      "aria-label",
      "Filter by rating",
    );
    await sidebar.getByRole("slider", { name: "Filter by rating" }).fill("5");
    await expect(page.locator(".game-card")).toHaveCount(5);
    await sidebar.getByRole("slider", { name: "Filter by rating" }).fill("8");
    await expect(page.locator(".game-card")).toHaveCount(1);
    await sidebar.getByRole("slider", { name: "Filter by rating" }).fill("0");
    await expect(page.locator(".game-card")).toHaveCount(5);
    const gridCover = await page.locator(".card-cover").first().boundingBox();
    expect(gridCover!.width / gridCover!.height).toBeCloseTo(4 / 3, 2);
    await page.screenshot({
      path: "test-results/refined-grid.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "List", exact: true }).click();
    const listCover = await page.locator(".list-cover").first().boundingBox();
    expect(listCover!.width / listCover!.height).toBeCloseTo(4 / 3, 2);
    await page.screenshot({
      path: "test-results/refined-list.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Kanban", exact: true }).click();
    const boardCover = await page
      .locator(".kanban-cover")
      .first()
      .boundingBox();
    expect(boardCover!.width / boardCover!.height).toBeCloseTo(4 / 3, 2);
    await page.screenshot({
      path: "test-results/refined-kanban.png",
      fullPage: true,
    });
    await page.evaluate(() => window.scrollTo(0, 400));
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(0);
    await expect
      .poll(() =>
        page
          .locator(".library-header")
          .evaluate((el) => el.getBoundingClientRect().top),
      )
      .toBe(0);
    await page
      .getByRole("button", { name: "Add Game", exact: true })
      .first()
      .click();
    await page
      .getByLabel("Title", { exact: false })
      .last()
      .fill("Refinement token fixture");
    const platforms = page.getByRole("combobox", {
      name: "Platforms",
      exact: true,
    });
    await platforms.fill("PC");
    await platforms.press(",");
    await platforms.fill("pc");
    await platforms.press("Enter");
    await expect(
      page.getByRole("button", {
        name: "Remove PC from platforms",
        exact: true,
      }),
    ).toHaveCount(1);
    await platforms.fill("Switch");
    await platforms.press("Tab");
    await expect(
      page.getByRole("button", { name: "Remove Switch from platforms" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Remove PC from platforms", exact: true })
      .click();
    await page.getByLabel("Tags", { exact: true }).fill("Puzzle, Favourite");
    await page.getByRole("radio", { name: "8 out of 10", exact: true }).check();
    await page.getByRole("combobox", { name: "Status", exact: true }).click();
    await page.getByRole("option", { name: "Playing", exact: true }).click();

    const formCover = await page.locator(".form-cover-preview").boundingBox();
    const titleInput = await page
      .getByRole("textbox", { name: "Title", exact: true })
      .boundingBox();
    const statusInput = await page
      .getByRole("combobox", { name: "Status", exact: true })
      .boundingBox();
    expect(formCover!.width / formCover!.height).toBeCloseTo(4 / 3, 2);
    expect(formCover!.y).toBeCloseTo(titleInput!.y, 0);
    expect(formCover!.y + formCover!.height).toBeCloseTo(
      statusInput!.y + statusInput!.height,
      0,
    );
    await expect(
      page.getByRole("button", { name: "Image URL", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByLabel("Cover URL")).toHaveCount(0);
    await expect(page.locator(".form-cover-preview img")).toHaveAttribute(
      "src",
      "/cover-placeholder.svg",
    );

    await page.screenshot({
      path: "test-results/refined-form.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Create game" }).click();
    await expect(
      page.getByRole("dialog").getByText("Switch", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: "8 out of 10", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".rating-stars .star-filled")).toHaveCount(8);
    await page.screenshot({ path: "test-results/star-rating-details.png" });
    const detailCover = await page.locator(".detail-cover").boundingBox();
    expect(detailCover!.width / detailCover!.height).toBeCloseTo(4 / 3, 2);
    const saved = (await (await request.get("/api/games")).json()).find(
      (game: { title: string }) => game.title === "Refinement token fixture",
    );
    created.push(saved.id);
    expect(saved.rating).toBe(8);
    expect(saved.status).toBe("Playing");
    expect(saved.platforms).toEqual(["Switch"]);
    expect(saved.tags).toEqual(["Puzzle", "Favourite"]);
    expect(saved.cover.type).toBe("placeholder");
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(
      page.getByRole("radio", { name: "8 out of 10", exact: true }),
    ).toBeChecked();
    await page.getByRole("radio", { name: "8 out of 10", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(
      page.getByRole("radio", { name: "9 out of 10", exact: true }),
    ).toBeChecked();
    await page
      .getByRole("button", { name: "Clear rating", exact: true })
      .click();
    await page.setViewportSize({ width: 390, height: 700 });
    await page.locator(".form-fields").evaluate((el) => {
      el.scrollTop = 0;
    });
    await expect(
      page.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeInViewport();
    await expect(
      page.getByRole("button", { name: "Save changes", exact: true }),
    ).toBeInViewport();
    await page.locator(".form-fields").evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect(
      page.getByRole("button", { name: "Save changes", exact: true }),
    ).toBeInViewport();
    expect(
      await page.locator(".form-fields").evaluate((el) => el.scrollTop),
    ).toBeGreaterThan(0);
    const fieldsBox = await page.locator(".form-fields").boundingBox();
    const footerBox = await page.locator(".form-actions").boundingBox();
    expect(fieldsBox!.y + fieldsBox!.height).toBeLessThanOrEqual(
      footerBox!.y + 1,
    );
    await page.screenshot({ path: "test-results/mobile-edit-form.png" });
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(
      page.getByRole("img", { name: "Not rated", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".rating-stars .star-filled")).toHaveCount(0);
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 700 });
    await page.getByRole("button", { name: "List", exact: true }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.locator(".filter-disclosure summary").click();
    await expect(
      sidebar.getByRole("button", { name: "All statuses" }),
    ).toBeHidden();
    await page.evaluate(() => window.scrollTo(0, 400));
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(0);
    await expect
      .poll(() =>
        page
          .locator(".library-header")
          .evaluate((el) => el.getBoundingClientRect().top),
      )
      .toBe(0);
    await expect(
      page.getByRole("textbox", { name: "Search titles" }),
    ).toBeInViewport();
    await expect(
      page.getByRole("button", { name: "Add Game", exact: true }).first(),
    ).toBeInViewport();
    await page.screenshot({
      path: "test-results/refined-mobile.png",
      fullPage: true,
    });
  } finally {
    for (const id of created) await request.delete(`/api/games/${id}`);
  }
});

test("filter recovery, narrow layouts and visible form validation", async ({
  page,
  request,
}) => {
  const response = await request.post("/api/games", {
    data: {
      title: "Responsive fixture with a longer game title",
      platforms: ["PC", "Handheld"],
      tags: ["A longer custom label", "Puzzle"],
      rating: 4,
    },
  });
  const game = await response.json();
  try {
    await page.goto("/");
    await page.getByLabel("Search titles").fill("Responsive fixture");
    await page
      .getByRole("button", { name: "Clear search", exact: true })
      .click();
    await expect(page.getByLabel("Search titles")).toBeFocused();
    await expect(page.getByLabel("Search titles")).toHaveValue("");
    await page
      .getByRole("group", { name: "Filter by platform", exact: true })
      .getByRole("button", { name: "PC", exact: true })
      .click();
    await page.getByRole("button", { name: "Remove platform filter" }).click();
    await expect(
      page.getByRole("group", { name: "Active filters" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Kanban", exact: true }).click();
    await page.getByLabel("Search titles").fill("No matching title");
    await expect(
      page.getByRole("heading", { name: "No games found" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Reset search and filters" })
      .click();
    await expect(page.locator(".kanban-card")).toHaveCount(1);
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      for (const view of ["Grid", "List", "Kanban"]) {
        await page.getByRole("button", { name: view, exact: true }).click();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
      }
    }
    await page.setViewportSize({ width: 390, height: 700 });
    await page
      .getByRole("button", { name: "Add Game", exact: true })
      .first()
      .click();
    await page.getByRole("textbox", { name: "Title", exact: true }).fill("   ");

    await page
      .getByRole("button", { name: "Create game", exact: true })
      .click();
    await expect(page.locator(".game-form [role=alert]")).toBeFocused();
    await expect(page.locator(".game-form [role=alert]")).toBeInViewport();
    await expect(
      page.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeInViewport();
    await page.screenshot({ path: "test-results/mobile-validation.png" });
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  } finally {
    await request.delete(`/api/games/${game.id}`);
  }
});

test("uploaded cover preview, save, unchanged edit, replacement and failed-save retry", async ({
  page,
  request,
}) => {
  const title = `Upload ${Date.now()}`;
  // Use a valid decoded PNG generated locally, independent of external resources.
  const sharp = (await import("sharp")).default;
  const image = await sharp({
    create: { width: 8, height: 8, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  await page.goto("/");
  await page
    .locator("header")
    .getByRole("button", { name: "Add Game", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Title" }).fill(title);
  await expect(page.locator(".cover-controls")).toHaveCount(0);
  await expect(page.getByLabel("Cover URL")).toHaveCount(0);
  // Upload is available immediately, without opening the source controls.
  await page.getByLabel("Upload cover image", { exact: true }).setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not an image"),
  });
  await expect(page.getByRole("alert")).toHaveText(
    "Choose a JPEG, PNG or WebP image.",
  );
  await page
    .getByLabel("Upload cover image", { exact: true })
    .setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: image });
  await expect(page.locator(".form-cover-preview img")).toHaveAttribute(
    "src",
    /^blob:/,
  );
  const initialPreview = await page
    .locator(".form-cover-preview img")
    .getAttribute("src");
  await page.getByLabel("Upload cover image", { exact: true }).setInputFiles({
    name: "invalid.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("invalid"),
  });
  await expect(page.locator(".form-cover-preview img")).toHaveAttribute(
    "src",
    initialPreview!,
  );
  const transfer = await page.evaluateHandle((bytes) => {
    const data = new DataTransfer();
    data.items.add(
      new File([new Uint8Array(bytes)], "dropped.png", { type: "image/png" }),
    );
    return data;
  }, Array.from(image));
  await page
    .locator(".cover-dropzone")
    .dispatchEvent("drop", { dataTransfer: transfer });
  await transfer.dispose();
  await expect(page.locator(".form-cover-preview img")).toHaveAttribute(
    "src",
    /^blob:/,
  );
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.screenshot({ path: "test-results/cover-upload-desktop.png" });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: "test-results/cover-upload-mobile.png" });
  const uploadBounds = await page.locator(".cover-dropzone").boundingBox();
  expect(uploadBounds!.x + uploadBounds!.width).toBeLessThanOrEqual(375);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.route("**/api/games", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 503,
        json: { error: "Temporary save failure. Try again." },
      });
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Create game", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Temporary save failure");
  await page.unroute("**/api/games");
  await page.getByRole("button", { name: "Create game", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit", exact: true }),
  ).toBeVisible();
  const games = await (await request.get("/api/games")).json();
  const game = games.find((item: { title: string }) => item.title === title);
  expect(game.cover.type).toBe("upload");
  const cover = await request.get(game.cover.url);
  expect(cover.status()).toBe(200);
  expect(cover.headers()["content-type"]).toBe("image/png");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("textbox", { name: "Title" }).fill(`${title} edited`);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit", exact: true }),
  ).toBeVisible();
  expect(
    (await (await request.get(`/api/games/${game.id}`)).json()).cover,
  ).toEqual(game.cover);
  await page.getByRole("button", { name: "Edit", exact: true }).click();

  await page.getByLabel("Upload cover image", { exact: true }).setInputFiles({
    name: "replacement.png",
    mimeType: "image/png",
    buffer: image,
  });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(
    (await (await request.get(`/api/games/${game.id}`)).json()).cover,
  ).toEqual(game.cover);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Upload cover image", { exact: true }).setInputFiles({
    name: "replacement.png",
    mimeType: "image/png",
    buffer: image,
  });
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit", exact: true }),
  ).toBeVisible();
  expect((await request.get(game.cover.url)).status()).toBe(404);
  await request.delete(`/api/games/${game.id}`);
});

test("label suggestions, visible feedback and quick status changes", async ({
  page,
  request,
}) => {
  const seed = await (
    await request.post("/api/games", {
      data: {
        title: "Suggestion source",
        platforms: ["PC", "Switch"],
        tags: ["Cooperative", "Cozy", "Puzzle"],
      },
    })
  ).json();
  let createdId: string | undefined;
  const title = "Suggested game";
  try {
    await page.goto("/");
    await page
      .locator("header")
      .getByRole("button", { name: "Add Game", exact: true })
      .click();
    await page.getByRole("textbox", { name: "Title", exact: true }).fill(title);
    await page
      .getByRole("group", { name: "Suggested platforms" })
      .getByRole("button", { name: "PC", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Remove PC from platforms" }),
    ).toBeVisible();
    const platforms = page.getByRole("combobox", {
      name: "Platforms",
      exact: true,
    });
    await platforms.fill("Steam Deck");
    await platforms.press("Enter");
    const tags = page.getByRole("combobox", { name: "Tags", exact: true });
    await tags.fill("co");
    await tags.press("ArrowDown");
    await expect(
      page.getByRole("option", { name: "Cooperative", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await tags.press("ArrowDown");
    await expect(
      page.getByRole("option", { name: "Cozy", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await tags.press("ArrowUp");
    await tags.press("Enter");
    await expect(
      page.getByRole("button", { name: "Remove Cooperative from tags" }),
    ).toBeVisible();
    await tags.fill("pu");
    await tags.press("Escape");
    await expect(
      page.getByRole("listbox", { name: "Suggested tags" }),
    ).toHaveCount(0);
    await expect(page.getByRole("dialog")).toBeVisible();
    await tags.fill("co");
    await page.getByRole("option", { name: "Cozy", exact: true }).click();
    await tags.fill("cooperative");
    await tags.press("Enter");
    await expect(
      page.getByRole("button", { name: "Remove Cooperative from tags" }),
    ).toHaveCount(1);
    await tags.fill("pu");
    await page.screenshot({ path: "test-results/tag-suggestions.png" });
    await page.getByRole("option", { name: "Puzzle", exact: true }).click();
    await page
      .getByRole("button", { name: "Create game", exact: true })
      .click();
    await expect(page.getByRole("status")).toHaveText(`${title} saved.`);
    const created = (await (await request.get("/api/games")).json()).find(
      (game: { title: string }) => game.title === title,
    );
    createdId = created.id;
    expect(created.platforms).toEqual(["PC", "Steam Deck"]);
    expect(created.tags).toEqual(["Cooperative", "Cozy", "Puzzle"]);
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("textbox", { name: "Search titles" }).fill(title);
    const status = page.getByRole("combobox", {
      name: `Change ${title} status`,
      exact: true,
    });
    await status.click();
    await page.getByRole("option", { name: "Playing", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("status")).toHaveText(
      `${title} moved to Playing.`,
    );
    expect(
      (await (await request.get(`/api/games/${createdId}`)).json()).status,
    ).toBe("Playing");
    await page.getByRole("button", { name: "List", exact: true }).click();
    await status.click();
    await page.getByRole("option", { name: "Completed", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText(
      `${title} moved to Completed.`,
    );
    await page.route("**/api/games/*", (route) =>
      route.request().method() === "PATCH"
        ? route.fulfill({ status: 500, json: { error: "Try again." } })
        : route.continue(),
    );
    await status.click();
    await page.getByRole("option", { name: "Backlog", exact: true }).click();
    await expect(status).toHaveText("Completed");
    await expect(page.locator(".error-message[role=alert]")).toContainText(
      "previous status has been restored",
    );
    await page.unroute("**/api/games/*");
    await page
      .getByRole("button", { name: `Open ${title}`, exact: true })
      .click();
    await status.click();
    await page.getByRole("option", { name: "Dropped", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText(
      `${title} moved to Dropped.`,
    );
    await page.screenshot({ path: "test-results/refined-details.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "test-results/refined-details-mobile.png" });
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByRole("combobox", { name: "Tags", exact: true }).fill("p");
    await page.screenshot({ path: "test-results/refined-chips-mobile.png" });
  } finally {
    await request.delete(`/api/games/${seed.id}`);
    if (createdId) await request.delete(`/api/games/${createdId}`);
  }
});
