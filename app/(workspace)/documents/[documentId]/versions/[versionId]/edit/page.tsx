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

export default function EditorPage() {
  const { documentId, versionId } = useParams<{
    documentId: string;
    versionId: string;
  }>();
  const query = useSearchParams();
  const holder = useRef<HTMLDivElement>(null);
  const sessionRef = useRef("");
  const [message, setMessage] = useState("Preparing document editor…");
  const [changeSummary, setChangeSummary] = useState(
    query.get("description") || "",
  );
  const [saving, setSaving] = useState(false);
  const [savedVersionId, setSavedVersionId] = useState("");
  const mode = query.get("mode") === "view" ? "view" : "edit";

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
      sessionId = config.session_id;
      sessionRef.current = sessionId;
      const script = document.createElement("script");
      script.src = `${config.documentServerUrl}/web-apps/apps/api/documents/api.js`;
      script.onload = () => {
        if (window.DocsAPI && holder.current) {
          const anchor = query.get("anchor");
          if (anchor)
            config.editorConfig = {
              ...config.editorConfig,
              actionLink: { action: { type: "bookmark", data: anchor } },
            };
          new window.DocsAPI.DocEditor("onlyoffice-editor", {
            ...config,
            width: "100%",
            // ONLYOFFICE otherwise falls back to its 150px default iframe height.
            // Give its API a concrete viewport-based height, not just CSS on its host.
            height: `${Math.max(window.innerHeight - 122, 640)}px`,
          });
          setMessage(
            anchor
              ? "Opening the merged section bookmark in ONLYOFFICE. Use Save to create a new immutable version."
              : mode === "view"
                ? "Read-only version view."
                : "Use ONLYOFFICE Save. IDMS will create the next immutable version automatically.",
          );
        }
      };
      script.onerror = () => setMessage("ONLYOFFICE could not be loaded.");
      document.body.appendChild(script);
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
  }, [mode, query, versionId]);

  async function saveNewVersion() {
    if (!sessionRef.current || mode !== "edit" || saving || savedVersionId) return;
    setSaving(true);
    setMessage("Requesting ONLYOFFICE to save a new immutable version…");
    try {
      const response = await fetch(`${api}/editor-sessions/${sessionRef.current}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: changeSummary || undefined }),
      });
      if (!response.ok) throw new Error(await response.text());
      setMessage("Saving in ONLYOFFICE… IDMS will add the next version shortly.");
    } catch {
      setSaving(false);
      setMessage("IDMS could not start the save. Your editor remains open; try again.");
    }
  }
  return (
    <main className="editor-shell">
      <header className="editor-page-header">
        <div>
          <a className="back" href={`/documents/${documentId}/versions`}>
            <span aria-hidden="true">←</span> Version history
          </a>
          <p className="eyebrow">
            {mode === "view" ? "READ ONLY" : "EDITING WORKSPACE"}
          </p>
        </div>
        <div className="editor-controls">
          <p className="muted editor-status">{message}</p>
          {mode === "edit" && !savedVersionId && <>
            <label className="editor-summary">Change summary
              <input value={changeSummary} onChange={(event) => setChangeSummary(event.target.value)} maxLength={1000} placeholder="e.g. Updated deployment requirements" />
            </label>
            <button type="button" className="editor-save" disabled={saving} onClick={saveNewVersion}>
              {saving ? "Saving new version…" : "Save new version"}
            </button>
          </>}
          {savedVersionId && <a className="button editor-history" href={`/documents/${documentId}/versions`}>View version history →</a>}
        </div>
      </header>
      <div ref={holder} id="onlyoffice-editor" className="editor-frame" />
    </main>
  );
}
