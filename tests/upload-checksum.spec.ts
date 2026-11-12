import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";

for (const fallback of [false, true]) {
  for (const size of [0, 3, 1024 * 1024 + 17]) {
    test(`upload checksum ${fallback ? "without" : "with"} Web Crypto, ${size} bytes`, async ({
      page,
    }) => {
      if (fallback)
        await page.addInitScript(() => {
          Object.defineProperty(globalThis.crypto, "subtle", {
            value: undefined,
            configurable: true,
          });
        });
      const bytes = size === 3 ? Buffer.from("abc") : Buffer.alloc(size, 0xa5);
      const expected = createHash("sha256").update(bytes).digest("hex");
      let checksum = "";
      await page.route("**/api/v1/**", async (route) => {
        const path = new URL(route.request().url()).pathname;
        let body: unknown;
        if (path.endsWith("/documents/uploads")) {
          checksum = route.request().postDataJSON().checksum_sha256;
          body = {
            document_id: "document",
            version_id: "version",
            object_key: "test",
            upload_url: "http://127.0.0.1:3138/checksum-storage",
            expires_in_seconds: 900,
          };
        } else if (path.endsWith("/uploads/complete")) {
          body = {
            id: "document",
            project_id: "project",
            filename: "checksum.docx",
            size_bytes: size,
            role: "source",
            status: "uploaded",
            analysis_status: "completed",
            version_id: "version",
            created_at: "2026-11-12",
          };
        } else if (path.endsWith("/documents")) body = [];
        else
          body = {
            id: "project",
            name: "Checksum check",
            description: null,
            document_count: 0,
            created_at: "2026-11-12",
            updated_at: "2026-11-12",
          };
        await route.fulfill({ json: body });
      });
      await page.route("**/checksum-storage", (route) =>
        route.fulfill({ status: 200, body: "" }),
      );
      await page.goto("/projects/project");
      await page.locator('input[type="file"]').setInputFiles({
        name: "checksum.docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        buffer: bytes,
      });
      await expect.poll(() => checksum).toBe(expected);
      await expect(
        page.getByText("checksum.docx", { exact: true }),
      ).toBeVisible();
      await expect(page.getByText(/Upload did not finish/)).toHaveCount(0);
    });
  }
}

test("workspace keeps polling deep extraction after basic analysis completes", async ({
  page,
}) => {
  let stage = "validating";
  let status = "running";
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith("/documents")
      ? [
          {
            id: "document",
            project_id: "project",
            filename: "synthetic.docx",
            size_bytes: 1024,
            role: "source",
            status: "uploaded",
            analysis_status: "completed",
            extraction_status: status,
            extraction_stage: stage,
            extraction_validated_records: 100,
            extraction_total_records: 1000,
            version_id: "version",
            created_at: "2026-11-12",
          },
        ]
      : {
          id: "project",
          name: "Progress check",
          description: null,
          document_count: 1,
          created_at: "2026-11-12",
          updated_at: "2026-11-12",
        };
    await route.fulfill({ json: body });
  });
  await page.goto("/projects/project");
  await expect(
    page.getByText("Validating extraction: 100 / 1,000 records"),
  ).toBeVisible();
  stage = "publishing";
  await expect(page.getByText("Publishing extraction indexes…")).toBeVisible();
  status = "completed";
  await expect(
    page.getByText("Analysis and deep extraction complete"),
  ).toBeVisible();
  await expect(page.getByText(/Processing 1 document/)).toHaveCount(0);
});

test("database capacity failure blocks composition and explains why", async ({
  page,
}) => {
  await page.route("**/api/v1/**", async (route) => {
    const documents = new URL(route.request().url()).pathname.endsWith(
      "/documents",
    );
    await route.fulfill({
      json: documents
        ? [
            {
              id: "document",
              project_id: "project",
              filename: "synthetic.docx",
              size_bytes: 1024,
              role: "master",
              status: "uploaded",
              analysis_status: "completed",
              extraction_status: "failed",
              extraction_error_code: "database_capacity_exceeded",
              version_id: "version",
              created_at: "2026-11-12",
            },
          ]
        : {
            id: "project",
            name: "Capacity check",
            document_count: 1,
            created_at: "2026-11-12",
            updated_at: "2026-11-12",
          },
    });
  });
  await page.goto("/projects/project");
  await expect(
    page.getByText(
      "Extraction could not be saved: database storage capacity reached",
    ),
  ).toBeVisible();
  await expect(page.getByText("Open merge workspace")).toHaveCount(0);
  await expect(
    page.getByText("All documents are analyzed and ready to compose."),
  ).toHaveCount(0);
});
