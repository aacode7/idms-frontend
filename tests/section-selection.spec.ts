import { test, expect } from "@playwright/test";

async function prepare(page: import("@playwright/test").Page) {
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
  const n = (
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
    const body = path.endsWith("/documents")
      ? [doc("master", "master"), doc("source", "source")]
      : path.endsWith("/master/outline")
        ? [n("target", "1 Introduction", 1, 0, 12, null)]
        : path.endsWith("/source/outline")
          ? [
              n("root", "2 Reference Documents", 1, 0, 12, null),
              n("child-a", "2.1 Included documents", 2, 2, 7, "root"),
              n("grandchild", "2.1.1 Nested specification", 3, 4, 7, "child-a"),
              n("child-b", "2.2 Other documents", 2, 8, 12, "root"),
              n("other", "3 Other chapter", 1, 13, 18, null),
            ]
          : path.endsWith("/merge-preview")
            ? { warnings: [], diagnostics: [] }
            : [];
    await route.fulfill({ json: body });
  });
  await page.goto("/projects/project/merge");
  await page.getByRole("button", { name: /source.docx/ }).click();
}

test("parent selection includes descendants, exclusions reach the API and survive moving the insertion", async ({
  page,
}) => {
  await prepare(page);
  const root = page.getByRole("checkbox", {
    name: "Include 2 Reference Documents",
    exact: true,
  });
  const childA = page.getByRole("checkbox", {
    name: "Include 2.1 Included documents",
    exact: true,
  });
  const childB = page.getByRole("checkbox", {
    name: "Include 2.2 Other documents",
    exact: true,
  });
  const grandchild = page.getByRole("checkbox", {
    name: "Include 2.1.1 Nested specification",
    exact: true,
  });
  await root.check();
  await expect(childA).toBeChecked();
  await expect(childB).toBeChecked();
  await expect(grandchild).toBeChecked();
  await childB.uncheck();
  await grandchild.uncheck();
  await expect(root).toBeChecked();
  expect(
    await root.evaluate((input: HTMLInputElement) => input.indeterminate),
  ).toBe(false);
  await expect(
    page.locator(".source-node").filter({ has: root }),
  ).toContainText("Partial selection");
  // Bulk inclusion is explicit; the checkbox reflects the parent itself.
  await page
    .getByLabel("Content scope for 2 Reference Documents", { exact: true })
    .selectOption("subtree");
  await expect(root).toBeChecked();
  await expect(childB).toBeChecked();
  await expect(grandchild).toBeChecked();
  await childB.uncheck();
  await grandchild.uncheck();
  await expect(root).toBeChecked();
  await page.locator(".master-node").click();
  const plan = page.locator(".plan-row");
  await expect(plan).toHaveCount(1);
  await plan.getByText(/2 included sections/).click();
  await expect(plan).toContainText(
    "Excluded: 2.1.1 Nested specification; 2.2 Other documents",
  );
  const requested = page.waitForRequest((r) =>
    r.url().endsWith("/merge-preview"),
  );
  await page.getByRole("button", { name: "Check compatibility" }).click();
  const operation = (await requested).postDataJSON().operations[0];
  expect(operation.included_sections).toEqual([
    { node_key: "root", content: "section" },
    { node_key: "child-a", content: "section" },
  ]);
  await page
    .getByRole("button", { name: "Place 2 Reference Documents", exact: true })
    .click();
  await expect(childB).not.toBeChecked();
  await expect(grandchild).not.toBeChecked();
  await page.locator(".master-node").click();
  await expect(plan).toHaveCount(1);
  await childA.uncheck();
  await expect(grandchild).not.toBeChecked();
  await grandchild.check();
  await expect(
    page.getByLabel("Content scope for 2.1 Included documents", {
      exact: true,
    }),
  ).toHaveValue("custom");
  await expect(childA).not.toBeChecked();
  await expect(grandchild).toBeChecked();
  const updated = page.waitForRequest((r) =>
    r.url().endsWith("/merge-preview"),
  );
  await page.getByRole("button", { name: "Check compatibility" }).click();
  const updatedOperations = (await updated).postDataJSON().operations;
  expect(
    updatedOperations.map(
      (op: { source_node_key: string }) => op.source_node_key,
    ),
  ).toEqual(["root", "grandchild"]);
  expect(
    updatedOperations.flatMap(
      (op: { included_sections: unknown[] }) => op.included_sections,
    ),
  ).not.toContainEqual({ node_key: "child-a", content: "section" });
  await page
    .getByLabel("Content scope for 2 Reference Documents", { exact: true })
    .selectOption("exclude");
  await expect(plan).toHaveCount(0);
  await expect(childA).not.toBeChecked();
  await expect(grandchild).not.toBeChecked();
});

