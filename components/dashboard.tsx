"use client";

import { FormEvent, useEffect, useState } from "react";
import { createProject, listProjects } from "../lib/api/projects";
import type { Project } from "../types/contracts";

export function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "submitting" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    listProjects().then(setProjects).then(() => setState("ready")).catch(() => {
      setState("error");
      setMessage("IDMS API is unavailable. Start the backend on port 8000 and refresh.");
    });
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    setState("submitting");
    try {
      const project = await createProject({ name: name.trim() });
      setProjects((current) => [project, ...current]);
      setName("");
      setMessage(`“${project.name}” is ready for its master and source documents.`);
      setState("ready");
    } catch {
      setState("error");
      setMessage("We could not create that project. Check the API connection and try again.");
    }
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/dashboard">IDMS</a><span>Document composition workspace</span></header>
    <section className="hero">
      <p className="eyebrow">WORKSPACE</p>
      <h1>Build the right document from the right sections.</h1>
      <p>Start a project, add original DOCX files, choose one master, then compose a new immutable version.</p>
    </section>
    <section className="grid">
      <form className="panel create" onSubmit={submit}>
        <p className="eyebrow">NEW PROJECT</p>
        <h2>Create a document workspace</h2>
        <label htmlFor="project-name">Project name</label>
        <input id="project-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Campus proposal" maxLength={160} required />
        <button disabled={state === "submitting"}>{state === "submitting" ? "Creating…" : "Create new project"}</button>
        {message && <p className={state === "error" ? "feedback error" : "feedback"} role="status">{message}</p>}
      </form>
      <section className="panel">
        <p className="eyebrow">HOW IDMS WORKS</p>
        <ol className="steps"><li>Upload original DOCX documents</li><li>Choose the one master document</li><li>Select, position, preview, and merge sections</li><li>Edit and export the resulting version</li></ol>
      </section>
    </section>
    <section className="recent">
      <div><p className="eyebrow">RECENT WORKSPACES</p><h2>Your projects</h2></div>
      {state === "loading" && <p className="muted">Loading projects…</p>}
      {state === "ready" && projects.length === 0 && <p className="empty">No projects yet. Create one to begin composing a document.</p>}
      <div className="project-list">{projects.map((project) => <a className="project" href={`/projects/${project.id}`} key={project.id}><span><strong>{project.name}</strong><small>{project.document_count} documents</small></span><span aria-hidden="true">→</span></a>)}</div>
    </section>
  </main>;
}
