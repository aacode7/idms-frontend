"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  createUploadIntent,
  deleteDocument,
  getJob,
  getProject,
  listDocuments,
  listVersions,
  removeMaster,
  selectMaster,
  startAnalysis,
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
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState("");
  const [documentToDelete, setDocumentToDelete] = useState<Document | null>(
    null,
  );
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(
    null,
  );
  const [analysisJobs, setAnalysisJobs] = useState<Record<string, string>>({});
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
    const entries = Object.entries(analysisJobs);
    if (!entries.length) return;
    const timer = window.setInterval(async () => {
      const results = await Promise.all(
        entries.map(async ([documentId, jobId]) => ({
          documentId,
          job: await getJob(jobId),
        })),
      );
      const complete = results.filter(
        ({ job }) => job.status === "completed" || job.status === "failed",
      );
      if (!complete.length) {
        setDocuments((current) =>
          current.map((document) => {
            const matching = results.find(
              (result) => result.documentId === document.id,
            );
            return matching
              ? {
                  ...document,
                  analysis_status:
                    matching.job.status === "running" ? "running" : "queued",
                }
              : document;
          }),
        );
        return;
      }
      const refreshed = await listDocuments(projectId);
      setDocuments(refreshed);
      setAnalysisJobs((current) => {
        const next = { ...current };
        complete.forEach(({ documentId }) => delete next[documentId]);
        return next;
      });
      const failed = complete.find(({ job }) => job.status === "failed");
      setActionError(
        failed
          ? "Analysis failed. Please retry that document."
          : "Analysis complete. You can now select sections in the merge workspace.",
      );
    }, 2000);
    return () => window.clearInterval(timer);
  }, [analysisJobs, projectId]);

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
        `${completed.length} document${completed.length === 1 ? "" : "s"} uploaded. Choose a master when ready.`,
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
  async function analyze(documentId: string) {
    try {
      const job = await startAnalysis(documentId);
      setAnalysisJobs((current) => ({ ...current, [documentId]: job.id }));
      setDocuments((current) =>
        current.map((document) =>
          document.id === documentId
            ? { ...document, analysis_status: "queued" }
            : document,
        ),
      );
      setActionError(
        "Analysis queued. This page will update automatically when it finishes.",
      );
    } catch {
      setActionError(
        "Analysis could not be queued. Ensure Redis/Celery is running.",
      );
    }
  }

  async function submitDocuments() {
    const pending = documents.filter(
      (document) =>
        document.role !== "generated" &&
        document.status === "uploaded" &&
        !["queued", "running", "completed"].includes(document.analysis_status),
    );
    if (!master) {
      setActionError(
        "Select a master document before submitting for analysis.",
      );
      return;
    }
    if (!pending.length) {
      setActionError("All documents have already been analyzed.");
      return;
    }
    setSubmitting(true);
    setActionError("");
    try {
      const jobs = await Promise.all(
        pending.map(
          async (document) =>
            [document.id, await startAnalysis(document.id)] as const,
        ),
      );
      setAnalysisJobs((current) => ({
        ...current,
        ...Object.fromEntries(
          jobs.map(([documentId, job]) => [documentId, job.id]),
        ),
      }));
      setDocuments((current) =>
        current.map((document) =>
          pending.some((item) => item.id === document.id)
            ? { ...document, analysis_status: "queued" }
            : document,
        ),
      );
      setActionError(
        "Analysis submitted for all documents. You can continue when it finishes.",
      );
    } catch {
      setActionError(
        "Analysis could not be submitted. Ensure Redis/Celery is running.",
      );
    } finally {
      setSubmitting(false);
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
  const workflowBusy = uploadInProgress || submitting;
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
    if (document.analysis_status === "completed") return "Analysis complete ✓";
    if (document.analysis_status === "running") return "Analyzing…";
    if (document.analysis_status === "queued") return "Analysis queued…";
    if (document.analysis_status === "failed") return "Analysis failed — retry";
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
          <div className="workflow-actions">
            <button
              type="button"
              onClick={submitDocuments}
              disabled={workflowBusy || !master}
            >
              {submitting ? "Submitting…" : "Submit & Analyze"}
            </button>
            <a
              className={`secondary ${!master || !allDocumentsAnalyzed ? "disabled-link" : ""}`}
              href={
                master && allDocumentsAnalyzed
                  ? `/projects/${projectId}/merge`
                  : undefined
              }
              aria-disabled={!master || !allDocumentsAnalyzed}
              onClick={(event) => {
                if (!master || !allDocumentsAnalyzed) event.preventDefault();
              }}
            >
              Next →
            </a>
          </div>
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
                      {document.analysis_status !== "queued" &&
                        document.analysis_status !== "running" &&
                        document.analysis_status !== "completed" && (
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => analyze(document.id)}
                          >
                            {document.analysis_status === "failed"
                              ? "Retry analysis"
                              : "Analyze"}
                          </button>
                        )}
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
                : `${master.filename} is the current master. Analyze all documents before composing a merge.`
              : "Upload your documents first, then select any one as the master."}
          </p>
          {master && (
            <div className="master-document">
              <strong>{master.filename}</strong>
              <small>{analysisLabel(master)}</small>
              {master.status === "uploaded" && (
                <span className="document-actions">
                  {master.analysis_status !== "queued" &&
                    master.analysis_status !== "running" &&
                    master.analysis_status !== "completed" && (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => analyze(master.id)}
                      >
                        {master.analysis_status === "failed"
                          ? "Retry analysis"
                          : "Analyze"}
                      </button>
                    )}
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
            <a href={`/projects/${projectId}/merge`}>Open merge workspace →</a>
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