for (const placed of [false, true]) {
  test(`unchecking a ${placed ? "placed" : "pending"} parent keeps children and omits its heading and body from the request`, async ({
    page,
  }) => {
    await prepare(page);
    const root = page.getByRole("checkbox", {
      name: "Include 2 Reference Documents",
      exact: true,
    });
    const childA = page.getByRole("checkbox", {
      name: "Include 2.1 Included documents",
      exact: true,
    });
    const grandchild = page.getByRole("checkbox", {
      name: "Include 2.1.1 Nested specification",
      exact: true,
    });
    const childB = page.getByRole("checkbox", {
      name: "Include 2.2 Other documents",
      exact: true,
    });
    await root.check();
    if (placed) await page.locator(".master-node").click();
    await root.uncheck();
    await expect(root).not.toBeChecked();
    await expect(childA).toBeChecked();
    await expect(grandchild).toBeChecked();
    await expect(childB).toBeChecked();
    if (!placed)
      await page
        .getByRole("button", {
          name: "Place 2 Reference Documents",
          exact: true,
        })
        .dragTo(page.locator(".master-node"));
    await expect(page.locator(".plan-row")).toHaveCount(2);
    const requested = page.waitForRequest((r) =>
      r.url().endsWith("/merge-preview"),
    );
    await page.getByRole("button", { name: "Check compatibility" }).click();
    const operations = (await requested).postDataJSON().operations;
    expect(
      operations.map((op: { source_node_key: string }) => op.source_node_key),
    ).toEqual(["child-a", "child-b"]);
    expect(
      operations.map(
        (op: { included_sections: unknown[] }) => op.included_sections,
      ),
    ).toEqual([
      [
        { node_key: "child-a", content: "section" },
        { node_key: "grandchild", content: "section" },
      ],
      [{ node_key: "child-b", content: "section" }],
    ]);
    await childA.uncheck();
    await expect(childA).not.toBeChecked();
    await expect(grandchild).toBeChecked();
    const updated = page.waitForRequest((r) =>
      r.url().endsWith("/merge-preview"),
    );
    await page.getByRole("button", { name: "Check compatibility" }).click();
    expect(
      (await updated)
        .postDataJSON()
        .operations.map(
          (op: { source_node_key: string }) => op.source_node_key,
        ),
    ).toEqual(["grandchild", "child-b"]);
  });
}

test("the insertion plan shows checked children and grandchildren as a visible nested hierarchy", async ({
  page,
}) => {
  await prepare(page);
  await page
    .getByRole("checkbox", {
      name: "Include 2 Reference Documents",
      exact: true,
    })
    .check();
  await page
    .getByRole("checkbox", { name: "Include 2.2 Other documents", exact: true })
    .uncheck();
  await page.locator(".master-node").click();
  const tree = page.getByRole("list", {
    name: "Included section hierarchy",
    exact: true,
  });
  await expect(tree).toBeVisible();
  await expect(tree.locator(":scope > li")).toHaveCount(1);
  await expect(
    tree.locator('li[data-node-key="root"] > ul > li[data-node-key="child-a"]'),
  ).toBeVisible();
  await expect(
    tree.locator(
      'li[data-node-key="child-a"] > ul > li[data-node-key="grandchild"]',
    ),
  ).toBeVisible();
  await expect(tree).not.toContainText("Other documents");
  await expect(page.locator(".plan-row")).toContainText(
    "Excluded: 2.2 Other documents",
  );
  await page
    .getByRole("checkbox", {
      name: "Include 2.1 Included documents",
      exact: true,
    })
    .uncheck();
  await expect(
    page.locator('.section-hierarchy li[data-node-key="child-a"]'),
  ).toHaveCount(0);
  await expect(
    page.locator('.section-hierarchy > li[data-node-key="grandchild"]'),
  ).toBeVisible();
});

