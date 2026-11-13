import { test, expect } from "@playwright/test";

test("immediate parent level identifies the parent and sends the selected scope", async ({
  page,
}) => {
  const doc = (id: string, role: string) => ({
    id,
    role,
    filename: `${id}.docx`,
    project_id: "project",
    version_id: `${id}-version`,
    size_bytes: 1000,
    status: "uploaded",
    analysis_status: "completed",
    created_at: "2026-11-12",
  });
  const node = (
    key: string,
    title: string,
    level: number,
    parent: string | null,
  ) => ({
    node_key: key,
    title,
    level,
    parent_node_key: parent,
    block_index: level,
    end_block_index: 10,
  });
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith("/documents")
      ? [doc("master", "master"), doc("source", "source")]
      : path.endsWith("/master/outline")
        ? [
            node("root", "2 Chapter", 1, null),
            node("parent", "2.2 Parent", 2, "root"),
            node("child", "2.2.2 Engineering", 3, "parent"),
          ]
        : path.endsWith("/source/outline")
          ? [node("source-root", "4.1 Imported", 2, null)]
          : path.endsWith("/merge-preview")
            ? { warnings: [], diagnostics: [] }
            : [];
    await route.fulfill({ json: body });
  });
  await page.goto("/projects/project/merge");
  await page.getByRole("button", { name: /source.docx/ }).click();
  await page.getByRole("checkbox").check();
  await page
    .locator(".master-node")
    .filter({ hasText: "2.2.2 Engineering" })
    .click();
  const plan = page.locator(".plan-row");
  const level = plan.getByLabel("Inserted section level");
  await level.selectOption("parent");
  await expect(plan.getByText("After parent: 2.2 Parent")).toBeVisible();
  const request = page.waitForRequest((r) =>
    r.url().endsWith("/merge-preview"),
  );
  await page.getByRole("button", { name: "Check compatibility" }).click();
  const operation = (await request).postDataJSON().operations[0];
  expect(operation.destination_node_key).toBe("child");
  expect(operation.resolution_options.promote_to_parent_level).toBe(true);
  expect(operation.resolution_options.promote_to_top_level).toBe(false);
  const destination = plan.locator("select").nth(2);
  await destination.selectOption("parent");
  await expect(plan.getByText("After parent: 2 Chapter")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create merge (1)" }),
  ).toBeEnabled();
  await destination.selectOption("root");
  await expect(level).toHaveValue("parent");
  const warning = plan.getByRole("alert");
  await expect(warning).toContainText(
    "is a top-level heading and has no parent",
  );
  await expect(warning).toHaveCSS("color", "rgb(180, 35, 24)");
  await expect(
    page.getByRole("button", { name: "Create merge (1)" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Check compatibility" }),
  ).toBeDisabled();
  await level.selectOption("top");
  await expect(warning).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Create merge (1)" }),
  ).toBeEnabled();
  await level.selectOption("parent");
  await expect(warning).toBeVisible();
  await destination.selectOption("child");
  await expect(warning).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Create merge (1)" }),
  ).toBeEnabled();
  await destination.selectOption("");
  await expect(warning).toContainText(
    "Choose a destination with an immediate parent heading",
  );
  await expect(
    page.getByRole("button", { name: "Create merge (1)" }),
  ).toBeDisabled();
});

test("source and master maps show document numbering and preserve selection identities", async ({
  page,
}) => {
  const doc = (id: string, role: string) => ({
    id,
    role,
    filename: `${id}.docx`,
    project_id: "project",
    version_id: `${id}-version`,
    size_bytes: 1000,
    status: "uploaded",
    analysis_status: "completed",
    created_at: "2026-11-12",
  });
  const node = (label: string, title: string, status = "resolved") => ({
    node_key: "heading-7",
    title,
    level: 2,
    parent_node_key: null,
    block_index: 6,
    end_block_index: 10,
    automatic_label: status === "resolved" ? label : null,
    display_title: status === "resolved" ? `${label}\t${title}` : null,
    label_status: status,
  });
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith("/documents")
      ? [doc("master", "master"), doc("source", "source")]
      : path.endsWith("/master/outline")
        ? [node("4.1", "Synthetic master section")]
        : path.endsWith("/source/outline")
          ? [
              node("2.4.2", "Synthetic source section"),
              {
                ...node("", "Unsupported section", "unresolved"),
                node_key: "heading-11",
                block_index: 10,
              },
            ]
          : [];
    await route.fulfill({ json: body });
  });
  await page.goto("/projects/project/merge");
  await expect(
    page.getByText("4.1 Synthetic master section", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /source.docx/ }).click();
  await expect(
    page.getByText("2.4.2 Synthetic source section", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Unsupported section · numbering unresolved", {
      exact: true,
    }),
  ).toBeVisible();
});

test("saved merge distinguishes preservation checks from pending TOC pagination", async ({
  page,
}) => {
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({
      json: path.endsWith("/merge-results")
        ? [
            {
              generated_document_id: "result",
              generated_version_id: "version",
              source_node_keys: ["heading-1"],
              editor_anchor_ids: ["idms_merge_1"],
              preservation_status: "passed",
              toc_refresh_status: "pending_layout",
            },
          ]
        : [],
    });
  });
  await page.goto("/projects/project/merge");
  await expect(
    page.getByText("Original document structure passed preservation checks."),
  ).toBeVisible();
  await expect(
    page.getByText(/Table of contents refresh required/),
  ).toBeVisible();
});
