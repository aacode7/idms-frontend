"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { extractionApi } from "../../lib/api/extractions";
import { errorMessage } from "../../lib/extraction";
import type { DocumentVersion, Job } from "../../types/contracts";
import {
  COLLECTION_GROUPS,
  type Collection,
  type ExtractionRevision,
  type PageQuery,
  type ProfileSnapshot,
} from "../../types/extractions";
import { JsonEvidence, NodeDetail, RecordBrowser } from "./records";

type View =
  | "outline"
  | "tree"
  | "tables"
  | "media"
  | "toc"
  | "identifiers"
  | "boundaries"
  | "diagnostics"
  | "all"
  | "profile";
const views: [View, string, Collection][] = [
  ["outline", "Outline", "headings"],
  ["tree", "Content tree", "nodes"],
  ["tables", "Tables", "tables"],
  ["media", "Images and drawings", "mediaAssets"],
  ["toc", "TOC and fields", "tocs"],
  ["identifiers", "Identifiers", "identifierOccurrences"],
  ["boundaries", "Delimiters and placeholders", "placeholders"],
  ["diagnostics", "Coverage and diagnostics", "diagnostics"],
  ["all", "All collections", "parts"],
  ["profile", "Pinned profile", "recognitionRules"],
];
const choices: Partial<Record<View, readonly Collection[]>> = {
  tables: ["tables", "rows", "cells"],
  media: ["mediaAssets", "imageOccurrences", "drawings", "alternatives"],
  toc: [
    "tocs",
    "tocEntries",
    "tocCandidates",
    "tocEntryChecks",
    "fields",
    "fieldSegments",
    "bookmarks",
    "hyperlinks",
    "references",
    "semanticLinks",
    "contentControls",
    "annotations",
    "customXmlStores",
  ],
  identifiers: [
    "identifierOccurrences",
    "identifierValues",
    "identifierReferences",
    "recognitionRules",
  ],
  boundaries: ["placeholders", "delimiters", "boundaryEvents", "blankGroups"],
  diagnostics: ["diagnostics", "coverage"],
};
const descriptions: Partial<Record<View, string>> = {
  outline:
    "Authored heading text and computed numbering are separate. Unresolved numbering remains unresolved. Turn off navigation-only to include non-navigation heading evidence.",
  tree: "Browse physical source containers and stories, including nested tables and supported text boxes. Select a node to inspect exact tokens, formatting and its source locator.",
  tables:
    "Inspect physical rows/cells, logical grid and merge evidence, widths and nested ownership. These records are structural evidence, not a rendered table facsimile.",
  media:
    "Assets are original embedded bytes; occurrences record each placement and container. No images are downloaded automatically. Geometry, crop and wrapping declarations are available in record JSON; original downloads are attachments.",
  toc: "Inspect authored field instructions, saved TOC entries, selectors and reference outcomes. Cached page labels are not current pagination; extraction does not update fields.",
  identifiers:
    "Business values, physical occurrences and references are distinct. Recognition uses the pinned organization's configured rules. Candidate, missing and ambiguous results retain their states.",
  boundaries:
    "Literal punctuation is preserved in source text. Treating < > { } ( ) or other characters as a grammar requires explicit configuration. Structural boundaries and placeholders remain separate.",
  diagnostics:
    "A completed extraction can have partial or unresolved semantic coverage. Inspect the affected part/node and source evidence before relying on a feature.",
};