test("individually checked descendants accumulate without restoring unchecked ancestors", async ({
  page,
}) => {
  await prepare(page);
  await page
    .getByRole("checkbox", {
      name: "Include 2.1.1 Nested specification",
      exact: true,
    })
    .check();
  await page
    .getByRole("checkbox", { name: "Include 2.2 Other documents", exact: true })
    .check();
  await expect(
    page.getByRole("checkbox", {
      name: "Include 2.1.1 Nested specification",
      exact: true,
    }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", {
      name: "Include 2 Reference Documents",
      exact: true,
    }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("checkbox", {
      name: "Include 2.1 Included documents",
      exact: true,
    }),
  ).not.toBeChecked();
  await page.locator(".master-node").click();
  const requested = page.waitForRequest((r) =>
    r.url().endsWith("/merge-preview"),
  );
  await page.getByRole("button", { name: "Check compatibility" }).click();
  const operations = (await requested).postDataJSON().operations;
  expect(
    operations.map((op: { source_node_key: string }) => op.source_node_key),
  ).toEqual(["grandchild", "child-b"]);
  expect(
    operations
      .flatMap(
        (op: { included_sections: { node_key: string }[] }) =>
          op.included_sections,
      )
      .map((c: { node_key: string }) => c.node_key),
  ).toEqual(["grandchild", "child-b"]);
});

for (const [key, title] of [
  ["child-b", "2.2 Other documents"],
  ["grandchild", "2.1.1 Nested specification"],
  ["other", "3 Other chapter"],
] as const) {
  test(`leaf ${title} includes its content without separate heading controls`, async ({
    page,
  }) => {
    await prepare(page);
    const checkbox = page.getByRole("checkbox", {
      name: `Include ${title}`,
      exact: true,
    });
    const row = page.locator(".source-node").filter({ has: checkbox });
    await checkbox.check();
    await expect(row.getByRole("combobox")).toHaveCount(0);
    await expect(row).toContainText("Section selected · No child sections");
    await expect(row).not.toContainText("1/1 sections included");
    const ancestorTitles =
      key === "other"
        ? []
        : key === "grandchild"
          ? ["2 Reference Documents", "2.1 Included documents"]
          : ["2 Reference Documents"];
    for (const ancestorTitle of ancestorTitles) {
      const ancestor = page.getByRole("checkbox", {
        name: `Include ${ancestorTitle}`,
        exact: true,
      });
      await expect(ancestor).not.toBeChecked();
      expect(
        await ancestor.evaluate(
          (input: HTMLInputElement) => input.indeterminate,
        ),
      ).toBe(false);
      const ancestorRow = page
        .locator(".source-node")
        .filter({ has: ancestor });
      await expect(ancestorRow).toContainText(
        "Not selected · 1 child section selected",
      );
      await expect(ancestorRow.getByRole("combobox")).toHaveValue("custom");
    }
    await page.locator(".master-node").click();
    await expect(row.getByRole("button", { name: /Heading only/ })).toHaveCount(
      0,
    );
    const requested = page.waitForRequest((r) =>
      r.url().endsWith("/merge-preview"),
    );
    await page.getByRole("button", { name: "Check compatibility" }).click();
    expect(
      (await requested).postDataJSON().operations[0].included_sections,
    ).toEqual([{ node_key: key, content: "section" }]);
    expect((await requested).postDataJSON().operations[0].source_node_key).toBe(
      key,
    );
    await checkbox.uncheck();
    await expect(page.locator(".plan-row")).toHaveCount(0);
  });
}

