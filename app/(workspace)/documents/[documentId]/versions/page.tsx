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

  const reload = () =>
    listVersions(documentId)
      .then(setVersions)
      .catch(() => setError("Version history is unavailable."));
  useEffect(() => {
    reload();
  }, [documentId]);
  const latest = versions.find((version) => version.is_latest);

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
    if (!latest || version.id === latest.id) return;
    try {
      setComparison(await compareVersions(documentId, version.id, latest.id));
    } catch {
      setError("Versions could not be compared.");
    }
  }

  return (
    <main className="shell">
      <a href="/dashboard">← Dashboard</a>
      <p className="eyebrow">VERSION HISTORY</p>
      <h1>Document versions</h1>
      <p className="muted">
        Every save, restore, and merge is recorded as a new immutable version.
        Nothing here overwrites history.
      </p>
      {error && (
        <p className="feedback error" role="alert">
          {error}
        </p>
      )}
      <label className="field">
        Local actor name{" "}
        <input
          value={actor}
          onChange={(event) => setActor(event.target.value)}
          maxLength={255}
        />
      </label>
      <section className="panel">
        {versions.length === 0 ? (
          <p className="muted">No versions exist yet.</p>
        ) : (
          <div className="version-list">
            {versions.map((version) => (
              <article
                key={version.id}
                className={
                  version.is_latest ? "version-row latest" : "version-row"
                }
              >
                <div>
                  <strong>
                    v{version.version_number}
                    {version.is_latest ? " · Latest" : ""}
                  </strong>
                  <small>
                    {new Date(version.created_at).toLocaleString()} ·{" "}
                    {version.created_by}
                  </small>
                  <p>{version.description || "No description supplied."}</p>
                </div>
                <div className="version-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      router.push(
                        `/documents/${documentId}/versions/${version.id}/edit?mode=view`,
                      )
                    }
                  >
                    View
                  </button>
                  <a className="button secondary" href={version.download_url}>
                    Download
                  </a>
                  <button
                    type="button"
                    className="secondary"
                    disabled={version.is_latest}
                    onClick={() => compare(version)}
                  >
                    Compare latest
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => restore(version)}
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(version);
                      setDescription(
                        version.is_latest
                          ? ""
                          : `Edited from v${version.version_number}`,
                      );
                    }}
                  >
                    Edit / Save new version
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      {comparison && (
        <section className="panel">
          <h2>
            v{comparison.base_version_number} → v
            {comparison.target_version_number}
          </h2>
          <p>
            {comparison.changed
              ? "Text and table changes detected."
              : "No textual changes detected."}
          </p>
          <pre className="diff">
            {comparison.diff.join("\n") || "No differences."}
          </pre>
        </section>
      )}
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
