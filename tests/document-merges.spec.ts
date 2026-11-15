import { expect, test } from "@playwright/test";

const draft = {
  id: "merge-test",
  name: "Combined design",
  created_at: "2026-11-15T00:00:00Z",
  status: "draft",
  stage: "uploading",
  inputs: [],
  document_id: null,
  version_id: null,
  toc_count: null,
  heading_count: null,
  error_code: null,
  error_message: null,
};

test("homepage keeps merged documents below ordinary projects", async ({
  page,
}) => {
  await page.route("**/api/v1/projects", (route) =>
    route.fulfill({
      json: [
        {
          id: "ordinary",
          name: "Ordinary project",
          description: null,
          document_count: 2,
          created_at: "2026-11-15",
          updated_at: "2026-11-15",
        },
      ],
    }),
  );
  await page.route("**/api/v1/document-merges", (route) =>
    route.fulfill({
      json: [
        {
          ...draft,
          status: "completed",
          stage: "completed",
          document_id: "output",
          version_id: "v1",
        },
      ],
    }),
  );
  await page.goto("/dashboard");
  await expect(
    page.getByRole("link", { name: "Merge documents", exact: true }),
  ).toHaveAttribute("href", "/document-merges/new");
  const projects = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Your projects", exact: true }),
  });
  await expect(projects.getByText("Ordinary project")).toBeVisible();
  await expect(projects.getByText("Combined design")).toHaveCount(0);
  const merges = page.getByRole("region", { name: "Merged documents" });
  await expect(merges.getByRole("link")).toHaveAttribute(
    "href",
    "/document-merges/merge-test",
  );
  await expect(merges.getByText("1 completed")).toBeVisible();
});

