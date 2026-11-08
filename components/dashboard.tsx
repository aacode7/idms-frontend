"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  createProject,
  deleteProject,
  listProjects,
} from "../lib/api/projects";
import type { Project } from "../types/contracts";

export function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [state, setState] = useState<
    "loading" | "ready" | "submitting" | "error"
  >("loading");
  const [message, setMessage] = useState("");
  const [menuProjectId, setMenuProjectId] = useState<string | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);
  const deleteInFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const loadProjects = async () => {
      try {
        const values = await listProjects();
        if (cancelled) return;
        setProjects(values);
        setMessage("");
        setState("ready");
      } catch {
        if (cancelled) return;
        attempts += 1;
        setState("error");
        setMessage(
          "IDMS API is temporarily unavailable. Retrying automatically…",
        );
        retryTimer = setTimeout(loadProjects, Math.min(3000 * attempts, 15000));
      }
    };
    void loadProjects();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    setState("submitting");
    try {
      const project = await createProject({ name: name.trim() });
      setProjects((current) => [project, ...current]);
      setName("");
      setMessage(
        `“${project.name}” is ready for its master and source documents.`,
      );
      setState("ready");
    } catch {
      setState("error");
      setMessage(
        "We could not create that project. Check the API connection and try again.",
      );
    }
  }

  async function confirmDelete() {
    if (!projectToDelete || deleteInFlight.current) return;
    deleteInFlight.current = true;
    setDeleting(true);
    try {
      await deleteProject(projectToDelete.id);
      setProjects((current) =>
        current.filter((project) => project.id !== projectToDelete.id),
      );
      setMessage(
        `“${projectToDelete.name}” and all of its files were permanently deleted.`,
      );
      setState("ready");
      setProjectToDelete(null);
    } catch {
      setMessage(
        "The project could not be deleted. Its records were kept so you can retry safely.",
      );
      setState("error");
    } finally {
      deleteInFlight.current = false;
      setDeleting(false);
    }
  }

  return (
    <main className="dashboard-shell">
      <header className="dashboard-topbar">
        <a className="dashboard-brand" href="/dashboard" aria-label="IDMS home">
          <span className="dashboard-brand-mark" aria-hidden="true">
            ✦
          </span>
          <span>IDMS</span>
        </a>
        <div className="dashboard-topbar-center">
          Document intelligence workspace
        </div>
        <div className="dashboard-topbar-actions">
          <button type="button" className="topbar-icon" aria-label="Help">
            ?
          </button>
          <span className="dashboard-avatar" aria-hidden="true">
            ID
          </span>
        </div>
      </header>
      <section className="dashboard-welcome">
        <p className="eyebrow">YOUR DOCUMENT STUDIO</p>
        <h1>Welcome to your document studio</h1>
        <p>
          Bring your source documents together, keep the original files safe,
          and create polished versions with confidence.
        </p>
      </section>
      <section className="dashboard-grid">
        <form className="dashboard-card project-creator" onSubmit={submit}>
          <div className="card-kicker">
            <span className="dashboard-icon" aria-hidden="true">
              ✦
            </span>
            <span>NEW PROJECT</span>
          </div>
          <h2>Create a document workspace</h2>
          <p className="dashboard-copy">
            Compose original DOCX files into a new, immutable document version
            with section-level control.
          </p>
          <label htmlFor="project-name">
            PROJECT NAME <span aria-hidden="true">*</span>
          </label>
          <input
            id="project-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Campus expansion proposal"
            maxLength={160}
            required
          />
          <button disabled={state === "submitting"}>
            <span aria-hidden="true">＋</span>
            {state === "submitting" ? "Creating…" : "Create new project"}
          </button>
          {message && (
            <p
              className={state === "error" ? "feedback error" : "feedback"}
              role="status"
            >
              {message}
            </p>
          )}
        </form>
        <section className="dashboard-card workflow-card">
          <div className="card-kicker">
            <span className="dashboard-icon workflow-icon" aria-hidden="true">
              ⌘
            </span>
            <span>WORKFLOW GUIDE</span>
            <small>4 quick steps</small>
          </div>
          <h2>How IDMS works</h2>
          <ol className="workflow-steps">
            <li>
              <span>1</span>
              <div>
                <strong>Upload original DOCX documents</strong>
                <p>
                  Add the master document and source files to your workspace.
                </p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>Choose the master document</strong>
                <p>Keep its layout and style as the authoritative baseline.</p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>Select, position &amp; merge sections</strong>
                <p>Preview compatibility before creating a new version.</p>
              </div>
            </li>
            <li>
              <span>4</span>
              <div>
                <strong>Edit and export the resulting version</strong>
                <p>Review the composed document and export when ready.</p>
              </div>
            </li>
          </ol>
        </section>
      </section>
      <section className="dashboard-recent">
        <div className="recent-heading">
          <div>
            <p className="eyebrow">RECENT WORKSPACES</p>
            <h2>Your projects</h2>
          </div>
          <span className="project-count">{projects.length} total</span>
        </div>
        {state === "loading" && <p className="muted">Loading projects…</p>}
        {state === "ready" && projects.length === 0 && (
          <p className="empty">
            No projects yet. Create one to begin composing a document.
          </p>
        )}
        <div className="project-list">
          {projects.map((project) => (
            <article className="project" key={project.id}>
              <a className="project-open" href={`/projects/${project.id}`}>
                <span className="project-file-icon" aria-hidden="true">
                  ▤
                </span>
                <strong>{project.name}</strong>
                <p>{project.description || "Document composition workspace"}</p>
                <span className="project-meta">
                  <b>{project.document_count}</b>{" "}
                  {project.document_count === 1 ? "document" : "documents"}
                  <em>Open workspace →</em>
                </span>
              </a>
              <button
                className="project-menu"
                type="button"
                aria-label={`Actions for ${project.name}`}
                aria-expanded={menuProjectId === project.id}
                onClick={() =>
                  setMenuProjectId((current) =>
                    current === project.id ? null : project.id,
                  )
                }
              >
                •••
              </button>
              {menuProjectId === project.id && (
                <div className="project-actions" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuProjectId(null);
                      setProjectToDelete(project);
                    }}
                  >
                    Delete project
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
      {projectToDelete && (
        <div className="delete-backdrop" role="presentation">
          <section
            className="delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-project-title"
          >
            <p className="eyebrow">PERMANENT DELETION</p>
            <h2 id="delete-project-title">Delete “{projectToDelete.name}”?</h2>
            <p>
              This permanently deletes the project, its{" "}
              {projectToDelete.document_count}{" "}
              {projectToDelete.document_count === 1 ? "document" : "documents"},
              every version, analysis, job record, and all associated DOCX/PDF
              files from object storage. This cannot be undone.
            </p>
            <div>
              <button
                className="secondary"
                type="button"
                disabled={deleting}
                onClick={() => setProjectToDelete(null)}
              >
                Cancel
              </button>
              <button
                className="danger"
                type="button"
                disabled={deleting}
                onClick={confirmDelete}
              >
                {deleting ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
