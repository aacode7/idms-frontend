import { expect, test, type Page, type Route } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  assertPinnedPage,
  automaticLabelText,
  codePointSlice,
} from "../lib/extraction";
import {
  COLLECTION_GROUPS,
  type ExtractionRevision,
} from "../types/extractions";

const document = "11111111-1111-4111-8111-111111111111";
const version = "22222222-2222-4222-8222-222222222222";
const older = "33333333-3333-4333-8333-333333333333";
const revision = "44444444-4444-4444-8444-444444444444";
const oldRevision = "55555555-5555-4555-8555-555555555555";
const node = "node_" + "a".repeat(64);
const token = "token_" + "b".repeat(64);
const pin: ExtractionRevision = {
  analysisRevisionId: revision,
  projectId: "project",
  documentId: document,
  versionId: version,
  sourceHash: "a".repeat(64),
  extractionKey: "key",
  parserBuildId: "test-build",
  schemaVersion: "6",
  identityVersion: "1",
  profileId: "default",
  supportProfileVersion: "docx-recognition-v6",
  profileDigest: "profile",
  status: "completed",
  publicationStatus: "complete",
  coverageStatus: "complete_with_limitations",
  jobId: null,
  attemptCount: 1,
  retryAfter: null,
  retryable: false,
  errorCode: null,
  createdAt: "2026-11-12T00:00:00Z",
  completedAt: "2026-11-12T00:00:02Z",
  summary: {
    counts: { paragraphs: 30, mediaAssets: 1, imageOccurrences: 2 },
    collections: { headings: { recordCount: 30, shardCount: 2 } },
  },
};
const oldPin = {
  ...pin,
  analysisRevisionId: oldRevision,
  versionId: older,
  extractionKey: "old-key",
  sourceHash: "b".repeat(64),
};
const heading = {
  recordType: "heading",
  headingId: "heading_1",
  nodeId: node,
  authoredText: "<script>window.bad=1</script> {.} (,)",
  automaticLabel: "3.1",
  labelStatus: "resolved",
  headingLevel: 2,
  headingStatus: "resolved",
  isNavigationHeading: true,
  partName: "word/document.xml",
  storyId: "story_1",
  sourceLocator: { path: [1, 2] },
};
const versions = [
  {
    id: version,
    version_number: 2,
    is_latest: true,
    created_at: "2026-11-12",
    created_by: "test",
    description: "Current source",
  },
  {
    id: older,
    version_number: 1,
    is_latest: false,
    created_at: "2026-11-11",
    created_by: "test",
    description: "Older source",
  },
];
const pagePayload = (
  collection: string,
  items: unknown[] = [],
  current = pin,
  nextCursor: string | null = null,
) => ({
  analysisRevisionId: current.analysisRevisionId,
  versionId: current.versionId,
  sourceHash: current.sourceHash,
  coverageStatus: current.coverageStatus,
  collection,
  items,
  nextCursor,
});

type Handler = (route: Route, path: string, url: URL) => Promise<boolean>;
async function mock(page: Page, handler?: Handler) {
  const requests: string[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/v1", "");
    requests.push(path + url.search);
    if (handler && (await handler(route, path, url))) return;
    let payload: unknown;
    if (path === `/documents/${document}/versions`) payload = versions;
    else if (path === `/versions/${version}/extractions`)
      payload = { versionId: version, items: [pin] };
    else if (path === `/versions/${older}/extractions`)
      payload = { versionId: older, items: [oldPin] };
    else if (path === `/extractions/${revision}`) payload = pin;
    else if (path === `/extractions/${oldRevision}`) payload = oldPin;
    else if (path.endsWith("/profile"))
      payload = {
        analysisRevisionId: revision,
        versionId: version,
        profileId: "default",
        profileDigest: pin.profileDigest,
        profile: { recognition: { identifier_rules: [] } },
      };
    else if (path.startsWith("/extraction-profiles/"))
      payload = {
        profileId: "default",
        profileDigest: "current-profile",
        profile: { recognition: {} },
      };
    else if (path.endsWith("/outline"))
      payload = pagePayload(
        "headings",
        [
          {
            ...heading,
            authoredText: path.includes(oldRevision)
              ? "Older source heading"
              : heading.authoredText,
          },
        ],
        path.includes(oldRevision) ? oldPin : pin,
      );
    else if (path.includes("/collections/"))
      payload = pagePayload(path.split("/").at(-1)!);
    else if (path.endsWith("/nodes"))
      payload = pagePayload("nodes", [
        {
          recordType: "node",
          nodeId: node,
          kind: "paragraph",
          partName: "word/document.xml",
        },
      ]);
    else if (path.endsWith(`/nodes/${node}`))
      payload = {
        analysisRevisionId: revision,
        versionId: version,
        node: {
          recordType: "node",
          nodeId: node,
          kind: "run",
          partName: "word/document.xml",
        },
      };
    else {
      await route.fulfill({
        status: 404,
        json: { detail: "Unexpected fixture request" },
      });
      return;
    }
    await route.fulfill({ json: payload });
  });
  return requests;
}
async function open(page: Page) {
  await page.goto(
    `/documents/${document}/extraction?version=${version}&revision=${revision}`,
  );
  await expect(
    page.getByRole("heading", { name: "Selected extraction" }),
  ).toBeVisible();
}

