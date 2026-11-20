import { test, expect } from "@playwright/test";

test("saved fields are marked and navigable in view mode without reopening the document", async ({ page }) => {
  let sessions = 0;
  await page.route("**/api/v1/**", async route => {
    if (!route.request().url().endsWith("/editor-session")) {
      await route.fulfill({ json: { status: "active" } });
      return;
    }
    sessions++;
    await route.fulfill({ json: {
      session_id: "fields-session", documentServerUrl: "/onlyoffice", edit_policy: "placeholders",
      document: { title: "Merged document.docx" }, editorConfig: { mode: route.request().postDataJSON().mode },
      placeholder_fields: 3, placeholders_skipped: [],
      placeholder_items: [
        { index: 0, tag: "idms-ph-0", part: "body", label: "Client", value: "Client", changed: false },
        { index: 1, tag: "idms-ph-1", part: "body", label: "Document No", value: "DOC-123", changed: true },
        { index: 2, tag: "idms-ph-2", part: "body", label: "Revision", value: "Revision", changed: false },
      ],
    } });
  });
  await page.route("**/onlyoffice/web-apps/apps/api/documents/api.js", route => route.fulfill({
    contentType: "application/javascript", body: `
      window.DocsAPI={DocEditor:function(id,config){
        if(window.activeEditor)throw new Error('Previous editor was not destroyed');
        window.activeEditor=true;
        var iframe=document.createElement('iframe');iframe.id='fake-field-plugin';
        iframe.srcdoc='<script>window.addEventListener("message",function(e){if(e.data.type!=="idms-field-select")return;window.selected=e.data.tag;window.top.postMessage({type:"idms-field-result",sessionId:"fields-session",requestId:e.data.requestId,tag:e.data.tag,ok:true},parent.location.origin)});setTimeout(function(){window.top.postMessage({type:"idms-fields-ready",sessionId:"fields-session"},parent.location.origin)},100);<\\/script>';
        document.getElementById(id).appendChild(iframe);
        setTimeout(function(){config.events.onDocumentReady()},20);
        this.destroyEditor=function(){iframe.remove();window.activeEditor=false;window.editorDestroys=(window.editorDestroys||0)+1};
      }};
    `,
  }));
  await page.goto("/documents/doc/versions/version/edit?mode=view");
  await expect(page.getByText("Changed from original (1)", { exact: true })).toBeVisible();
  const selector = page.getByRole("combobox", { name: "Go to field" });
  const status = page.getByRole("region", { name: "Document field navigation" }).getByRole("status");
  await expect(selector).toHaveValue("idms-ph-1");
  await expect(status).toHaveText("Changed field: Document No");
  // A focused field near the editor's bottom must still be on screen when
  // the toolbar wraps or the viewport is resized.
  for (const size of [{ width: 1280, height: 720 }, { width: 1000, height: 800 }]) {
    await page.setViewportSize(size);
    const frame = page.locator('.editor-frame');
    await expect(frame).toBeVisible();
    await expect.poll(async () => {
      const bounds = await frame.boundingBox();
      return bounds ? bounds.y + bounds.height : Infinity;
    }).toBeLessThanOrEqual(size.height);
  }
  await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Download clean DOCX", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next field", exact: true }).click();
  await expect(selector).toHaveValue("idms-ph-2");
  await expect(status).toHaveText("Field: Revision");
  await page.getByRole("checkbox", { name: "Changed fields only" }).check();
  await expect(selector.locator("option")).toHaveCount(2);
  await selector.selectOption("idms-ph-1");
  await expect(status).toHaveText("Changed field: Document No");
  expect(sessions).toBe(1);
  await page.evaluate(() => window.history.pushState(null, "", "?mode=edit"));
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();
  await expect(selector).toHaveValue("idms-ph-1");
  expect(sessions).toBe(2);
  expect(await page.evaluate(() => (window as typeof window & { editorDestroys: number }).editorDestroys)).toBe(1);
});