for (const scope of ["section"] as const) {
  test(`${scope} only excludes descendants and sends the exact scope`, async ({
    page,
  }) => {
    await prepare(page);
    await page
      .getByRole("checkbox", {
        name: "Include 2 Reference Documents",
        exact: true,
      })
      .check();
    const scopeMenu = page.getByLabel(
      "Content scope for 2 Reference Documents",
      { exact: true },
    );
    await expect(scopeMenu.locator('option[value="heading"]')).toHaveCount(0);
    await scopeMenu.selectOption(scope);
    await expect(
      page.getByRole("checkbox", {
        name: "Include 2.1 Included documents",
        exact: true,
      }),
    ).not.toBeChecked();
    await expect(
      page.getByLabel("Content scope for 2 Reference Documents", {
        exact: true,
      }),
    ).toBeVisible();
    await page.locator(".master-node").click();
    const requested = page.waitForRequest((r) =>
      r.url().endsWith("/merge-preview"),
    );
    await page.getByRole("button", { name: "Check compatibility" }).click();
    expect(
      (await requested).postDataJSON().operations[0].included_sections,
    ).toEqual([{ node_key: "root", content: scope }]);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test("selecting a parent consolidates previously placed children without duplicate content", async ({
  page,
}) => {
  await prepare(page);
  await page
    .getByRole("checkbox", {
      name: "Include 2.1 Included documents",
      exact: true,
    })
    .check();
  await page.locator(".master-node").click();
  await page
    .getByRole("checkbox", {
      name: "Include 2 Reference Documents",
      exact: true,
    })
    .check();
  await page
    .getByRole("checkbox", { name: "Include 2.2 Other documents", exact: true })
    .uncheck();
  await page.locator(".master-node").click();
  await expect(page.locator(".plan-row")).toHaveCount(1);
  const requested = page.waitForRequest((r) =>
    r.url().endsWith("/merge-preview"),
  );
  await page.getByRole("button", { name: "Check compatibility" }).click();
  expect((await requested).postDataJSON().operations).toHaveLength(1);
});

test("dragging a child separately preserves exclusions and removes it from the parent insertion", async ({
  page,
}) => {
  await prepare(page);
  await page
    .getByRole("checkbox", {
      name: "Include 2 Reference Documents",
      exact: true,
    })
    .check();
  await page.locator(".master-node").click();
  await page
    .getByRole("checkbox", {
      name: "Include 2.1.1 Nested specification",
      exact: true,
    })
    .uncheck();
  await page
    .getByRole("button", { name: "Place 2.1 Included documents", exact: true })
    .dragTo(
      page
        .locator(".master-drop-zone")
        .filter({ hasText: "Drop after 1 Introduction" }),
    );
  await expect(page.locator(".plan-row")).toHaveCount(2);
  const requested = page.waitForRequest((r) =>
    r.url().endsWith("/merge-preview"),
  );
  await page.getByRole("button", { name: "Check compatibility" }).click();
  const operations = (await requested).postDataJSON().operations;
  expect(operations[0].included_sections).toEqual([
    { node_key: "root", content: "section" },
    { node_key: "child-b", content: "section" },
  ]);
  expect(operations[1].included_sections).toEqual([
    { node_key: "child-a", content: "section" },
  ]);
});

test("dragging a section title onto a master heading inserts only that section after it", async ({
  page,
}) => {
  await prepare(page);
  await page
    .locator(".source-node strong")
    .filter({ hasText: /^2\.2 Other documents$/ })
    .dragTo(page.locator(".master-node"));
  await expect(page.locator(".plan-row")).toHaveCount(1);
  const requested = page.waitForRequest((r) =>
    r.url().endsWith("/merge-preview"),
  );
  await page.getByRole("button", { name: "Check compatibility" }).click();
  expect((await requested).postDataJSON().operations).toEqual([
    expect.objectContaining({
      source_node_key: "child-b",
      destination_node_key: "target",
      position: "after",
      included_sections: [{ node_key: "child-b", content: "section" }],
    }),
  ]);
});

test("TOC refresh failures identify the failed step and retain the insertion plan", async ({
  page,
}) => {
  await prepare(page);
  await page.route("**/merge-jobs", (route) =>
    route.fulfill({ json: { id: "toc-job" } }),
  );
  await page.route("**/jobs/toc-job", (route) =>
    route.fulfill({
      json: {
        id: "toc-job",
        status: "failed",
        stage: "failed",
        error_code: "merge_toc_refresh_failed",
      },
    }),
  );
  await page
    .getByRole("checkbox", { name: "Include 2.2 Other documents", exact: true })
    .check();
  await page.locator(".master-node").click();
  await page
    .getByRole("button", { name: "Create merge (1)", exact: true })
    .click();
  await expect(
    page.getByText(
      "Merge stopped while updating the table of contents and verifying its page numbers. No new version was saved.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.locator(".plan-row")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Create merge (1)", exact: true }),
  ).toBeEnabled();
});

test("dragging a selected section row to a before gap preserves excluded children", async ({
  page,
}) => {
  await prepare(page);
  await page
    .getByRole("checkbox", {
      name: "Include 2 Reference Documents",
      exact: true,
    })
    .check();
  await page
    .getByRole("checkbox", { name: "Include 2.2 Other documents", exact: true })
    .uncheck();
  const root = page.locator(".source-node").filter({
    has: page.getByRole("checkbox", {
      name: "Include 2 Reference Documents",
      exact: true,
    }),
  });
  await root.dragTo(
    page
      .locator(".master-drop-zone")
      .filter({ hasText: "Drop before 1 Introduction" }),
    { sourcePosition: { x: 5, y: 5 } },
  );
  await expect(page.locator(".plan-row")).toHaveCount(1);
  const requested = page.waitForRequest((r) =>
    r.url().endsWith("/merge-preview"),
  );
  await page.getByRole("button", { name: "Check compatibility" }).click();
  expect((await requested).postDataJSON().operations[0]).toEqual(
    expect.objectContaining({
      source_node_key: "root",
      destination_node_key: "target",
      position: "before",
      included_sections: [
        { node_key: "root", content: "section" },
        { node_key: "child-a", content: "section" },
        { node_key: "grandchild", content: "section" },
      ],
    }),
  );
});