test("code-point slicing preserves astral and combining characters; invalid spans fail", () => {
  expect(
    automaticLabelText({ automaticLabel: null, labelStatus: "not_numbered" }),
  ).toBe("Not numbered");
  expect(
    automaticLabelText({ automaticLabel: null, labelStatus: "cancelled" }),
  ).toBe("Numbering cancelled");
  expect(
    automaticLabelText({ automaticLabel: null, labelStatus: "unresolved" }),
  ).toBe("Unresolved");
  expect(codePointSlice("😀 {{name}} e\u0301", 2, 10)).toBe("{{name}}");
  expect(codePointSlice("😀e\u0301", 1, 3)).toBe("e\u0301");
  expect(() => codePointSlice("😀", 0, 2)).toThrow();
  expect(() => codePointSlice("x", -1, 1)).toThrow();
  expect(() =>
    assertPinnedPage(pagePayload("tokens", [], oldPin), pin, "tokens"),
  ).toThrow();
  const names = Object.values(COLLECTION_GROUPS).flat();
  expect(new Set(names).size).toBe(44);
});

test("pins identities, separates heading label/text, escapes markup, avoids eager media", async ({
  page,
}) => {
  const requests = await mock(page);
  await open(page);
  await expect(
    page.getByRole("heading", { name: heading.authoredText, exact: true }),
  ).toBeVisible();
  await expect(page.getByText("3.1", { exact: true })).toBeVisible();
  await expect(page.getByText(pin.sourceHash, { exact: true })).toBeVisible();
  await expect(
    page.getByText("complete_with_limitations", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as { bad?: number }).bad),
  ).toBeUndefined();
  expect(
    requests.some(
      (path) => path.includes("/media/") || path.includes("mediaAssets"),
    ),
  ).toBe(false);
});

test("paginates one page at a time and resets cursors on filter changes", async ({
  page,
}) => {
  const requests = await mock(page, async (route, path, url) => {
    if (!path.endsWith("/outline")) return false;
    const second = url.searchParams.get("cursor") === "next-bound-cursor";
    await route.fulfill({
      json: pagePayload(
        "headings",
        [
          {
            ...heading,
            authoredText: second ? "Second heading" : "First heading",
          },
        ],
        pin,
        second ? null : "next-bound-cursor",
      ),
    });
    return true;
  });
  await open(page);
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Second heading" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "First heading" }),
  ).toHaveCount(0);
  await page.getByLabel("Navigation headings only").uncheck();
  await expect(
    page.getByRole("heading", { name: "First heading" }),
  ).toBeVisible();
  expect(requests.at(-1)).toContain("navigation_only=false");
  expect(requests.at(-1)).not.toContain("cursor=");
});

test("changing version clears the prior revision and loads the selected historical source", async ({
  page,
}) => {
  await mock(page);
  await open(page);
  await expect(
    page.getByRole("heading", { name: heading.authoredText, exact: true }),
  ).toBeVisible();
  await page.getByLabel("Source version").selectOption(older);
  await expect(page).toHaveURL(
    new RegExp(`version=${older}&revision=${oldRevision}`),
  );
  await expect(
    page.getByRole("heading", { name: "Older source heading" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: heading.authoredText, exact: true }),
  ).toHaveCount(0);
});