test("create, upload, reorder, merge and reopen view/download choices", async ({
  page,
}) => {
  type Input = {
    document_id: string;
    version_id: string;
    filename: string;
    status: string;
  };
  let inputs: Input[] = [];
  let status = "draft";
  let sentOrder: string[] = [];
  let uploads = 0;
  let polls = 0;
  await page.route("**/test-storage/**", (route) =>
    route.fulfill({ status: 200 }),
  );
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/document-merges") && request.method() === "POST") {
      expect(request.postDataJSON().name).toBe("Combined design");
      return route.fulfill({ json: draft });
    }
    if (path.endsWith("/documents/uploads")) {
      const body = request.postDataJSON();
      expect(body.checksum_sha256).toMatch(/^[a-f0-9]{64}$/);
      uploads += 1;
      inputs.push({
        document_id: `doc-${uploads}`,
        version_id: `version-${uploads}`,
        filename: body.filename,
        status: "upload_pending",
      });
      return route.fulfill({
        json: {
          document_id: `doc-${uploads}`,
          version_id: `version-${uploads}`,
          upload_url: `http://127.0.0.1:3138/test-storage/${uploads}`,
          object_key: `test-${uploads}`,
        },
      });
    }
    if (path.endsWith("/uploads/complete")) {
      const input = inputs.find((i) => path.includes(i.document_id))!;
      input.status = "uploaded";
      return route.fulfill({
        json: { id: input.document_id, version_id: input.version_id },
      });
    }
    if (path.endsWith("/jobs")) {
      sentOrder = request.postDataJSON().version_ids;
      status = "queued";
      return route.fulfill({
        json: { ...draft, inputs, status, stage: "queued" },
      });
    }
    if (path.endsWith("/document-merges/merge-test")) {
      if (status === "queued" && ++polls > 1) status = "completed";
      return route.fulfill({
        json: {
          ...draft,
          inputs,
          status,
          stage: status,
          ...(status === "completed"
            ? {
                document_id: "output",
                version_id: "v1",
                toc_count: 2,
                heading_count: 14,
              }
            : {}),
        },
      });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/document-merges/new");
  await expect(
    page.getByRole("heading", { name: "Merge two documents", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Combine two complete DOCX files", { exact: false }),
  ).toHaveCount(0);
  await page.getByLabel("Merged document name").fill("Combined design");
  await page.getByRole("button", { name: "Continue to documents" }).click();
  await expect(page).toHaveURL(/document-merges\/merge-test$/);
  for (const filename of ["first.docx", "second.docx"]) {
    await page.locator('input[type="file"]').setInputFiles({
      name: filename,
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: Buffer.from("Synthetic upload"),
    });
    await expect(page.getByText(filename, { exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Swap document order" }).click();
  await page
    .getByRole("button", { name: "Merge documents", exact: true })
    .click();
  await expect.poll(() => sentOrder).toEqual(["version-2", "version-1"]);
  await expect(
    page.getByRole("link", { name: "View document", exact: true }),
  ).toBeVisible({ timeout: 10000 });
  await expect(
    page.getByText("2 tables of contents refreshed in place.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Download DOCX" }),
  ).toHaveAttribute("href", /document-merges\/merge-test\/download$/);
  await expect(
    page.getByRole("link", { name: "View document", exact: true }),
  ).toHaveAttribute("href", /mode=view&returnTo=/);
  await page.reload();
  await expect(
    page.getByRole("link", { name: "View document", exact: true }),
  ).toBeVisible();
});

test("failed merges offer retry and keep the failure explanation", async ({
  page,
}) => {
  await page.route("**/api/v1/document-merges/merge-test", (route) =>
    route.fulfill({
      json: {
        ...draft,
        status: "failed",
        stage: "failed",
        error_message: "A TOC selector could not be resolved.",
        inputs: [1, 2].map((i) => ({
          document_id: `doc-${i}`,
          version_id: `version-${i}`,
          filename: `doc-${i}.docx`,
          status: "uploaded",
        })),
      },
    }),
  );
  await page.goto("/document-merges/merge-test");
  await expect(page.locator("p[role=alert]")).toContainText(
    "A TOC selector could not be resolved.",
  );
  await expect(page.getByRole("button", { name: "Retry merge" })).toBeEnabled();
  await expect(page.getByRole("link", { name: "Download DOCX" })).toHaveCount(
    0,
  );
});

test("delete menu confirms, cancels and removes only the selected merge", async ({
  page,
}) => {
  let deleted = false;
  let deletes = 0;
  const result = { ...draft, status: "completed", stage: "completed" };
  await page.route("**/api/v1/projects", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/v1/document-merges", (route) =>
    route.fulfill({ json: deleted ? [] : [result] }),
  );
  await page.route("**/api/v1/document-merges/merge-test", (route) => {
    expect(route.request().method()).toBe("DELETE");
    deletes++;
    deleted = true;
    return route.fulfill({ status: 204 });
  });
  await page.goto("/dashboard");
  const merges = page.getByRole("region", { name: "Merged documents" });
  await merges
    .getByRole("button", {
      name: "Actions for merged document Combined design",
    })
    .click();
  await merges
    .getByRole("menuitem", { name: "Delete merged document" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(
    "uploaded copies of both source documents",
  );
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  expect(deletes).toBe(0);
  await expect(
    merges.getByText("Combined design", { exact: true }),
  ).toBeVisible();
  await merges
    .getByRole("button", {
      name: "Actions for merged document Combined design",
    })
    .click();
  await merges
    .getByRole("menuitem", { name: "Delete merged document" })
    .click();
  await dialog
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(merges.getByRole("link")).toHaveCount(0);
  await expect(merges.getByText("0 completed")).toBeVisible();
  expect(deletes).toBe(1);
  await page.reload();
  await expect(
    merges.getByText("No merged documents yet.", { exact: false }),
  ).toBeVisible();
});

test("failed deletion retains the merge and allows retry", async ({ page }) => {
  let deletes = 0;
  await page.route("**/api/v1/projects", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/v1/document-merges", (route) =>
    route.fulfill({ json: [draft] }),
  );
  await page.route("**/api/v1/document-merges/merge-test", (route) => {
    if (route.request().method() !== "DELETE")
      return route.fulfill({ json: draft });
    deletes++;
    return deletes === 1
      ? route.fulfill({
          status: 502,
          json: { detail: "Storage is unavailable. Please retry." },
        })
      : route.fulfill({ status: 204 });
  });
  await page.goto("/dashboard");
  await page
    .getByRole("button", {
      name: "Actions for merged document Combined design",
    })
    .click();
  await page.getByRole("menuitem", { name: "Delete merged document" }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Storage is unavailable. Please retry.",
  );
  await expect(
    page.getByText("Combined design", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(deletes).toBe(2);
});

test("processing merges cannot be deleted from the card", async ({ page }) => {
  await page.route("**/api/v1/projects", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/v1/document-merges", (route) =>
    route.fulfill({
      json: [{ ...draft, status: "running", stage: "merging" }],
    }),
  );
  await page.goto("/dashboard");
  await page
    .getByRole("button", {
      name: "Actions for merged document Combined design",
    })
    .click();
  await expect(
    page.getByRole("menuitem", { name: "Delete merged document" }),
  ).toBeDisabled();
});

test("progress follows saved worker stages and survives reloading", async ({
  page,
}) => {
  let status = "queued";
  let stage = "queued";
  await page.route("**/api/v1/document-merges/merge-test", (route) =>
    route.fulfill({
      json: {
        ...draft,
        status,
        stage,
        document_id: "output",
        version_id: "v1",
      },
    }),
  );
  await page.goto("/document-merges/merge-test");
  const progress = page.getByRole("progressbar", { name: "Merge progress" });
  await expect(progress).toHaveAttribute("value", "0");
  await expect(progress).toHaveAttribute("max", "100");
  await expect(
    page.getByText("You can leave this page.", { exact: false }),
  ).toHaveCount(0);
  await expect(page.locator(".document-merge-progress ol")).toHaveCount(0);
  await expect(page.getByText(/steps complete/)).toHaveCount(0);
  status = "running";
  for (const [next, done] of [
    ["parsing", 0],
    ["merging", 25],
    ["refreshing_toc", 50],
    ["persisting", 75],
  ] as const) {
    stage = next;
    await expect(progress).toHaveAttribute("value", String(done), {
      timeout: 5000,
    });
    await expect(page.getByText(`${done}%`, { exact: true })).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("Merging documents…");
  }
  await page.reload();
  await expect(progress).toHaveAttribute("value", "75");
  status = stage = "completed";
  await expect(progress).toHaveAttribute("value", "100", { timeout: 5000 });
  await expect(page.getByRole("link", { name: "Download DOCX" })).toBeVisible();
});
