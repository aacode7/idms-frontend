import { test, expect } from '@playwright/test';

test('TOC refresh waits for an acknowledged editor operation and reports failure honestly', async ({ page }) => {
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({ json: path.endsWith('/editor-session') ? {
      session_id: 'toc-session', documentServerUrl: '/onlyoffice',
      document: { title: 'Synthetic merged document.docx' }, editorConfig: {},
    } : { status: 'active' } });
  });
  await page.route('**/onlyoffice/web-apps/apps/api/documents/api.js', async route => {
    await route.fulfill({ contentType: 'application/javascript', body: `
      window.DocsAPI={DocEditor:function(id,config){
        var iframe=document.createElement('iframe');iframe.id='fake-toc-plugin';
        iframe.srcdoc='<script>window.addEventListener("message",function(e){if(e.data.type==="idms-toc-update")window.pending=e.data;if(e.data.type==="test-result"&&window.pending)window.top.postMessage({type:"idms-toc-result",sessionId:"toc-session",requestId:window.pending.requestId,ok:e.data.ok},parent.location.origin)});setTimeout(function(){window.top.postMessage({type:"idms-toc-ready",sessionId:"toc-session"},parent.location.origin)},100);<\\/script>';
        document.getElementById(id).appendChild(iframe);
        setTimeout(function(){config.events.onDocumentReady()},20);
        this.executeCommand=function(){throw new Error('Unsupported API must not be called')};
      }};
    ` });
  });
  await page.goto('/documents/doc/versions/version/edit');
  const button=page.getByRole('button',{name:'Update TOC',exact:true});
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.getByRole('button',{name:'Updating TOC…',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Save',exact:true})).toBeDisabled();
  await expect(page.getByText(/Table of contents refreshed, including/)).toHaveCount(0);
  await page.locator('#fake-toc-plugin').evaluate((frame: HTMLIFrameElement)=>frame.contentWindow!.postMessage({type:'test-result',ok:true},location.origin));
  await expect(page.getByText(/Table of contents refreshed, including titles/)).toBeVisible();
  await button.click();
  await page.locator('#fake-toc-plugin').evaluate((frame: HTMLIFrameElement)=>frame.contentWindow!.postMessage({type:'test-result',ok:false},location.origin));
  await expect(page.getByText(/could not confirm the TOC update/)).toBeVisible();
});
