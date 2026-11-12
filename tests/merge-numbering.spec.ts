import { test, expect } from "@playwright/test";
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
