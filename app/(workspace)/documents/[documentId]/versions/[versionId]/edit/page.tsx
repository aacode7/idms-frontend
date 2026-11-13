"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

const api =
  process.env.NEXT_PUBLIC_IDMS_API_URL ?? "http://localhost:8000/api/v1";

declare global {
  interface Window {
    DocsAPI?: { DocEditor: new (id: string, config: object) => unknown };
  }
}

// ONLYOFFICE's API script is large and is shared by every editor view. Keep a
// single in-flight/completed load so navigating between anchors does not fetch
// or execute it again.
const editorApiLoads = new Map<string, Promise<void>>();

function loadEditorApi(documentServerUrl: string) {
  const scriptUrl = `${documentServerUrl.replace(/\/$/, "")}/web-apps/apps/api/documents/api.js`;
  const existing = editorApiLoads.get(scriptUrl);
  if (existing) return existing;

  const promise = new Promise<void>((resolve, reject) => {
    const current = document.querySelector<HTMLScriptElement>(
      `script[src="${scriptUrl}"]`,
    );
    if (current?.dataset.loaded === "true") {
      resolve();
      return;
    }
    const script = current ?? document.createElement("script");
    script.async = true;
    script.src = scriptUrl;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error("ONLYOFFICE API failed to load"));
    if (!current) document.head.appendChild(script);
  });
  editorApiLoads.set(scriptUrl, promise);
  return promise;
}

function warmEditorConnection(documentServerUrl: string) {
  try {
    const url = new URL(documentServerUrl, window.location.href);
    if (
      document.head.querySelector(
        `link[rel="preconnect"][href="${url.origin}"]`,
      )
    )
      return;
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = url.origin;
    document.head.appendChild(link);
  } catch {
    // The API request below will still provide the normal error message.
  }
}

