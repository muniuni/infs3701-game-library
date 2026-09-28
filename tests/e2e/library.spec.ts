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
  await expect(page.getByLabel("Move UI fixture to status")).toHaveValue(
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
  await page.getByLabel("Move UI fixture to status").selectOption("Completed");
  await expect(page.locator(".error-message[role=alert]")).toContainText(
    "previous status has been restored",
  );
  await expect(page.getByLabel("Move UI fixture to status")).toHaveValue(
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
  await expect(
    page.getByRole("heading", { name: "No games found" }),
  ).toBeVisible();
});