test("rejects wrong-version status and wrong-revision collection responses", async ({
  page,
}) => {
  await mock(page, async (route, path) => {
    if (path === `/extractions/${revision}`) {
      await route.fulfill({ json: oldPin });
      return true;
    }
    return false;
  });
  await open(page);
  await expect(
    page.getByRole("alert").filter({ hasText: "does not belong" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Semantic outline" }),
  ).toHaveCount(0);
  await page.unrouteAll({ behavior: "wait" });
  await mock(page, async (route, path) => {
    if (path.endsWith("/outline")) {
      await route.fulfill({ json: pagePayload("headings", [heading], oldPin) });
      return true;
    }
    return false;
  });
  await page.reload();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "does not match the selected extraction" }),
  ).toBeVisible();
});

test("pending revisions expose retry/failure states without querying unpublished artifacts", async ({
  page,
}) => {
  let status = "retry_wait";
  const requests = await mock(page, async (route, path) => {
    if (path !== `/extractions/${revision}`) return false;
    await route.fulfill({
      json: {
        ...pin,
        status,
        publicationStatus: "unpublished",
        coverageStatus: null,
        retryAfter: "2026-11-12T00:00:10Z",
        errorCode: "storage_unavailable",
        retryable: status === "retry_wait",
      },
    });
    return true;
  });
  await open(page);
  await expect(page.getByText(/worker will retry automatically/)).toBeVisible();
  expect(
    requests.some((path) =>
      path.endsWith("/outline?limit=25&navigation_only=true"),
    ),
  ).toBe(false);
  status = "failed";
  await page.getByRole("button", { name: "Refresh status" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Extraction failed" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Outline", exact: true }),
  ).toHaveCount(0);
});

test("requests a server-approved profile against the exact selected version", async ({
  page,
}) => {
  let body: unknown;
  await mock(page, async (route, path) => {
    if (
      path === `/versions/${version}/extractions` &&
      route.request().method() === "POST"
    ) {
      body = route.request().postDataJSON();
      await route.fulfill({ status: 202, json: pin });
      return true;
    }
    return false;
  });
  await open(page);
  await page.getByLabel("Approved profile ID").fill("engineering-v2");
  await page
    .getByRole("button", { name: "Request extraction", exact: true })
    .click();
  await expect.poll(() => body).toEqual({ profile_id: "engineering-v2" });
});

test("run details use run filters and preserve exact token punctuation/whitespace", async ({
  page,
}) => {
  const requests = await mock(page, async (route, path) => {
    if (path.endsWith("/collections/tokens")) {
      await route.fulfill({
        json: pagePayload("tokens", [
          {
            recordType: "token",
            tokenId: token,
            nodeId: node,
            runId: node,
            kind: "text",
            channel: "authored",
            codePointLength: 19,
            value: "  😀 <x> {.} (,)\t\n ",
          },
        ]),
      });
      return true;
    }
    return false;
  });
  await open(page);
  await page.getByRole("button", { name: "Inspect node", exact: true }).click();
  await expect(
    page.getByLabel("Node evidence").locator(".ex-exact"),
  ).toHaveText("  😀 <x> {.} (,)\t\n ");
  expect(requests.some((path) => path.includes(`run_node_id=${node}`))).toBe(
    true,
  );
  await page
    .getByRole("button", { name: "Formatting evidence", exact: true })
    .click();
  await expect
    .poll(() =>
      requests.some((path) =>
        path.includes(`formatting?limit=25&record_id=${node}`),
      ),
    )
    .toBe(true);
});

test("recognition spans reconstruct exact source using code-point offsets", async ({
  page,
}) => {
  await mock(page, async (route, path) => {
    if (path.endsWith("/collections/identifierOccurrences")) {
      await route.fulfill({
        json: pagePayload("identifierOccurrences", [
          {
            recordType: "identifier_occurrence",
            semanticId: "occurrence",
            nodeId: node,
            details: {
              rawValue: "REQ-001",
              spans: [{ tokenId: token, runId: node, start: 2, end: 9 }],
            },
          },
        ]),
      });
      return true;
    }
    if (path.endsWith("/collections/tokens")) {
      await route.fulfill({
        json: pagePayload("tokens", [
          {
            recordType: "token",
            tokenId: token,
            runId: node,
            value: "😀 REQ-001",
          },
        ]),
      });
      return true;
    }
    return false;
  });
  await open(page);
  await page.getByRole("button", { name: "Identifiers", exact: true }).click();
  await page.getByRole("button", { name: "Inspect source spans (1)" }).click();
  await expect(page.locator(".ex-spans .ex-exact")).toHaveText("REQ-001");
  await expect(page.getByText(/Span text differs/)).toHaveCount(0);
});

