"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getProject, listDocuments } from "../../../../lib/api/projects";
import type { Document, Project } from "../../../../types/contracts";

export default function ProjectWorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([getProject(projectId), listDocuments(projectId)]).then(([loadedProject, loadedDocuments]) => {
      setProject(loadedProject); setDocuments(loadedDocuments);
    }).catch(() => setError("This workspace could not be loaded."));
  }, [projectId]);
  if (error) return <main className="shell"><a href="/dashboard">← Dashboard</a><p className="empty">{error}</p></main>;
  if (!project) return <main className="shell"><p className="muted">Loading workspace…</p></main>;
  const master = documents.find((document) => document.role === "master");
  return <main className="shell">
    <header className="topbar"><a className="brand" href="/dashboard">IDMS</a><span>Document workspace</span></header>
    <section className="hero compact"><a className="back" href="/dashboard">← All projects</a><p className="eyebrow">DOCUMENT WORKSPACE</p><h1>{project.name}</h1><p>Original files remain immutable. Every merge and edit will create a new version.</p></section>
    <section className="grid">
      <section className="panel"><p className="eyebrow">DOCUMENTS</p><h2>{documents.length ? "Uploaded documents" : "Add your documents"}</h2>{documents.length ? <ul className="documents">{documents.map((document) => <li key={document.id}><strong>{document.filename}</strong><span>{document.role === "master" ? "Master document" : "Source document"}</span></li>)}</ul> : <p className="muted">Document upload is the next storage-backed module. This workspace is ready to receive DOCX document records from the API.</p>}</section>
      <section className="panel"><p className="eyebrow">NEXT STEP</p><h2>{master ? "Master selected" : "Choose one master"}</h2><p className="muted">{master ? `${master.filename} is protected as the original master. Continue to analysis when available.` : "Add master and source DOCX files, then select exactly one master before composing a merge."}</p></section>
    </section>
  </main>;
}