export default function EditorPage() {
  const { documentId, versionId } = useParams<{
    documentId: string;
    versionId: string;
  }>();
  const query = useSearchParams();
  const holder = useRef<HTMLDivElement>(null);
  const tocBridge = useRef<Window | null>(null);
  const tocPending = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const [tocReady, setTocReady] = useState(false);
  const [tocUpdating, setTocUpdating] = useState(false);
  const sessionRef = useRef("");
  const returnAfterSaveRef = useRef(false);
  const [message, setMessage] = useState("Preparing document editor…");
  const [changeSummary, setChangeSummary] = useState(
    query.get("description") || "",
  );
  const [mergedDocumentName, setMergedDocumentName] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedVersionId, setSavedVersionId] = useState("");
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const mergeAnchors = (query.get("anchors") || query.get("anchor") || "")
    .split(",")
    .filter(Boolean);
  const activeAnchor = query.get("anchor") || mergeAnchors[0] || "";
  const activeAnchorIndex = Math.max(0, mergeAnchors.indexOf(activeAnchor));
  const mode = query.get("mode") === "view" ? "view" : "edit";
  const isInitialMerge = query.get("initialMerge") === "1";
  const mergeWorkspaceReturnTo = query.get("returnTo");
  const returnTo =
    mergeWorkspaceReturnTo || `/documents/${documentId}/versions`;

  useEffect(() => {
    let sessionId = "";
    let timer: ReturnType<typeof setInterval> | undefined;
    async function start() {
      const response = await fetch(
        `${api}/versions/${versionId}/editor-session`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode,
            expected_latest_version_id: query.get("expected") || undefined,
            description: query.get("description") || undefined,
            created_by: query.get("actor") || undefined,
          }),
        },
      );
      if (!response.ok) throw new Error(await response.text());
      const config = await response.json();
      setMergedDocumentName(config.document?.title || "");
      sessionId = config.session_id;
      sessionRef.current = sessionId;
      warmEditorConnection(config.documentServerUrl);
      loadEditorApi(config.documentServerUrl)
        .then(() => {
          if (window.DocsAPI && holder.current) {
            const anchor = query.get("anchor");
            config.editorConfig = {
              ...config.editorConfig,
              ...(anchor
                ? {
                    actionLink: {
                      action: { type: "bookmark", data: anchor },
                    },
                  }
                : {}),
              customization: {
                ...config.editorConfig.customization,
                logo: {
                  ...config.editorConfig.customization?.logo,
                  visible: false,
                },
              },
            };
            const editor = new window.DocsAPI.DocEditor("onlyoffice-editor", {
              ...config,
              events: {
                ...config.events,
                onDocumentReady: () => {
                  setMessage("Document ready. Use Update TOC to refresh entries and pagination before saving.");
                },
              },
              width: "100%",
              // ONLYOFFICE otherwise falls back to its 150px default iframe height.
              // Give its API a concrete viewport-based height, not just CSS on its host.
              height: `${Math.max(window.innerHeight - 122, 640)}px`,
            });
            setMessage(
              anchor
                ? "Opening the merged section bookmark in the document editor. Use Save to create a new immutable version."
                : mode === "view"
                  ? "Read-only version view."
                  : "Use the editor Save button. IDMS will create the next immutable version automatically.",
            );
          }
        })
        .catch(() => setMessage("The document editor could not be loaded."));
      if (mode === "edit")
        timer = setInterval(async () => {
          const state = await fetch(`${api}/editor-sessions/${sessionId}`).then(
            (item) => item.json(),
          );
          if (state.status === "saved") {
            setSavedVersionId(state.saved_version_id || "");
            setSaving(false);
            setMessage(
              "Saved as a new immutable version. Your edit note is now shown in version history.",
            );
            clearInterval(timer);
            if (returnAfterSaveRef.current) window.location.assign(returnTo);
          }
          if (state.status === "conflict") {
            setSaving(false);
            setMessage(
              state.conflict_message ||
                "A newer version exists. Reload and compare before saving.",
            );
            clearInterval(timer);
          }
        }, 4000);
    }
    start().catch(() =>
      setMessage(
        "Editor could not be started. A newer version may exist; return to history and reload.",
      ),
    );
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [mode, query, returnTo, versionId]);

  async function saveDocument() {
    if (!sessionRef.current || mode !== "edit" || saving || savedVersionId)
      return;
    setSaving(true);
    // A merge-workspace editor is a review step. Once its save has completed
    // (or the document is already current), return to that workspace instead
    // of leaving the user stranded in ONLYOFFICE.
    if (mergeWorkspaceReturnTo) returnAfterSaveRef.current = true;
    try {
      if (isInitialMerge) {
        const detailsResponse = await fetch(
          `${api}/documents/${documentId}/versions/${versionId}/initial-merge-details`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filename: mergedDocumentName || undefined,
              description: changeSummary || undefined,
            }),
          },
        );
        if (!detailsResponse.ok) throw new Error(await detailsResponse.text());
      }
      setMessage(
        returnAfterSaveRef.current
          ? "Saving document… You will return to the merge workspace automatically."
          : "Saving document…",
      );
      const response = await fetch(
        `${api}/editor-sessions/${sessionRef.current}/save`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: changeSummary || undefined }),
        },
      );
      if (!response.ok) throw new Error(await response.text());
      const outcome = (await response.json()) as { status?: string };
      if (outcome.status === "unchanged") {
        setSaving(false);
        if (returnAfterSaveRef.current) {
          window.location.assign(returnTo);
          return;
        }
        setMessage(
          isInitialMerge
            ? "Merge details saved. The merged version is already current."
            : "No additional editor edits need saving. Your current version remains unchanged.",
        );
        return;
      }
      setMessage(
        "Saving in the document editor… IDMS will add the next version shortly.",
      );
    } catch (error) {
      setSaving(false);
      setMessage(
        error instanceof Error
          ? `IDMS could not start the save: ${error.message}`
          : "IDMS could not start the save. Your editor remains open; try again.",
      );
    }
  }
  function leaveAfterSaving() {
    setShowLeaveDialog(false);
    returnAfterSaveRef.current = true;
    void saveDocument();
  }
  function goToMergedSection(offset: number) {
    const nextAnchor = mergeAnchors[activeAnchorIndex + offset];
    if (!nextAnchor) return;
    const destination = new URL(window.location.href);
    destination.searchParams.set("anchor", nextAnchor);
    destination.searchParams.set("anchors", mergeAnchors.join(","));
    window.location.assign(destination.toString());
  }
  async function discardAndLeave() {
    if (leaving) return;
    setLeaving(true);
    setShowLeaveDialog(false);

    // The leave decision belongs to the user, not to the editor/network.  Send
    // small keepalive requests so they survive this navigation, then exit at
    // once. The discard endpoint makes late ONLYOFFICE callbacks harmless and
    // the initial-merge delete removes an unsaved generated v1.
    const cleanup: Promise<unknown>[] = [];
    if (sessionRef.current) {
      cleanup.push(
        fetch(`${api}/editor-sessions/${sessionRef.current}/discard`, {
          method: "POST",
          keepalive: true,
        }),
      );
    }
    if (isInitialMerge) {
      cleanup.push(
        fetch(
          `${api}/documents/${documentId}/versions/${versionId}/initial-merge`,
          {
            method: "DELETE",
            keepalive: true,
          },
        ),
      );
    }
    void Promise.allSettled(cleanup);
    window.location.assign(returnTo);
  }
  useEffect(() => {
    function receive(event: MessageEvent) {
      const data = event.data;
      if (event.origin !== window.location.origin || !data || data.sessionId !== sessionRef.current) return;
      if (data.type === "idms-toc-ready" && event.source) {
        tocBridge.current = event.source as Window;
        setTocReady(true);
      } else if (data.type === "idms-toc-result" && event.source === tocBridge.current && data.requestId === tocPending.current?.id) {
        if (tocPending.current) clearTimeout(tocPending.current.timer);
        tocPending.current = null;
        setTocUpdating(false);
        setMessage(data.ok === true ? "Table of contents refreshed, including titles, numbering and page numbers. Save to keep this update." : "The editor could not confirm the TOC update. No successful refresh has been recorded.");
      }
    }
    window.addEventListener("message", receive);
    return () => {
      window.removeEventListener("message", receive);
      if (tocPending.current) clearTimeout(tocPending.current.timer);
      tocPending.current = null;
      tocBridge.current = null;
    };
  }, []);
  function updateTableOfContents() {
    if (!tocBridge.current || tocPending.current) {
      setMessage("The TOC update tool is not ready. Wait for the editor to load.");
      return;
    }
    const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) => value.toString(16).padStart(2, "0")).join("");
    const timer = setTimeout(() => {
      tocPending.current = null;
      setTocUpdating(false);
      setMessage("TOC update timed out. Review the document and retry; refresh is not confirmed.");
    }, 60000);
    tocPending.current = { id, timer };
    setTocUpdating(true);
    setMessage("Updating table of contents…");
    tocBridge.current.postMessage({ type: "idms-toc-update", sessionId: sessionRef.current, requestId: id }, window.location.origin);
  }

  return (
    <main className="editor-shell">
      <header className="editor-page-header">
        <div>
          <button
            className="back editor-back"
            type="button"
            onClick={() => setShowLeaveDialog(true)}
          >
            <span aria-hidden="true">←</span> Version history
          </button>
          <p className="eyebrow">
            {mode === "view" ? "READ ONLY" : "EDITING WORKSPACE"}
          </p>
        </div>
        <div className="editor-controls">
          <p className="muted editor-status">{message}</p>
          {isInitialMerge && !savedVersionId && (
            <>
              <label className="editor-summary">
                Merged document name
                <input
                  value={mergedDocumentName}
                  onChange={(event) =>
                    setMergedDocumentName(event.target.value)
                  }
                  maxLength={255}
                  placeholder="Merged document.docx"
                />
              </label>
            </>
          )}
          {mode === "edit" && !savedVersionId && (
            <>
              {mergeAnchors.length > 1 && (
                <div
                  className="editor-change-navigation"
                  aria-label="Inserted section navigation"
                >
                  <span>
                    Inserted section {activeAnchorIndex + 1} of{" "}
                    {mergeAnchors.length}
                  </span>
                  <button
                    type="button"
                    className="editor-change-arrow"
                    disabled={activeAnchorIndex === 0}
                    onClick={() => goToMergedSection(-1)}
                    aria-label="Previous inserted section"
                    title="Previous inserted section"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="editor-change-arrow"
                    disabled={activeAnchorIndex === mergeAnchors.length - 1}
                    onClick={() => goToMergedSection(1)}
                    aria-label="Next inserted section"
                    title="Next inserted section"
                  >
                    ↓
                  </button>
                </div>
              )}
              <label className="editor-summary">
                Change summary
                <input
                  value={changeSummary}
                  onChange={(event) => setChangeSummary(event.target.value)}
                  maxLength={1000}
                  placeholder="e.g. Updated deployment requirements"
                />
              </label>
              <button
                type="button"
                className="editor-save"
                disabled={saving || tocUpdating}
                onClick={() => void saveDocument()}
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={updateTableOfContents}
                disabled={!tocReady || tocUpdating || saving}
              >
                {tocUpdating ? "Updating TOC…" : "Update TOC"}
              </button>
              <a
                className="editor-download"
                href={`/api/v1/documents/${documentId}/versions/${versionId}/download-clean`}
              >
                <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3v12m-4-4 4 4 4-4" />
                  <path d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
                </svg>
                <span>Download clean DOCX</span>
              </a>
            </>
          )}
          {savedVersionId && (
            <a
              className="button editor-history"
              href={`/documents/${documentId}/versions`}
            >
              View version history →
            </a>
          )}
        </div>
      </header>
      <div ref={holder} id="onlyoffice-editor" className="editor-frame" />
      {showLeaveDialog && (
        <div className="leave-dialog-backdrop" role="presentation">
          <section
            className="leave-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-editor-title"
          >
            <h2 id="leave-editor-title">Save changes before leaving?</h2>
            <p>
              {isInitialMerge
                ? "Don’t save will permanently delete this newly generated version 1 document."
                : "Don’t save discards only the edits made in this editor session. Existing versions stay unchanged."}
            </p>
            <div className="leave-dialog-actions">
              <button
                type="button"
                className="secondary"
                disabled={leaving}
                onClick={() => setShowLeaveDialog(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="delete-document"
                disabled={leaving}
                onClick={discardAndLeave}
              >
                {leaving ? "Discarding…" : "Don’t save"}
              </button>
              <button
                type="button"
                disabled={saving || leaving}
                onClick={leaveAfterSaving}
              >
                {saving ? "Saving…" : "Save and leave"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