export default function ExtractionInspector() {
  const { documentId } = useParams<{ documentId: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const versionId = params.get("version");
  const revisionId = params.get("revision");
  const [versions, setVersions] = useState<DocumentVersion[] | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const navigate = useCallback(
    (version: string, revision?: string) => {
      const query = new URLSearchParams({ version });
      if (revision) query.set("revision", revision);
      router.replace(
        `/documents/${encodeURIComponent(documentId)}/extraction?${query}`,
        { scroll: false },
      );
    },
    [router, documentId],
  );

  useEffect(() => {
    const controller = new AbortController();
    setVersions(null);
    setError("");
    extractionApi
      .versions(documentId, controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) setVersions(items);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(errorMessage(error));
      });
    return () => controller.abort();
  }, [documentId, refresh]);
  useEffect(() => {
    if (versions?.length && !versionId)
      navigate((versions.find((v) => v.is_latest) ?? versions[0]).id);
  }, [versions, versionId, navigate]);
  const version = versions?.find((v) => v.id === versionId);

  return (
    <main className="workspace-shell ex-shell">
      <header className="workspace-header ex-header">
        <div>
          <a
            className="workspace-back"
            href={`/documents/${encodeURIComponent(documentId)}/versions`}
          >
            ← Version history
          </a>
          <p className="eyebrow">DOCUMENT EVIDENCE</p>
          <h1>Extraction inspector</h1>
          <p className="ex-intro">
            Explore the exact content and structure of an immutable DOCX
            version.
          </p>
        </div>
        <span className="ex-tag">READ ONLY</span>
      </header>
      <p className="ex-notice">
        This view shows extracted source facts and tested interpretations. It
        does not reproduce Word page layout or certify every document feature.
        Publication and semantic coverage are reported separately.
      </p>
      {error ? (
        <div role="alert" className="feedback error">
          <p>{error}</p>
          <button onClick={() => setRefresh((n) => n + 1)}>
            Retry versions
          </button>
        </div>
      ) : !versions ? (
        <p role="status">Loading immutable versions…</p>
      ) : versions.length === 0 ? (
        <p className="ex-empty">This document has no saved versions.</p>
      ) : (
        <>
          <label className="ex-control">
            Source version
            <select
              value={versionId ?? ""}
              onChange={(e) => navigate(e.target.value)}
            >
              <option value="" disabled>
                Select a version
              </option>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  Version {v.version_number}
                  {v.is_latest ? " · latest at load" : ""} ·{" "}
                  {v.description || v.id}
                </option>
              ))}
            </select>
          </label>
          {versionId && !version ? (
            <p role="alert" className="feedback error">
              The requested version does not belong to this document. Select an
              available version.
            </p>
          ) : (
            version && (
              <VersionInspection
                key={`${documentId}:${version.id}`}
                documentId={documentId}
                version={version}
                revisionId={revisionId}
                navigate={navigate}
              />
            )
          )}
        </>
      )}
    </main>
  );
}

function VersionInspection({
  documentId,
  version,
  revisionId,
  navigate,
}: {
  documentId: string;
  version: DocumentVersion;
  revisionId: string | null;
  navigate: (version: string, revision?: string) => void;
}) {
  const [revisions, setRevisions] = useState<ExtractionRevision[] | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [profile, setProfile] = useState("default");
  const [approved, setApproved] = useState<ProfileSnapshot | null>(null);
  const [starting, setStarting] = useState(false);
  const action = useRef<AbortController | null>(null);
  useEffect(() => () => action.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    setRevisions(null);
    extractionApi
      .revisions(version.id, controller.signal)
      .then((result) => {
        if (
          result.versionId !== version.id ||
          result.items.some(
            (r) => r.versionId !== version.id || r.documentId !== documentId,
          )
        )
          throw new Error(
            "Revision list does not match the selected source version.",
          );
        if (!controller.signal.aborted) {
          setRevisions(result.items);
          if (!revisionId && result.items.length)
            navigate(version.id, result.items[0].analysisRevisionId);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(errorMessage(error));
      });
    return () => controller.abort();
  }, [version.id, documentId, refresh, navigate, revisionId]);

  async function start(event: FormEvent) {
    event.preventDefault();
    action.current?.abort();
    const controller = new AbortController();
    action.current = controller;
    setStarting(true);
    setError("");
    try {
      const result = await extractionApi.start(
        version.id,
        profile,
        controller.signal,
      );
      if (result.documentId !== documentId || result.versionId !== version.id)
        throw new Error(
          "The accepted revision does not match this source version.",
        );
      if (!controller.signal.aborted) {
        setRefresh((n) => n + 1);
        navigate(version.id, result.analysisRevisionId);
      }
    } catch (error) {
      if (!controller.signal.aborted) setError(errorMessage(error));
    } finally {
      if (!controller.signal.aborted) setStarting(false);
    }
  }
  async function inspectApproved() {
    action.current?.abort();
    const controller = new AbortController();
    action.current = controller;
    setError("");
    setApproved(null);
    try {
      const result = await extractionApi.approvedProfile(
        profile,
        controller.signal,
      );
      if (!controller.signal.aborted) setApproved(result);
    } catch (error) {
      if (!controller.signal.aborted) setError(errorMessage(error));
    }
  }

  return (
    <>
      <section
        className="ex-version-controls"
        aria-label="Extraction selection"
      >
        <label className="ex-control">
          Extraction revision
          <select
            aria-label="Extraction revision"
            value={revisionId ?? ""}
            onChange={(e) => navigate(version.id, e.target.value)}
          >
            <option value="" disabled>
              {revisions?.length === 0
                ? "No extraction yet"
                : "Select a revision"}
            </option>
            {revisionId &&
              !revisions?.some((r) => r.analysisRevisionId === revisionId) && (
                <option value={revisionId}>Pinned revision {revisionId}</option>
              )}
            {revisions?.map((r) => (
              <option key={r.analysisRevisionId} value={r.analysisRevisionId}>
                {r.profileId} · {r.status} · {r.analysisRevisionId}
              </option>
            ))}
          </select>
        </label>
        <button className="secondary" onClick={() => setRefresh((n) => n + 1)}>
          Refresh revision list
        </button>
      </section>
      <form className="ex-request" onSubmit={start}>
        <label className="ex-control">
          Approved profile ID
          <input
            aria-label="Approved profile ID"
            value={profile}
            maxLength={80}
            pattern="[A-Za-z0-9_.-]+"
            required
            disabled={starting}
            onChange={(e) => {
              setProfile(e.target.value);
              setApproved(null);
            }}
          />
        </label>
        <button
          type="button"
          className="secondary"
          disabled={starting || !profile}
          onClick={inspectApproved}
        >
          Inspect approved profile
        </button>
        <button disabled={starting}>
          {starting ? "Requesting…" : "Request extraction"}
        </button>
        <p className="ex-help">
          Identical requests reuse a revision. A changed parser/profile creates
          a new interpretation; saved versions stay immutable.
        </p>
      </form>
      {approved && (
        <div className="ex-profile-preview">
          <p>
            Currently approved profile: <strong>{approved.profileId}</strong>.
            This may differ from a previously pinned revision.
          </p>
          <code>{approved.profileDigest}</code>
          <JsonEvidence
            value={approved.profile}
            label="approved profile JSON"
          />
        </div>
      )}
      {error && (
        <div className="feedback error" role="alert">
          <p>{error}</p>
          <button
            className="secondary"
            onClick={() => setRefresh((n) => n + 1)}
          >
            Retry revision list
          </button>
        </div>
      )}
      {revisions?.length === 100 && (
        <p className="ex-help">
          Showing the most recent 100 revisions. Older pinned revision URLs
          remain accessible.
        </p>
      )}
      {!revisionId && revisions?.length === 0 && (
        <p className="ex-empty">
          No extraction exists for this exact version. Request one with an
          approved profile.
        </p>
      )}
      {!revisionId && !revisions && !error && (
        <p role="status">Loading extraction revisions…</p>
      )}
      {revisionId && (
        <PinnedInspection
          key={revisionId}
          revisionId={revisionId}
          documentId={documentId}
          versionId={version.id}
        />
      )}
    </>
  );
}