test("verified media attachment is fetched only by an explicit action", async ({
  page,
}) => {
  let downloads = 0;
  await mock(page, async (route, path) => {
    if (path.endsWith("/collections/mediaAssets")) {
      await route.fulfill({
        json: pagePayload("mediaAssets", [
          {
            recordType: "media_asset",
            assetId: "asset_1",
            partName: "word/media/image.svg",
            byteCount: 20,
          },
        ]),
      });
      return true;
    }
    if (path.endsWith("/media/asset_1")) {
      downloads++;
      await route.fulfill({
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": 'attachment; filename="asset.bin"',
          "X-Content-Type-Options": "nosniff",
        },
        body: "x".repeat(20),
      });
      return true;
    }
    return false;
  });
  await open(page);
  await page.getByRole("button", { name: "Images and drawings" }).click();
  await expect(
    page.getByRole("button", { name: "Download original asset" }).first(),
  ).toBeVisible();
  expect(downloads).toBe(0);
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download original asset" })
    .first()
    .click();
  await download;
  expect(downloads).toBe(1);
  await expect(page.locator("img, iframe, object, embed")).toHaveCount(0);
});

test("remote corruption errors are actionable and retry the same pinned page", async ({
  page,
}) => {
  let broken = true;
  await mock(page, async (route, path) => {
    if (broken && path.endsWith("/outline")) {
      await route.fulfill({
        status: 502,
        json: { detail: "Published artifact could not be verified." },
      });
      return true;
    }
    return false;
  });
  await open(page);
  await expect(
    page.getByRole("alert").filter({ hasText: "could not be verified" }),
  ).toBeVisible();
  broken = false;
  await page.getByRole("button", { name: "Retry page" }).click();
  await expect(
    page.getByRole("heading", { name: heading.authoredText, exact: true }),
  ).toBeVisible();
});

test("tree child navigation and profile evidence remain within the pinned revision", async ({
  page,
}) => {
  const requests = await mock(page);
  await open(page);
  await page.getByRole("button", { name: "Content tree", exact: true }).click();
  await page
    .getByRole("button", { name: "Browse children", exact: true })
    .click();
  await expect
    .poll(() =>
      requests.some((path) => path.includes(`parent_node_id=${node}`)),
    )
    .toBe(true);
  await page
    .getByRole("button", { name: "Pinned profile", exact: true })
    .click();
  await page.getByRole("button", { name: "Show pinned profile JSON" }).click();
  await expect(page.locator("pre")).toContainText("identifier_rules");
  expect(
    requests.some((path) => path === `/extractions/${revision}/profile`),
  ).toBe(true);
});

test("mobile evidence layout stays within the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mock(page);
  await open(page);
  await expect(
    page.getByRole("heading", { name: heading.authoredText, exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        globalThis.document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/extraction-mobile.png",
    fullPage: true,
  });
});

test("large record pages keep previews and mounted DOM bounded", async ({
  page,
}) => {
  const started = Date.now();
  const large = "source text ".repeat(6000);
  await mock(page, async (route, path) => {
    if (!path.endsWith("/outline")) return false;
    await route.fulfill({
      json: pagePayload(
        "headings",
        Array.from({ length: 25 }, (_, i) => ({
          ...heading,
          headingId: `large-heading-${i}`,
          authoredText: `${i}: ${large}`,
        })),
      ),
    });
    return true;
  });
  await open(page);
  await expect(page.locator("article.ex-record")).toHaveCount(25);
  expect(
    await page.locator(".ex-record-title").first().textContent(),
  ).toHaveLength(1011);
  await expect(page.locator(".ex-json pre")).toHaveCount(0);
  const elapsed = (Date.now() - started) / 1000;
  expect(elapsed).toBeLessThan(5);
  console.log(
    "E9_BROWSER_METRICS " +
      JSON.stringify({
        elapsedSeconds: elapsed,
        mountedRecords: 25,
        approximateSourceTextBytes: large.length * 25,
        jsonPreviewsMounted: 0,
      }),
  );
});

