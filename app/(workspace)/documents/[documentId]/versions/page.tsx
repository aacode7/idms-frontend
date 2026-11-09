"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  compareVersions,
  listVersions,
  restoreVersion,
} from "../../../../../lib/api/projects";
import type {
  DocumentVersion,
  VersionComparison,
} from "../../../../../types/contracts";

export default function VersionsPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const router = useRouter();
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<DocumentVersion | null>(null);
  const [description, setDescription] = useState("");
  const [actor, setActor] = useState("Local user");
  const [comparison, setComparison] = useState<VersionComparison | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const latest = versions.find((version) => version.is_latest);
  const focused =
    versions.find((version) => version.id === focusedId) ??
    latest ??
    versions[0] ??
    null;

  const reload = () =>
    listVersions(documentId)
      .then(setVersions)
      .catch(() => setError("Version history is unavailable."));
  useEffect(() => {
    reload();
  }, [documentId]);
  function startEdit(event: FormEvent) {
    event.preventDefault();
    if (!selected || !latest) return;
    const query = new URLSearchParams({
      mode: "edit",
      expected: latest.id,
      description,
      actor,
    });
    router.push(
      `/documents/${documentId}/versions/${selected.id}/edit?${query}`,
    );
  }

  async function restore(version: DocumentVersion) {
    if (
      !latest ||
      !confirm(
        `Restore v${version.version_number} as a new version? Existing versions will remain unchanged.`,
      )
    )
      return;
    try {
      await restoreVersion(version.id, {
        expected_latest_version_id: latest.id,
        description: `Restored from v${version.version_number}`,
        created_by: actor,
      });
      setComparison(null);
      await reload();
    } catch {
      setError(
        "Restore could not be completed because a newer version may exist. Reload and try again.",
      );
    }
  }

  async function compare(version: DocumentVersion) {
    if (version.id === latest?.id) return;
    if (!latest) return;
    const latestVersion = latest;
    if (version.comparison) {
      setComparison(version.comparison);
      return;
    }
    try {
      setComparison(
        await compareVersions(documentId, version.id, latestVersion.id),
      );
    } catch {
      setError("Versions could not be compared.");
    }
  }

  return (
    <main className="workspace-shell">
      <header className="workspace-header">
        <div>
          <a href="/dashboard" className="workspace-back">
            ← Dashboard
          </a>
          <p className="eyebrow">DOCUMENT WORKSPACE</p>
          <h1>Document library</h1>
        </div>
        <span className="workspace-status">● All changes are versioned</span>
      </header>
      {error && (
        <p className="feedback error" role="alert">
          {error}
        </p>
      )}
      <div className="notebook-layout">
        <aside className="notebook-pane source-pane">
          <div className="pane-heading">
            <div>
              <p className="eyebrow">SOURCES</p>
              <h2>Uploaded documents</h2>
            </div>
            <span className="count-badge">{versions.length}</span>
          </div>
          <p className="pane-help">Your original files and saved versions.</p>
          {versions.length === 0 ? (
            <p className="muted">No versions exist yet.</p>
          ) : (
            <div className="version-list">
              {versions.map((version) => (
                <article
                  key={version.id}
                  onClick={() => setFocusedId(version.id)}
                  className={`version-row ${version.is_latest ? "latest" : ""} ${focused?.id === version.id ? "active" : ""}`}
                >
                  <div>
                    <strong>
                      {version.is_latest
                        ? "Master document"
                        : `Document version ${version.version_number}`}
                    </strong>
                    <small>
                      v{version.version_number} ·{" "}
                      {new Date(version.created_at).toLocaleDateString()}
                    </small>
                  </div>
                </article>
              ))}
            </div>
          )}
        </aside>
        <section className="notebook-pane document-pane">
          <p className="eyebrow">DOCUMENT PREVIEW</p>
          <div className="document-title-row">
            <div>
              <h2>
                {focused
                  ? `Version ${focused.version_number}`
                  : "No document selected"}
              </h2>
              <p className="muted">
                {focused?.description ||
                  "Select a source to inspect its details."}
              </p>
            </div>
            {focused?.is_latest && <span className="master-pill">MASTER</span>}
          </div>
          <div className="document-canvas">
            {focused ? (
              <>
                <div className="canvas-icon">DOCX</div>
                <h3>
                  {focused.is_latest
                    ? "Master document"
                    : `Saved version ${focused.version_number}`}
                </h3>
                <p>
                  This version is immutable. Open it in the editor to inspect or
                  create a new version.
                </p>
                <span className="canvas-meta">
                  Created {new Date(focused.created_at).toLocaleString()} by{" "}
                  {focused.created_by}
                </span>
              </>
            ) : (
              <p className="muted">Your selected document will appear here.</p>
            )}
          </div>
          {comparison && (
            <div className="comparison-card">
              <h3>
                v{comparison.base_version_number} → v
                {comparison.target_version_number}
              </h3>
              <p>
                {comparison.changed
                  ? "Text and table changes detected."
                  : "No textual changes detected."}
              </p>
              <div className="diff" role="region" aria-label="Version changes">
                {comparison.diff.length ? (
                  comparison.diff.map((line, index) => {
                    const added =
                      line.startsWith("+") && !line.startsWith("+++");
                    const removed =
                      line.startsWith("-") && !line.startsWith("---");
                    return (
                      <div
                        className={`diff-line ${added ? "added" : ""} ${removed ? "removed" : ""}`}
                        key={`${index}-${line}`}
                      >
                        <span className="diff-marker" aria-hidden="true">
                          {added ? "+" : removed ? "−" : " "}
                        </span>
                        <span>{line}</span>
                      </div>
                    );
                  })
                ) : (
                  <div className="diff-empty">No differences.</div>
                )}
              </div>
            </div>
          )}
        </section>
        <aside className="notebook-pane actions-pane">
          <p className="eyebrow">SELECTED SOURCE</p>
          <h2>
            {focused ? `Version ${focused.version_number}` : "Nothing selected"}
          </h2>
          <div className="action-stack">
            <button
              type="button"
              onClick={() =>
                focused &&
                router.push(
                  `/documents/${documentId}/versions/${focused.id}/edit?mode=view`,
                )
              }
              disabled={!focused}
            >
              Open document
            </button>
            <a className="button secondary" href={focused?.download_url}>
              Download file
            </a>
            <button
              type="button"
              className="secondary"
              disabled={!focused || focused.is_latest}
              onClick={() => focused && compare(focused)}
            >
              View changes from previous version
            </button>
            <button
              type="button"
              className="secondary"
              disabled={!focused}
              onClick={() => focused && restore(focused)}
            >
              Restore as new version
            </button>
          </div>
          <label className="field actor-field">
            Editor name
            <input
              value={actor}
              onChange={(event) => setActor(event.target.value)}
              maxLength={255}
            />
          </label>
          <button
            type="button"
            className="save-version"
            disabled={!focused}
            onClick={() => {
              if (focused) {
                setSelected(focused);
                setDescription(
                  focused.is_latest
                    ? ""
                    : `Edited from v${focused.version_number}`,
                );
              }
            }}
          >
            Edit & save new version
          </button>
        </aside>
      </div>
      {selected && (
        <div className="dialog-backdrop" role="presentation">
          <form className="dialog" onSubmit={startEdit}>
            <h2>Save as a New Version?</h2>
            <p>
              You are editing v{selected.version_number}. Saving creates a new
              immutable version; the current version will never be overwritten.
            </p>
            <p>
              Current version: <strong>v{latest?.version_number}</strong> · New
              version: <strong>v{(latest?.version_number ?? 0) + 1}</strong>
            </p>
            <label className="field">
              Version description (optional)
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={1000}
              />
            </label>
            <div className="dialog-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setSelected(null)}
              >
                Cancel
              </button>
              <button type="submit">Open editor</button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
