"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { createUploadIntent, getProject, listDocuments, selectMaster, startAnalysis, uploadDocx } from "../../../../lib/api/projects";
import type { Document, Project } from "../../../../types/contracts";

const maxDocumentBytes = 25 * 1024 * 1024;

export default function ProjectWorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [actionError, setActionError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([getProject(projectId), listDocuments(projectId)]).then(([loadedProject, loadedDocuments]) => {
      setProject(loadedProject); setDocuments(loadedDocuments);
    }).catch(() => setError("This workspace could not be loaded."));
  }, [projectId]);

  async function sha256(file: File) {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    if (files.some((file) => !file.name.toLowerCase().endsWith(".docx") || file.size > maxDocumentBytes)) {
      setActionError("Only DOCX files up to 25 MB can be uploaded."); return;
    }
    setUploading(true); setActionError("");
    try {
      const completed: Document[] = [];
      for (const [index, file] of files.entries()) {
        const role = documents.length + index === 0 ? "master_candidate" : "source";
        const intent = await createUploadIntent(projectId, file, await sha256(file), role);
        completed.push(await uploadDocx(file, intent));
      }
      setDocuments((current) => [...current, ...completed]);
    } catch {
      setActionError("Upload did not finish. Your original local file is unchanged; retry the failed file.");
    } finally { setUploading(false); }
  }

  async function chooseMaster(documentId: string) {
    setActionError("");
    try { setDocuments(await selectMaster(projectId, documentId)); }
    catch { setActionError("The master document could not be updated. Try again."); }
  }
  async function analyze(documentId: string) {
    try { const job = await startAnalysis(documentId); setActionError(`Analysis queued: ${job.id}`); }
    catch { setActionError("Analysis could not be queued. Ensure Redis/Celery is running."); }
  }

  if (error) return <main className="shell"><a href="/dashboard">← Dashboard</a><p className="empty">{error}</p></main>;
  if (!project) return <main className="shell"><p className="muted">Loading workspace…</p></main>;
  const master = documents.find((document) => document.role === "master");
  return <main className="shell">
    <header className="topbar"><a className="brand" href="/dashboard">IDMS</a><span>Document workspace</span></header>
    <section className="hero compact"><a className="back" href="/dashboard">← All projects</a><p className="eyebrow">DOCUMENT WORKSPACE</p><h1>{project.name}</h1><p>Original files remain immutable. Every merge and edit will create a new version.</p></section>
    <section className="grid">
      <section className="panel"><p className="eyebrow">DOCUMENTS</p><h2>{documents.length ? "Uploaded documents" : "Add your documents"}</h2><input className="visually-hidden" ref={inputRef} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple onChange={handleFiles} /><button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}>{uploading ? "Uploading…" : "Upload DOCX files"}</button>{actionError && <p className="feedback error light" role="alert">{actionError}</p>}{documents.length ? <ul className="documents">{documents.map((document) => <li key={document.id}><span><strong>{document.filename}</strong><small>{document.role === "master" ? "Master document" : document.status === "upload_pending" ? "Upload pending" : "Source document"}</small></span>{document.status === "uploaded" && <span><button type="button" className="secondary" onClick={() => analyze(document.id)}>Analyze</button>{document.role !== "master" && <button type="button" className="secondary" onClick={() => chooseMaster(document.id)}>Set as master</button>}</span>}</li>)}</ul> : <p className="muted">Upload one master candidate and any number of source DOCX files. Originals are private and never overwritten.</p>}</section>
      <section className="panel"><p className="eyebrow">NEXT STEP</p><h2>{master ? "Master selected" : "Choose one master"}</h2><p className="muted">{master ? `${master.filename} is protected as the original master. Analyze all documents, then compose selected sections.` : "Upload master and source DOCX files, then select exactly one master before composing a merge."}</p>{master && <a href={`/projects/${projectId}/merge`}>Open merge workspace →</a>}</section>
    </section>
  </main>;
}