test("failed asset responses show an error and do not save an error body", async ({
  page,
}) => {
  let downloads = 0;
  page.on("download", () => downloads++);
  await mock(page, async (route, path) => {
    if (path.endsWith("/collections/mediaAssets")) {
      await route.fulfill({
        json: pagePayload("mediaAssets", [
          { recordType: "media_asset", assetId: "asset_1", byteCount: 20 },
        ]),
      });
      return true;
    }
    if (path.endsWith("/media/asset_1")) {
      await route.fulfill({ status: 502, json: { detail: "unverified" } });
      return true;
    }
    return false;
  });
  await open(page);
  await page.getByRole("button", { name: "Images and drawings" }).click();
  await page.getByRole("button", { name: "Download original asset" }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "No unverified download was saved" }),
  ).toBeVisible();
  expect(downloads).toBe(0);
});

test("late old-revision page responses cannot replace the newly selected source", async ({
  page,
}) => {
  let release: (() => void) | undefined;
  await mock(page, async (route, path) => {
    if (path === `/extractions/${revision}/outline`) {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      await route
        .fulfill({ json: pagePayload("headings", [heading]) })
        .catch(() => {});
      return true;
    }
    return false;
  });
  await open(page);
  await expect.poll(() => Boolean(release)).toBe(true);
  await page.getByLabel("Source version").selectOption(older);
  await expect(
    page.getByRole("heading", { name: "Older source heading" }),
  ).toBeVisible();
  release!();
  await expect(
    page.getByRole("heading", { name: heading.authoredText, exact: true }),
  ).toHaveCount(0);
});

test("automatic status polling publishes records only after completion", async ({
  page,
}) => {
  let calls = 0;
  await mock(page, async (route, path) => {
    if (path !== `/extractions/${revision}`) return false;
    calls++;
    await route.fulfill({
      json:
        calls === 1
          ? {
              ...pin,
              status: "running",
              publicationStatus: "unpublished",
              coverageStatus: null,
            }
          : pin,
    });
    return true;
  });
  await open(page);
  await expect(page.getByText("running", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: heading.authoredText, exact: true }),
  ).toBeVisible({ timeout: 10000 });
  expect(calls).toBeGreaterThanOrEqual(2);
});

test("an unindexed version can be requested and invalid profile errors remain visible", async ({
  page,
}) => {
  await mock(page, async (route, path) => {
    if (path !== `/versions/${version}/extractions`) return false;
    if (route.request().method() === "POST")
      await route.fulfill({
        status: 422,
        json: { detail: "Profile is not approved on this server." },
      });
    else await route.fulfill({ json: { versionId: version, items: [] } });
    return true;
  });
  await page.goto(`/documents/${document}/extraction?version=${version}`);
  await expect(
    page.getByText(/No extraction exists for this exact version/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Request extraction", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Profile is not approved" }),
  ).toBeVisible();
});

test("live browser -> same-origin proxy -> API -> persisted actual-engine artifacts", async ({
  page,
}) => {
  test.skip(
    !process.env.IDMS_E8_RUNTIME_FILE,
    "Requires the explicit disposable runtime fixture.",
  );
  const live = JSON.parse(
    readFileSync(process.env.IDMS_E8_RUNTIME_FILE!, "utf8"),
  );
  await page.goto(
    `/documents/${live.documentId}/extraction?version=${live.versionId}&revision=${live.revisionId}`,
  );
  await expect(page.getByText(live.sourceHash, { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Inspection <sample> {.} (,)" }),
  ).toBeVisible();
  await expect(page.getByText("Not numbered", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Delimiters and placeholders" })
    .click();
  await expect(
    page.getByRole("heading", { name: "{{name}}", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Inspect source spans (2)" }).click();
  await expect(page.locator(".ex-spans .ex-exact").first()).toHaveText(
    "{{name}}",
  );
  await page.getByRole("button", { name: "Images and drawings" }).click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download original asset" })
    .first()
    .click();
  await download;
  await page.getByRole("button", { name: "TOC and fields" }).click();
  await expect(
    page.getByText(/Saved field\/TOC results/).first(),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/extraction-live.png",
    fullPage: true,
  });
});
