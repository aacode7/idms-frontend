import { test, expect, type Page } from "@playwright/test";

async function prepare(page: Page) {
  const doc = (id: string, role: string) => ({
    id,
    role,
    filename: `${id}.docx`,
    project_id: "project",
    version_id: `${id}-v1`,
    size_bytes: 1000,
    status: "uploaded",
    analysis_status: "completed",
    created_at: "2026-11-14",
  });
  const node = (
    key: string,
    title: string,
    level: number,
    start: number,
    end: number,
    parent: string | null,
  ) => ({
    node_key: key,
    title,
    level,
    block_index: start,
    end_block_index: end,
    parent_node_key: parent,
  });
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({
      json: path.endsWith("/documents")
        ? [doc("master", "master"), doc("source", "source")]
        : path.endsWith("/master/outline")
          ? [
              node("chapter", "5 Chapter", 1, 0, 20, null),
              node("parent", "5.13.1 Parent", 3, 1, 20, "chapter"),
              node("target", "5.13.1.3 Target", 4, 2, 8, "parent"),
              node(
                "deep",
                "5.13.1.3.1.1.1.1.1 Deep target",
                9,
                9,
                20,
                "parent",
              ),
            ]
          : path.endsWith("/source/outline")
            ? [
                node("root", "1.2 Reference Documents", 2, 0, 8, null),
                node("child", "1.2.1 Child", 3, 2, 8, "root"),
                node("excluded", "1.2.1.1 Deep child", 4, 4, 8, "child"),
              ]
            : path.endsWith("/merge-preview")
              ? { warnings: [], diagnostics: [] }
              : [],
    });
  });
  await page.goto("/projects/project/merge");
  await page.getByRole("button", { name: /source.docx/ }).click();
  await page
    .getByRole("checkbox", {
      name: "Include 1.2 Reference Documents",
      exact: true,
    })
    .check();
  await page
    .getByRole("checkbox", { name: "Include 1.2.1.1 Deep child", exact: true })
    .uncheck();
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  const row = page.locator(".source-node").filter({
    has: page.getByRole("checkbox", {
      name: "Include 1.2 Reference Documents",
      exact: true,
    }),
  });
  await row.dispatchEvent("dragstart", { dataTransfer: transfer });
  await page
    .locator(".master-node")
    .filter({ hasText: "5.13.1.3 Target" })
    .dispatchEvent("drop", { dataTransfer: transfer });
  return page.locator(".plan-row");
}

