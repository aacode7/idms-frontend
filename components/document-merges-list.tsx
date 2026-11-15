"use client";

import { useEffect, useRef, useState } from "react";
import {
  deleteDocumentMerge,
  listDocumentMerges,
  mergeStageLabel,
} from "../lib/api/document-merges";
import type { DocumentMerge } from "../types/document-merges";

export function DocumentMergesList() {
  const [merges, setMerges] = useState<DocumentMerge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<DocumentMerge | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [notice, setNotice] = useState("");
  const deleteInFlight = useRef(false);
  const removedIds = useRef(new Set<string>());
  const actionButtons = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const values = await listDocumentMerges();
        if (!cancelled) {
          setMerges(
            values.filter((merge) => !removedIds.current.has(merge.id)),
          );
          setError("");
        }
      } catch {
        if (!cancelled)
          setError("Merged documents could not be loaded. Retrying…");
      } finally {
        if (!cancelled) {
          setLoading(false);
          timer = setTimeout(load, 6000);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  function closeDialog() {
    if (deleteInFlight.current) return;
    if (toDelete) actionButtons.current.get(toDelete.id)?.focus();
    setToDelete(null);
    setDeleteError("");
  }

  async function confirmDelete() {
    if (!toDelete || deleteInFlight.current) return;
    const selected = toDelete;
    deleteInFlight.current = true;
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteDocumentMerge(selected.id);
      removedIds.current.add(selected.id);
      setMerges((current) =>
        current.filter((merge) => merge.id !== selected.id),
      );
      setToDelete(null);
      setNotice(`“${selected.name}” was permanently deleted.`);
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : "The merged document could not be deleted. Please retry.",
      );
    } finally {
      deleteInFlight.current = false;
      setDeleting(false);
    }
  }
  return (
    <section
      className="dashboard-recent"
      aria-labelledby="document-merges-title"
    >
      <div className="recent-heading">
        <div>
          <p className="eyebrow">WHOLE DOCUMENT MERGES</p>
          <h2 id="document-merges-title">Merged documents</h2>
        </div>
        <span className="project-count">
          {merges.filter((m) => m.status === "completed").length} completed
        </span>
      </div>
      {loading && <p className="muted">Loading merged documents…</p>}
      {notice && (
        <p className="feedback" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="feedback error" role="alert">
          {error}
        </p>
      )}
      {!loading && !error && !merges.length && (
        <p className="empty">
          No merged documents yet. Use “Merge documents” to combine two DOCX
          files.
        </p>
      )}
      <div className="project-list">
        {merges.map((merge) => (
          <article className="project" key={merge.id}>
            <a className="project-open" href={`/document-merges/${merge.id}`}>
              <span className="project-file-icon" aria-hidden="true">
                ▤
              </span>
              <strong>{merge.name}</strong>
              <p>
                {merge.inputs.map((input) => input.filename).join(" + ") ||
                  "Upload two documents to get started"}
              </p>
              <span className="project-meta">
                <b>{mergeStageLabel(merge.status, merge.stage)}</b>
                <em>Open merge →</em>
              </span>
            </a>
            <button
              className="project-menu"
              type="button"
              ref={(button) => {
                if (button) actionButtons.current.set(merge.id, button);
                else actionButtons.current.delete(merge.id);
              }}
              aria-label={`Actions for merged document ${merge.name}`}
              aria-expanded={menuId === merge.id}
              aria-haspopup="menu"
              onClick={() =>
                setMenuId((current) => (current === merge.id ? null : merge.id))
              }
            >
              •••
            </button>
            {menuId === merge.id && (
              <div className="project-actions" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  disabled={
                    merge.status === "queued" || merge.status === "running"
                  }
                  title={
                    merge.status === "queued" || merge.status === "running"
                      ? "Wait for this merge to finish before deleting it."
                      : undefined
                  }
                  onClick={() => {
                    setMenuId(null);
                    setDeleteError("");
                    setNotice("");
                    setToDelete(merge);
                  }}
                >
                  Delete merged document
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
      {toDelete && (
        <div className="delete-backdrop" role="presentation">
          <section
            className="delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-document-merge-title"
            aria-describedby="delete-document-merge-description"
            aria-busy={deleting}
            onKeyDown={(event) => {
              if (event.key === "Escape") closeDialog();
              if (event.key === "Tab") {
                const buttons = Array.from(
                  event.currentTarget.querySelectorAll<HTMLButtonElement>(
                    "button:not(:disabled)",
                  ),
                );
                const first = buttons[0],
                  last = buttons[buttons.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                  event.preventDefault();
                  last?.focus();
                }
                if (!event.shiftKey && document.activeElement === last) {
                  event.preventDefault();
                  first?.focus();
                }
              }
            }}
          >
            <p className="eyebrow">PERMANENT DELETION</p>
            <h2 id="delete-document-merge-title">Delete “{toDelete.name}”?</h2>
            <p id="delete-document-merge-description">
              This permanently deletes this merge, its uploaded copies of both
              source documents, the merged document, and all saved versions and
              associated files. Files on your computer and other projects are
              unaffected. This cannot be undone.
            </p>
            {deleteError && (
              <p className="delete-error" role="alert">
                {deleteError}
              </p>
            )}
            <div>
              <button
                className="secondary"
                type="button"
                disabled={deleting}
                autoFocus
                onClick={closeDialog}
              >
                Cancel
              </button>
              <button
                className="danger"
                type="button"
                disabled={deleting}
                onClick={() => void confirmDelete()}
              >
                {deleting && (
                  <span className="button-spinner" aria-hidden="true" />
                )}
                {deleting ? "Deleting permanently…" : "Delete permanently"}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