function PinnedInspection({
  revisionId,
  documentId,
  versionId,
}: {
  revisionId: string;
  documentId: string;
  versionId: string;
}) {
  const [pin, setPin] = useState<ExtractionRevision | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState("");
  const [jobError, setJobError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    setError("");
    async function poll() {
      try {
        const result = await extractionApi.revision(
          revisionId,
          controller.signal,
        );
        if (
          result.analysisRevisionId !== revisionId ||
          result.documentId !== documentId ||
          result.versionId !== versionId
        )
          throw new Error(
            "This revision does not belong to the selected document/version. No records will be displayed.",
          );
        if (controller.signal.aborted) return;
        setPin(result);
        if (result.jobId) {
          try {
            const nextJob = await extractionApi.job(
              result.jobId,
              controller.signal,
            );
            if (!controller.signal.aborted) {
              setJob(nextJob);
              setJobError("");
            }
          } catch {
            if (!controller.signal.aborted)
              setJobError(
                "Job stage is unavailable. The revision lifecycle remains authoritative.",
              );
          }
        }
        if (
          !controller.signal.aborted &&
          !["completed", "failed"].includes(result.status)
        )
          timer = setTimeout(poll, 3000);
      } catch (error) {
        if (!controller.signal.aborted) {
          setError(errorMessage(error));
          setPin(null);
        }
      }
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [revisionId, documentId, versionId, refresh]);
  return (
    <section aria-label="Pinned extraction">
      <div className="ex-browser-heading">
        <h2>Selected extraction</h2>
        <button className="secondary" onClick={() => setRefresh((n) => n + 1)}>
          Refresh status
        </button>
      </div>
      {error && (
        <p role="alert" className="feedback error">
          {error} Status polling is paused; use Refresh status to retry.
        </p>
      )}
      {!pin && !error && <p role="status">Loading pinned extraction…</p>}
      {pin && (
        <>
          <div className="ex-status-strip" role="status">
            <span className={`ex-tag ${pin.status}`}>{pin.status}</span>
            <span>
              Publication: <strong>{pin.publicationStatus}</strong>
            </span>
            <span>
              Coverage:{" "}
              <strong>{pin.coverageStatus ?? "Not available yet"}</strong>
            </span>
            <span>Attempts: {pin.attemptCount} / 3</span>
            {job && <span>Stage: {job.stage}</span>}
          </div>
          {jobError && <p className="ex-help">{jobError}</p>}
          {pin.status === "retry_wait" && (
            <p className="ex-notice">
              The worker will retry automatically. Earliest retry:{" "}
              {pin.retryAfter
                ? new Date(pin.retryAfter).toLocaleString()
                : "pending recovery"}
              . Error: {pin.errorCode ?? "not reported"}.
            </p>
          )}
          {pin.status === "failed" && (
            <p className="feedback error" role="alert">
              Extraction failed: {pin.errorCode ?? "unknown error"}. No
              completed artifacts were published. This revision has no manual
              reset endpoint; another identical request will reuse it. Correct
              source/configuration or request a different approved
              interpretation.
            </p>
          )}
          {pin.status === "queued" && (
            <p className="ex-help">
              Waiting for dispatch and worker claim. The extraction dispatcher
              and Celery worker must be running.
            </p>
          )}
          <dl className="ex-identity">
            <div>
              <dt>Version</dt>
              <dd>{pin.versionId}</dd>
            </div>
            <div>
              <dt>Revision</dt>
              <dd>{pin.analysisRevisionId}</dd>
            </div>
            <div>
              <dt>Source SHA-256</dt>
              <dd>{pin.sourceHash}</dd>
            </div>
            <div>
              <dt>Parser build</dt>
              <dd>{pin.parserBuildId}</dd>
            </div>
            <div>
              <dt>Profile</dt>
              <dd>
                {pin.profileId} · {pin.supportProfileVersion}
              </dd>
            </div>
            <div>
              <dt>Profile digest</dt>
              <dd>{pin.profileDigest}</dd>
            </div>
            <div>
              <dt>Schema / identity</dt>
              <dd>
                {pin.schemaVersion} / {pin.identityVersion}
              </dd>
            </div>
          </dl>
          {pin.status === "completed" &&
          pin.publicationStatus === "complete" ? (
            <CompletedInspection key={pin.extractionKey} pin={pin} />
          ) : (
            <p className="ex-empty">
              Detail records become available only after validated publication.
              Older completed revisions remain selectable above.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function PinnedProfile({ pin }: { pin: ExtractionRevision }) {
  const [profile, setProfile] = useState<ProfileSnapshot | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    extractionApi
      .profile(pin.analysisRevisionId, controller.signal)
      .then((result) => {
        if (
          result.analysisRevisionId !== pin.analysisRevisionId ||
          result.versionId !== pin.versionId ||
          result.profileDigest !== pin.profileDigest
        )
          throw new Error(
            "Profile snapshot does not match the selected revision.",
          );
        if (!controller.signal.aborted) setProfile(result);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(errorMessage(error));
      });
    return () => controller.abort();
  }, [pin.analysisRevisionId, pin.versionId, pin.profileDigest, refresh]);
  return (
    <section>
      <h2>Pinned interpretation profile</h2>
      <p>
        This is the immutable snapshot used for this extraction, including
        recognition grammars, business-ID rules and resource budgets. Changing
        the current server registry does not change this snapshot.
      </p>
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button onClick={() => setRefresh((n) => n + 1)}>
            Retry profile
          </button>
        </div>
      ) : profile ? (
        <JsonEvidence value={profile.profile} label="pinned profile JSON" />
      ) : (
        <p role="status">Loading pinned profile…</p>
      )}
    </section>
  );
}

function CompletedInspection({ pin }: { pin: ExtractionRevision }) {
  const [view, setView] = useState<View>("outline");
  const [collection, setCollection] = useState<Collection>("headings");
  const [override, setOverride] = useState<PageQuery | null>(null);
  const [node, setNode] = useState<string | null>(null);
  const [navigationOnly, setNavigationOnly] = useState(true);
  const [filterDraft, setFilterDraft] = useState("");
  const [filterKind, setFilterKind] = useState("owner_node_id");
  const [filter, setFilter] = useState<Record<string, string>>({});
  const selectView = (next: View) => {
    setView(next);
    setCollection(views.find((v) => v[0] === next)![2]);
    setOverride(null);
    setNode(null);
    setFilter({});
    setFilterDraft("");
    setFilterKind(next === "tree" ? "parent_node_id" : "owner_node_id");
  };
  const browse = (query: PageQuery) => {
    setOverride(query);
    setNode(null);
  };
  const query: PageQuery =
    override ??
    (view === "outline"
      ? {
          route: "outline",
          collection: "headings",
          filters: { navigation_only: String(navigationOnly) },
        }
      : view === "tree"
        ? {
            route: "nodes",
            collection: "nodes",
            filters: Object.keys(filter).length ? filter : { roots: "true" },
          }
        : { route: "collections", collection, filters: filter });
  return (
    <div className="ex-completed">
      <details className="ex-summary">
        <summary>Counts and diagnostic summary</summary>
        <p>
          Counts retain their engine-defined scope. Asset count and placement
          count describe different things.
        </p>
        <dl className="ex-facts">
          {Object.entries(pin.summary.counts ?? {}).map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <JsonEvidence value={pin.summary} label="summary JSON" />
      </details>
      <nav className="ex-tabs" aria-label="Extraction views">
        {views.map(([id, label]) => (
          <button
            key={id}
            aria-pressed={view === id}
            onClick={() => selectView(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {view === "profile" ? (
        <PinnedProfile pin={pin} />
      ) : (
        <>
          {descriptions[view] && (
            <p className="ex-view-description">{descriptions[view]}</p>
          )}
          {view === "outline" && !override && (
            <label className="ex-checkbox">
              <input
                type="checkbox"
                checked={navigationOnly}
                onChange={(e) => setNavigationOnly(e.target.checked)}
              />
              Navigation headings only
            </label>
          )}
          {(choices[view] || view === "all") && !override && (
            <label className="ex-control">
              Collection
              <select
                aria-label="Collection"
                value={collection}
                onChange={(e) => {
                  setCollection(e.target.value as Collection);
                  setFilter({});
                  setFilterDraft("");
                }}
              >
                {view === "all"
                  ? Object.entries(COLLECTION_GROUPS).map(([group, names]) => (
                      <optgroup key={group} label={group}>
                        {names.map((name) => (
                          <option key={name} value={name}>
                            {name} (
                            {pin.summary.collections?.[name]?.recordCount ??
                              "?"}
                            )
                          </option>
                        ))}
                      </optgroup>
                    ))
                  : choices[view]?.map((name) => (
                      <option key={name} value={name}>
                        {name} (
                        {pin.summary.collections?.[name]?.recordCount ?? "?"})
                      </option>
                    ))}
              </select>
            </label>
          )}
          {!override && view !== "outline" && (
            <form
              className="ex-filter"
              onSubmit={(event) => {
                event.preventDefault();
                setFilter(
                  filterDraft.trim()
                    ? { [filterKind]: filterDraft.trim() }
                    : {},
                );
              }}
            >
              <label className="ex-control">
                Filter by
                <select
                  aria-label="Filter type"
                  value={filterKind}
                  onChange={(e) => setFilterKind(e.target.value)}
                >
                  {(view === "tree"
                    ? [
                        ["parent_node_id", "Parent node ID"],
                        ["story_id", "Story ID"],
                      ]
                    : [
                        ["owner_node_id", "Owner node ID"],
                        ["run_node_id", "Run node ID"],
                        ["record_id", "Record ID"],
                      ]
                  ).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ex-control">
                Exact identifier
                <input
                  aria-label="Exact identifier"
                  maxLength={128}
                  value={filterDraft}
                  onChange={(e) => setFilterDraft(e.target.value)}
                />
              </label>
              <button className="secondary">Apply filter</button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setFilterDraft("");
                  setFilter({});
                }}
              >
                Clear filter
              </button>
            </form>
          )}
          {override && (
            <div className="ex-follow">
              <p>Following source structure · {override.collection}</p>
              <button className="secondary" onClick={() => setOverride(null)}>
                Back to {views.find((v) => v[0] === view)![1]}
              </button>
            </div>
          )}
          <div
            className={node ? "ex-content-grid has-node" : "ex-content-grid"}
          >
            <div>
              <RecordBrowser
                key={JSON.stringify(query)}
                pin={pin}
                query={query}
                onNode={setNode}
                onBrowse={browse}
              />
            </div>
            {node && (
              <NodeDetail
                key={node}
                pin={pin}
                nodeId={node}
                onNode={setNode}
                onClose={() => setNode(null)}
                onBrowse={browse}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
