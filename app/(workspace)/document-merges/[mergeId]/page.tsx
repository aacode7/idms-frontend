"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  documentMergeDownloadUrl,
  getDocumentMerge,
  mergeStageLabel,
  startDocumentMerge,
} from "../../../../lib/api/document-merges";
import { createUploadIntent, uploadDocx } from "../../../../lib/api/projects";
import { fileSha256 } from "../../../../lib/file-checksum";
import type { DocumentMerge } from "../../../../types/document-merges";

// Progress follows completed worker phases, rather than elapsed time.
function mergePercentage(merge: DocumentMerge) {
  if (merge.status === "completed") return 100;
  return (
    {
      queued: 0,
      parsing: 0,
      merging: 25,
      refreshing_toc: 50,
      persisting: 75,
    } as Record<string, number>
  )[merge.stage];
}

export default function DocumentMergePage() {
  const { mergeId } = useParams<{ mergeId: string }>();
  const [merge, setMerge] = useState<DocumentMerge | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const uploadLock = useRef(false);
  const startLock = useRef(false);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const value = await getDocumentMerge(mergeId);
        if (cancelled) return;
        setMerge(value);
        setOrder((current) =>
          current.length
            ? current
            : value.inputs
                .filter((i) => i.status === "uploaded")
                .map((i) => i.version_id),
        );
        setError("");
        if (value.status === "queued" || value.status === "running")
          timer = setTimeout(load, 2000);
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "The merge could not be loaded.",
          );
          timer = setTimeout(load, 5000);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [mergeId, busy]);

  async function upload(file: File | undefined) {
    if (!file || !merge || uploadLock.current) return;
    if (!file.name.toLowerCase().endsWith(".docx") || file.size === 0) {
      setError("Choose a non-empty DOCX file.");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setError("Choose a DOCX file smaller than 25 MB.");
      return;
    }
    uploadLock.current = true;
    setUploading(true);
    setError("");
    setUploadMessage(`Uploading ${file.name}…`);
    try {
      const checksum = await fileSha256(file);
      const intent = await createUploadIntent(
        mergeId,
        file,
        checksum,
        "source",
      );
      const document = await uploadDocx(file, intent);
      setOrder((current) => [...current, document.version_id].slice(0, 2));
      setMerge(await getDocumentMerge(mergeId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Please retry.");
    } finally {
      uploadLock.current = false;
      setUploading(false);
      setUploadMessage("");
    }
  }

  async function start() {
    if (startLock.current || order.length !== 2) return;
    startLock.current = true;
    setBusy(true);
    setError("");
    try {
      setMerge(await startDocumentMerge(mergeId, order));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The merge could not be started.",
      );
    } finally {
      startLock.current = false;
      setBusy(false);
    }
  }
  const ready = merge?.status === "completed";
  const percentage = merge ? mergePercentage(merge) : undefined;
  const processing = merge?.status === "queued" || merge?.status === "running";
  const inputs = order
    .map((id) => merge?.inputs.find((i) => i.version_id === id))
    .filter((i) => i !== undefined);
  const viewUrl =
    merge?.document_id && merge?.version_id
      ? `/documents/${merge.document_id}/versions/${merge.version_id}/edit?mode=view&returnTo=${encodeURIComponent(`/document-merges/${mergeId}`)}`
      : "";

  return (
    <main className="dashboard-shell document-merge-shell">
      <div className="document-merge-nav">
        <a className="merge-back-link" href="/dashboard">
          ← Your document studio
        </a>
        <a href="/document-merges/new">New merge</a>
      </div>
      <section
        className="dashboard-card document-merge-card"
        aria-busy={uploading || busy || processing}
      >
        <p className="eyebrow">MERGE DOCUMENTS</p>
        <h1>{merge?.name ?? "Loading document merge…"}</h1>
        {error && (
          <p className="feedback error" role="alert">
            {error}
          </p>
        )}
        {merge && (
          <>
            <p className="merge-status" role="status">
              {uploadMessage || mergeStageLabel(merge.status, merge.stage)}
            </p>
            {merge.status === "failed" && (
              <p className="feedback error" role="alert">
                {merge.error_message ||
                  "The merge failed. You can retry with the same documents."}
              </p>
            )}
            {!ready && !processing && (
              <p>
                Add two complete DOCX documents in the order you want them
                merged. Each existing TOC stays in place and updates using its
                original scope and the final page locations.
              </p>
            )}
            <ol className="document-merge-inputs">
              {inputs.map((input, index) => (
                <li key={input.version_id}>
                  <span className="merge-order">{index + 1}</span>
                  <div>
                    <strong>{input.filename}</strong>
                    <small>
                      {index === 0
                        ? "First document"
                        : "Appended after the first document"}
                    </small>
                  </div>
                  <span className="project-count">Uploaded</span>
                </li>
              ))}
            </ol>
            {!ready && !processing && order.length < 2 && (
              <label className="document-merge-upload">
                <strong>
                  {order.length === 0
                    ? "Add first document"
                    : "Add second document"}
                </strong>
                <span>DOCX · Up to 25 MB per document</span>
                <input
                  type="file"
                  accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  aria-label={
                    order.length === 0
                      ? "First DOCX document"
                      : "Second DOCX document"
                  }
                  disabled={uploading || busy}
                  onChange={(e) => {
                    void upload(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
            {!ready && !processing && (
              <div className="document-merge-actions">
                {order.length === 2 && (
                  <button
                    className="secondary"
                    disabled={busy || uploading}
                    onClick={() =>
                      setOrder((current) => [...current].reverse())
                    }
                  >
                    Swap document order
                  </button>
                )}
                <button
                  disabled={order.length !== 2 || uploading || busy}
                  onClick={() => void start()}
                >
                  {busy
                    ? "Starting…"
                    : merge.status === "failed"
                      ? "Retry merge"
                      : "Merge documents"}
                </button>
              </div>
            )}
            {(processing || ready) && (
              <div className="document-merge-progress">
                <div className="document-merge-progress-heading">
                  <strong id="document-merge-progress-label">
                    Merge progress
                  </strong>
                  <span>
                    {percentage === undefined
                      ? "Processing…"
                      : `${percentage}%`}
                  </span>
                </div>
                <progress
                  max={100}
                  value={percentage}
                  aria-labelledby="document-merge-progress-label"
                  aria-valuetext={
                    percentage === undefined
                      ? mergeStageLabel(merge.status, merge.stage)
                      : `${percentage}%`
                  }
                />
              </div>
            )}
            {ready && (
              <>
                <p>
                  Your merged document is ready. {merge.heading_count ?? 0}{" "}
                  numbered headings processed.{" "}
                  {merge.toc_count
                    ? `${merge.toc_count} table${merge.toc_count === 1 ? "" : "s"} of contents refreshed in place.`
                    : "No table of contents was present."}
                </p>
                <div className="document-merge-actions">
                  <a className="merge-primary-link" href={viewUrl}>
                    View document
                  </a>
                  <a
                    className="merge-download-link"
                    href={documentMergeDownloadUrl(mergeId)}
                  >
                    Download DOCX
                  </a>
                </div>
              </>
            )}
          </>
        )}
      </section>
    </main>
  );
}
