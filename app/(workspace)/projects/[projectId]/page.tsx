"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  createUploadIntent,
  deleteDocument,
  getProject,
  listDocuments,
  listVersions,
  removeMaster,
  selectMaster,
  uploadDocx,
} from "../../../../lib/api/projects";
import type {
  Document,
  DocumentVersion,
  Project,
} from "../../../../types/contracts";

const maxDocumentBytes = 25 * 1024 * 1024;

export default function ProjectWorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [generatedVersions, setGeneratedVersions] = useState<
    Record<string, DocumentVersion[]>
  >({});
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [documentToDelete, setDocumentToDelete] = useState<Document | null>(
    null,
  );
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(
    null,
  );
  const uploadInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([getProject(projectId), listDocuments(projectId)])
      .then(async ([loadedProject, loadedDocuments]) => {
        setProject(loadedProject);
        setDocuments(loadedDocuments);
        const histories = await Promise.all(
          loadedDocuments
            .filter((document) => document.role === "generated")
            .map(
              async (document) =>
                [document.id, await listVersions(document.id)] as const,
            ),
        );
        setGeneratedVersions(Object.fromEntries(histories));
      })
      .catch(() => setError("This workspace could not be loaded."));
  }, [projectId]);

  useEffect(() => {
    const hasActiveAnalysis = documents.some(
      (document) =>
        document.analysis_status === "queued" ||
        document.analysis_status === "running",
    );
    if (!hasActiveAnalysis) return;
    const timer = window.setInterval(async () => {
      try {
        const refreshed = await listDocuments(projectId);
        setDocuments(refreshed);
        if (
          refreshed.some((document) => document.analysis_status === "failed")
        ) {
          setActionError(
            "Analysis could not be completed for one or more documents. Check the worker, then upload the affected file again.",
          );
        }
      } catch {
        // Keep the last known progress visible and retry on the next interval.
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [documents, projectId]);

  async function sha256(file: File) {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      await file.arrayBuffer(),
    );
    return Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  }

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    if (
      files.some(
        (file) =>
          !file.name.toLowerCase().endsWith(".docx") ||
          file.size > maxDocumentBytes,
      )
    ) {
      setActionError("Only DOCX files up to 25 MB can be uploaded.");
      return;
    }
    setUploading(true);
    setActionError("");
    try {
      const completed: Document[] = [];
      for (const file of files) {
        const intent = await createUploadIntent(
          projectId,
          file,
          await sha256(file),
          "master_candidate",
        );
        completed.push(await uploadDocx(file, intent));
      }
      setDocuments((current) => [...current, ...completed]);
      setActionError(
        `${completed.length} document${completed.length === 1 ? "" : "s"} uploaded. Analysis started automatically.`,
      );
    } catch {
      setActionError(
        "Upload did not finish. Your original local file is unchanged; retry the failed file.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function chooseMaster(documentId: string) {
    setActionError("");
    try {
      setDocuments(await selectMaster(projectId, documentId));
    } catch {
      setActionError("The master document could not be updated. Try again.");
    }
  }
  async function removeCurrentMaster() {
    setActionError("");
    try {
      setDocuments(await removeMaster(projectId));
      setActionError(
        "The master document is now a source document. Choose a new master when ready.",
      );
    } catch {
      setActionError("The master document could not be removed. Try again.");
    }
  }
  async function confirmDocumentDelete() {
    if (!documentToDelete) return;
    setDeletingDocumentId(documentToDelete.id);
    try {
      await deleteDocument(projectId, documentToDelete.id);
      setDocuments((current) =>
        current.filter((document) => document.id !== documentToDelete.id),
      );
      setActionError(
        `${documentToDelete.filename} and its stored versions were permanently deleted.`,
      );
      setDocumentToDelete(null);
    } catch {
      setActionError(
        "This document could not be deleted. Its records were kept so you can retry safely.",
      );
    } finally {
      setDeletingDocumentId(null);
    }
  }
  if (error)
    return (
      <main className="shell">
        <a href="/dashboard">← Dashboard</a>
        <p className="empty">{error}</p>
      </main>
    );
  if (!project)
    return (
      <main className="shell">
        <p className="muted">Loading workspace…</p>
      </main>
    );
  const master = documents.find((document) => document.role === "master");
  const sourceDocuments = documents.filter(
    (document) =>
      document.role === "source" || document.role === "master_candidate",
  );
  const generatedDocuments = documents.filter(
    (document) => document.role === "generated",
  );
  const uploadInProgress = uploading;
  const workflowBusy = uploadInProgress;
  const analyzingDocuments = documents.filter(
    (document) =>
      document.analysis_status === "queued" ||
      document.analysis_status === "running",
  );
  const compositionDocuments = documents.filter(
    (document) => document.role === "master" || document.role === "source",
  );
  const allDocumentsAnalyzed =
    compositionDocuments.length > 0 &&
    compositionDocuments.every(
      (document) => document.analysis_status === "completed",
    );
  const analysisLabel = (document: Document) => {
    if (document.analysis_status === "completed") return "Analysis complete";
    if (document.analysis_status === "running") return "Analyzing…";
    if (document.analysis_status === "queued") return "Analysis queued…";
    if (document.analysis_status === "failed") return "Analysis failed";
    return document.role === "master"
      ? "Master document"
      : document.status === "upload_pending"
        ? "Upload pending"
        : "Source document";
  };
  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="/dashboard">
          IDMS
        </a>
        <span>Document workspace</span>
      </header>
      <section className="hero compact">
        <a className="back" href="/dashboard">
          <span aria-hidden="true">←</span> Back to all projects
        </a>
        <p className="eyebrow">DOCUMENT WORKSPACE</p>
        <h1>{project.name}</h1>
        <p>
          Original files remain immutable. Every merge and edit will create a
          new version.
        </p>
      </section>
      <section className="grid">
        <section className="panel">
          <p className="eyebrow">DOCUMENTS</p>
          <h2>
            {sourceDocuments.length ? "Uploaded documents" : "Add documents"}
          </h2>
          <input
            className="visually-hidden"
            ref={uploadInputRef}
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            multiple
            onChange={handleFiles}
          />
          <button
            type="button"
            className="secondary"
            onClick={() => uploadInputRef.current?.click()}
            disabled={workflowBusy}
          >
            {uploading ? "Uploading…" : "Upload DOCX files"}
          </button>
          <p className="upload-assurance">
            Every completed upload is analyzed automatically.
          </p>
          {analyzingDocuments.length > 0 && (
            <p className="analysis-indicator" role="status" aria-live="polite">
              <span className="analysis-spinner" aria-hidden="true" />
              Analyzing {analyzingDocuments.length} document
              {analyzingDocuments.length === 1 ? "" : "s"} in the background…
            </p>
          )}
          {actionError && (
            <p className="feedback light" role="status">
              {actionError}
            </p>
          )}
          {sourceDocuments.length ? (
            <ul className="documents">
              {sourceDocuments.map((document) => (
                <li key={document.id}>
                  <span>
                    <strong>{document.filename}</strong>
                    <small className="role-tag">SOURCE DOCUMENT</small>
                    <small>
                      {document.role === "master_candidate"
                        ? "Role not selected"
                        : "Source document"}{" "}
                      · {analysisLabel(document)}
                    </small>
                  </span>
                  {document.status === "uploaded" && (
                    <span className="document-actions">
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => chooseMaster(document.id)}
                      >
                        Set as master
                      </button>
                      <button
                        type="button"
                        className="secondary delete-document"
                        disabled={deletingDocumentId === document.id}
                        onClick={() => setDocumentToDelete(document)}
                      >
                        {deletingDocumentId === document.id
                          ? "Deleting…"
                          : "Delete"}
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">
              Upload as many DOCX files as you need. Select the master after
              uploading.
            </p>
          )}
        </section>
        <section className="panel">
          <p className="eyebrow">MASTER DOCUMENT</p>
          <h2>{master ? "Master selected" : "Choose one master"}</h2>
          <p className="muted">
            {master
              ? allDocumentsAnalyzed
                ? "All documents are analyzed and ready to compose."
                : `${master.filename} is the current master. Document analysis is still in progress.`
              : "Upload your documents first, then select any one as the master."}
          </p>
          {master && (
            <div className="master-document">
              <strong>{master.filename}</strong>
              <small>{analysisLabel(master)}</small>
              {master.status === "uploaded" && (
                <span className="document-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={removeCurrentMaster}
                  >
                    Remove from master
                  </button>
                  <button
                    type="button"
                    className="secondary delete-document"
                    disabled={deletingDocumentId === master.id}
                    onClick={() => setDocumentToDelete(master)}
                  >
                    {deletingDocumentId === master.id ? "Deleting…" : "Delete"}
                  </button>
                </span>
              )}
            </div>
          )}
          {master && allDocumentsAnalyzed ? (
            <a
              className="merge-workspace-cta"
              href={`/projects/${projectId}/merge`}
            >
              <span>
                <small>READY TO COMPOSE</small>
                Open merge workspace
              </span>
              <span aria-hidden="true">→</span>
            </a>
          ) : master ? (
            <p className="muted">Waiting for document analysis to finish.</p>
          ) : null}
        </section>
      </section>
      {generatedDocuments.length > 0 && (
        <section className="generated-versions panel">
          <p className="eyebrow">MERGED DOCUMENT</p>
          <h2>Version history</h2>
          <p className="muted">
            Each merge and editor save is retained as an immutable version.
            Originals above are unchanged.
          </p>
          {generatedDocuments.map((document) => (
            <article className="generated-document" key={document.id}>
              <div>
                <strong>{document.filename}</strong>
                <small>
                  {generatedVersions[document.id]?.length ?? 0} version(s)
                </small>
              </div>
              <a
                className="secondary"
                href={`/documents/${document.id}/versions`}
              >
                Full version history →
              </a>
              <ul>
                {(generatedVersions[document.id] ?? []).map((version) => (
                  <li key={version.id}>
                    <span>
                      <strong>Version {version.version_number}</strong>
                      <small>
                        {version.description || version.created_by}
                        {version.is_latest ? " · Latest" : ""}
                      </small>
                    </span>
                    <a
                      href={`/documents/${document.id}/versions/${version.id}/edit?mode=edit&expected=${version.id}`}
                    >
                      Open in editor →
                    </a>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>
      )}
      {documentToDelete && (
        <div className="delete-backdrop" role="presentation">
          <section
            className="delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-document-title"
          >
            <p className="eyebrow">PERMANENT FILE DELETION</p>
            <h2 id="delete-document-title">
              Delete “{documentToDelete.filename}”?
            </h2>
            <p>
              This removes this file, all of its versions and analysis data,
              related merge selections, and its DOCX/PDF objects from storage.
              This cannot be undone.
            </p>
            <div>
              <button
                className="secondary"
                type="button"
                disabled={deletingDocumentId !== null}
                onClick={() => setDocumentToDelete(null)}
              >
                Cancel
              </button>
              <button
                className="danger"
                type="button"
                disabled={deletingDocumentId !== null}
                onClick={confirmDocumentDelete}
              >
                Delete file permanently
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