test("dragging a parent with a child blocks at level five and updates with scope and placement", async ({
  page,
}) => {
  const plan = await prepare(page);
  const warning = plan.getByRole("alert");
  await expect(warning).toContainText("heading level 5");
  await expect(warning).toContainText("maximum of 4 heading levels");
  await expect(
    page.getByRole("button", { name: "Create merge (1)" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Heading level needs attention", { exact: true }),
  ).toBeVisible();
  const warningBox = await warning.boundingBox();
  const removeBox = await plan
    .getByRole("button", { name: "Remove", exact: true })
    .boundingBox();
  expect(warningBox!.y).toBeGreaterThanOrEqual(
    removeBox!.y + removeBox!.height,
  );
  await page.screenshot({
    path: "/tmp/idms-heading-depth-warning.png",
    fullPage: true,
  });
  await plan.getByLabel("Inserted section level").selectOption("parent");
  await expect(warning).toHaveCount(0);
  await plan.getByLabel("Inserted section level").selectOption("sibling");
  await expect(warning).toBeVisible();
  await page
    .getByRole("checkbox", { name: "Include 1.2.1 Child", exact: true })
    .uncheck();
  await expect(warning).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Create merge (1)" }),
  ).toBeEnabled();
  await plan.getByLabel("Inserted section level").selectOption("top");
  await expect(warning).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("unsupported level ten blocks merging and becomes valid when placed higher", async ({
  page,
}) => {
  const plan = await prepare(page);
  await plan.locator("select").nth(2).selectOption("deep");
  await expect(plan.getByRole("alert")).toContainText("heading level 10");
  await expect(
    page.getByRole("button", { name: "Create merge (1)" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Check compatibility" }),
  ).toBeDisabled();
  await plan.getByLabel("Inserted section level").selectOption("parent");
  await expect(plan.getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Create merge (1)" }),
  ).toBeEnabled();
});

test("unsupported numbering discovered before merge blocks job creation and clears after a change", async ({
  page,
}) => {
  const plan = await prepare(page);
  await plan.getByLabel("Inserted section level").selectOption("parent");
  let queued = 0;
  await page.route("**/merge-jobs", async (route) => {
    queued++;
    await route.fulfill({ json: { id: "unexpected", status: "queued" } });
  });
  await page.route("**/merge-preview", async (route) =>
    route.fulfill({
      json: {
        warnings: [],
        diagnostics: [
          {
            code: "compatibility.numbering_depth",
            severity: "error",
            operation_index: 0,
            message:
              "The master numbering does not define level 4 needed by this selection.",
          },
        ],
      },
    }),
  );
  await page.getByRole("button", { name: "Create merge (1)" }).click();
  await expect(plan.getByRole("alert")).toContainText(
    "master numbering does not define level 4",
  );
  await expect(plan.locator(".plan-depth-warning")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Create merge (1)" }),
  ).toBeDisabled();
  expect(queued).toBe(0);
  await plan.getByLabel("Inserted section level").selectOption("top");
  await expect(plan.getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Create merge (1)" }),
  ).toBeEnabled();
});

test("a compatibility response for an earlier destination cannot block the edited plan", async ({
  page,
}) => {
  const plan = await prepare(page);
  await plan.getByLabel("Inserted section level").selectOption("parent");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/merge-preview", async (route) => {
    await gate;
    await route.fulfill({
      json: {
        warnings: [],
        diagnostics: [
          {
            code: "compatibility.numbering_depth",
            severity: "error",
            operation_index: 0,
            message: "Stale numbering error",
          },
        ],
      },
    });
  });
  const request = page.waitForRequest((r) =>
    r.url().endsWith("/merge-preview"),
  );
  await page.getByRole("button", { name: "Check compatibility" }).click();
  await request;
  await plan.getByLabel("Inserted section level").selectOption("top");
  release();
  await expect(
    page.getByRole("button", { name: "Check compatibility" }),
  ).toBeEnabled();
  await expect(
    page.getByText("Stale numbering error", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Create merge (1)" }),
  ).toBeEnabled();
});

test("a supported level-four placement still creates the merge after validation", async ({
  page,
}) => {
  const plan = await prepare(page);
  await plan.getByLabel("Inserted section level").selectOption("parent");
  await page.route("**/merge-preview", async (route) =>
    route.fulfill({
      json: {
        warnings: [],
        diagnostics: [
          {
            code: "compatibility.heading_depth",
            severity: "info",
            operation_index: 0,
            master_value: "4",
            message: "This selection creates headings through level 4.",
          },
        ],
      },
    }),
  );
  await page.route("**/merge-jobs", async (route) =>
    route.fulfill({
      json: {
        id: "supported-depth-job",
        kind: "merge",
        status: "queued",
        stage: "queued",
      },
    }),
  );
  await page.route("**/jobs/supported-depth-job", async (route) =>
    route.fulfill({
      json: {
        id: "supported-depth-job",
        kind: "merge",
        status: "completed",
        stage: "completed",
      },
    }),
  );
  const queued = page.waitForRequest((r) => r.url().endsWith("/merge-jobs"));
  await page.getByRole("button", { name: "Create merge (1)" }).click();
  const operation = (await queued).postDataJSON().operations[0];
  expect(operation.destination_node_key).toBe("target");
  expect(
    operation.included_sections.map((n: { node_key: string }) => n.node_key),
  ).toEqual(["root", "child"]);
  await expect(page.locator(".plan-row")).toHaveCount(0);
});
