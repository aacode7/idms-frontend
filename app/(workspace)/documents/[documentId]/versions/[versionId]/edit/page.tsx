"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

const api = process.env.NEXT_PUBLIC_IDMS_API_URL ?? "http://localhost:8000/api/v1";

declare global { interface Window { DocsAPI?: { DocEditor: new (id: string, config: object) => unknown }; } }

export default function EditorPage() {
  const { documentId, versionId } = useParams<{ documentId: string; versionId: string }>();
  const query = useSearchParams();
  const holder = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState("Preparing document editor…");
  const mode = query.get("mode") === "view" ? "view" : "edit";

  useEffect(() => {
    let sessionId = ""; let timer: ReturnType<typeof setInterval> | undefined;
    async function start() {
      const response = await fetch(`${api}/versions/${versionId}/editor-session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, expected_latest_version_id: query.get("expected") || undefined, description: query.get("description") || undefined, created_by: query.get("actor") || undefined }) });
      if (!response.ok) throw new Error(await response.text());
      const config = await response.json(); sessionId = config.session_id;
      const script = document.createElement("script"); script.src = `${config.documentServerUrl}/web-apps/apps/api/documents/api.js`;
      script.onload = () => { if (window.DocsAPI && holder.current) { new window.DocsAPI.DocEditor("onlyoffice-editor", config); setMessage(mode === "view" ? "Read-only version view." : "Use ONLYOFFICE Save. IDMS will create the next immutable version automatically."); } };
      script.onerror = () => setMessage("ONLYOFFICE could not be loaded."); document.body.appendChild(script);
      if (mode === "edit") timer = setInterval(async () => { const state = await fetch(`${api}/editor-sessions/${sessionId}`).then((item) => item.json()); if (state.status === "saved") { setMessage("Saved as a new immutable version. Return to version history to view it."); clearInterval(timer); } if (state.status === "conflict") { setMessage(state.conflict_message || "A newer version exists. Reload and compare before saving."); clearInterval(timer); } }, 4000);
    }
    start().catch(() => setMessage("Editor could not be started. A newer version may exist; return to history and reload."));
    return () => { if (timer) clearInterval(timer); };
  }, [mode, query, versionId]);
  return <main className="shell"><a href={`/documents/${documentId}/versions`}>← Version history</a><p className="eyebrow">{mode === "view" ? "READ ONLY" : "EDITING WORKSPACE"}</p><h1>Document editor</h1><p className="muted">{message}</p><div ref={holder} id="onlyoffice-editor" className="editor-frame" /></main>;
}
