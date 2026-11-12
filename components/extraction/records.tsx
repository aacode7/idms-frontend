"use client";

import { useEffect, useRef, useState } from "react";
import { extractionApi } from "../../lib/api/extractions";
import {
  assertPinnedPage,
  automaticLabelText,
  codePointSlice,
  errorMessage,
  fields,
  object,
  recordId,
  text,
} from "../../lib/extraction";
import type {
  ExtractionPage,
  ExtractionRecord,
  ExtractionRevision,
  PageQuery,
} from "../../types/extractions";

function MediaDownload({
  pin,
  asset,
  byteCount,
}: {
  pin: ExtractionRevision;
  asset: string;
  byteCount: number;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function download() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        extractionApi.mediaUrl(pin.analysisRevisionId, asset),
        { signal: controller.signal, cache: "no-store" },
      );
      if (!response.ok)
        throw new Error(
          `Original asset could not be downloaded (${response.status}). No unverified download was saved.`,
        );
      const blob = await response.blob();
      if (blob.size !== byteCount)
        throw new Error(
          "Original asset byte count does not match the extraction record.",
        );
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(
        new Blob([blob], { type: "application/octet-stream" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${asset}.bin`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      if (!controller.signal.aborted) setError(errorMessage(error));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <div>
      <button className="secondary" disabled={busy} onClick={download}>
        {busy ? "Downloading original…" : "Download original asset"}
      </button>
      {error && (
        <p role="alert" className="feedback error">
          {error}
        </p>
      )}
    </div>
  );
}

export function JsonEvidence({
  value,
  label = "Source record JSON",
}: {
  value: unknown;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const serialized = open ? JSON.stringify(value, null, 2) : "";
  return (
    <div className="ex-json">
      <button
        className="secondary"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? "Hide" : "Show"} {label}
      </button>
      {open && (
        <>
          <pre>{serialized.slice(0, 64000)}</pre>
          {serialized.length > 64000 && (
            <p>JSON preview is limited to 64,000 characters.</p>
          )}
          <button
            className="secondary"
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([serialized], { type: "application/json" }),
              );
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = "extraction-evidence.json";
              anchor.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            Download full JSON
          </button>
        </>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: unknown }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {typeof value === "object" ? JSON.stringify(value) : String(value)}
      </dd>
    </div>
  );
}

function SpanEvidence({
  record,
  pin,
}: {
  record: ExtractionRecord;
  pin: ExtractionRevision;
}) {
  const [state, setState] = useState<{
    value?: string;
    error?: string;
    loading?: boolean;
  }>({});
  const [enabled, setEnabled] = useState(false);
  const raw = fields(record).spans;
  const spans = Array.isArray(raw) ? raw : [];
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setState({ loading: true });
    async function resolve() {
      if (spans.length > 20)
        throw new Error(
          "This occurrence has more than 20 spans. Inspect the full span list in JSON and use token filters for additional spans.",
        );
      const tokens = new Map<string, ExtractionRecord>();
      let value = "";
      for (const span of spans) {
        const s = object(span);
        const id = text(s.tokenId);
        if (!tokens.has(id)) {
          const page = await extractionApi.page(
            pin.analysisRevisionId,
            {
              route: "collections",
              collection: "tokens",
              filters: { record_id: id },
            },
            null,
            controller.signal,
          );
          assertPinnedPage(page, pin, "tokens");
          if (page.items.length !== 1 || text(page.items[0].tokenId) !== id)
            throw new Error("The source token could not be resolved uniquely.");
          tokens.set(id, page.items[0]);
        }
        const token = tokens.get(id)!;
        if (
          s.runId !== token.runId ||
          typeof s.start !== "number" ||
          typeof s.end !== "number"
        )
          throw new Error("Source span ownership is inconsistent.");
        value += codePointSlice(text(token.value), s.start, s.end);
      }
      if (!controller.signal.aborted) setState({ value });
    }
    resolve().catch((error) => {
      if (!controller.signal.aborted) setState({ error: errorMessage(error) });
    });
    return () => controller.abort();
    // A record card is keyed by its pinned source identity, so this request
    // belongs to the mount and is cancelled on page/revision changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
  if (!spans.length) return null;
  return (
    <div className="ex-spans">
      <button
        className="secondary"
        onClick={() => setEnabled(!enabled)}
        aria-expanded={enabled}
      >
        {enabled ? "Hide" : "Inspect"} source spans ({spans.length})
      </button>
      {enabled && (
        <>
          {state.loading && <p role="status">Resolving source tokens…</p>}
          {state.error && (
            <p role="alert" className="feedback error">
              {state.error}
            </p>
          )}
          {state.value !== undefined && (
            <>
              <p>Exact source span text · Unicode code-point offsets</p>
              <pre className="ex-exact">{state.value}</pre>
              {text(fields(record).rawValue) !== state.value && (
                <p className="feedback error">
                  Span text differs from the recorded raw value. Inspect the
                  evidence.
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

export function RecordCard({
  record,
  pin,
  onNode,
  onBrowse,
}: {
  record: ExtractionRecord;
  pin: ExtractionRevision;
  onNode?: (id: string) => void;
  onBrowse?: (query: PageQuery) => void;
}) {
  const r = fields(record);
  const type = text(record.recordType);
  const nodeId = text(r.nodeId);
  const isHeading = type === "heading";
  const main =
    text(r.authoredText) ||
    text(r.rawValue) ||
    text(r.message) ||
    text(r.cachedText) ||
    text(r.instructionText) ||
    text(r.feature) ||
    text(r.partName) ||
    text(r.kind) ||
    type;
  const asset = text(r.assetId);
  return (
    <article className="ex-record" data-record-id={recordId(record)}>
      <div className="ex-record-top">
        <span className="ex-tag">
          {type || "record"}
          {text(r.kind) && type !== text(r.kind) ? ` · ${text(r.kind)}` : ""}
        </span>
        {text(r.severity) && (
          <span className={`ex-tag ${text(r.severity)}`}>
            {text(r.severity)}
          </span>
        )}
      </div>
      {type === "token" ? (
        <>
          <p className="ex-help">
            Exact token value · {text(r.channel)} ·{" "}
            {String(r.codePointLength ?? "?")} code points
          </p>
          <pre className="ex-exact">{text(r.value) || ""}</pre>
          {text(r.value) === "" && (
            <p className="ex-help">Empty token; no text was invented.</p>
          )}
        </>
      ) : (
        <h3 className="ex-record-title">
          {main.slice(0, 1000)}
          {main.length > 1000 ? "… (preview)" : ""}
        </h3>
      )}
      {isHeading && (
        <dl className="ex-facts">
          <Fact label="Automatic label" value={automaticLabelText(r)} />
          <Fact label="Label status" value={r.labelStatus} />
          <Fact label="Heading level" value={r.headingLevel} />
          <Fact label="Heading status" value={r.headingStatus} />
          <Fact label="Navigation heading" value={r.isNavigationHeading} />
        </dl>
      )}
      {type === "numbering_label" && (
        <dl className="ex-facts">
          <Fact label="Automatic label" value={automaticLabelText(r)} />
          <Fact label="Resolution" value={r.labelStatus} />
          <Fact label="Format" value={r.numberFormat} />
          <Fact label="Counter event" value={r.counterEvent} />
          <Fact label="Issues" value={r.issues} />
        </dl>
      )}
      <dl className="ex-facts">
        {[
          "code",
          "extractionStatus",
          "semanticStatus",
          "referenceStatus",
          "confidence",
          "identifierType",
          "normalization",
          "grammarId",
          "cacheStatus",
          "cacheFreshness",
          "labelStatus",
          "selectorStatus",
          "isActive",
          "byteCount",
          "mediaHash",
          "contentType",
          "gridSpan",
          "logicalRow",
          "logicalColumn",
          "width",
          "height",
        ].map((key) => (
          <Fact key={key} label={key} value={r[key]} />
        ))}
      </dl>
      {(type === "toc" || type === "toc_entry" || type === "field") && (
        <p className="ex-notice">
          Saved field/TOC results are cached source evidence. Current pagination
          and cache freshness are not established by extraction.
        </p>
      )}
      <dl className="ex-source">
        <Fact label="Record ID" value={recordId(record)} />
        <Fact label="Story" value={r.storyId} />
        <Fact label="Source part" value={r.partName} />
        <Fact label="XML locator" value={r.sourceLocator} />
      </dl>
      <div className="ex-actions">
        {nodeId && onNode && (
          <button className="secondary" onClick={() => onNode(nodeId)}>
            Inspect node
          </button>
        )}
        {type === "node" && onBrowse && (
          <button
            className="secondary"
            onClick={() =>
              onBrowse({
                route: "nodes",
                collection: "nodes",
                filters: { parent_node_id: nodeId },
              })
            }
          >
            Browse children
          </button>
        )}
        {type === "story" && onBrowse && (
          <button
            className="secondary"
            onClick={() =>
              onBrowse({
                route: "nodes",
                collection: "nodes",
                filters: { story_id: text(r.storyId) },
              })
            }
          >
            Browse story
          </button>
        )}
        {asset && type === "media_asset" && (
          <>
            <MediaDownload
              pin={pin}
              asset={asset}
              byteCount={typeof r.byteCount === "number" ? r.byteCount : -1}
            />
            {onBrowse && (
              <button
                className="secondary"
                onClick={() =>
                  onBrowse({
                    route: "collections",
                    collection: "imageOccurrences",
                  })
                }
              >
                Browse image occurrences
              </button>
            )}
          </>
        )}
        {asset && type !== "media_asset" && onBrowse && (
          <button
            className="secondary"
            onClick={() =>
              onBrowse({
                route: "collections",
                collection: "mediaAssets",
                filters: { record_id: asset },
              })
            }
          >
            Inspect asset
          </button>
        )}
      </div>
      <SpanEvidence record={record} pin={pin} />
      <JsonEvidence value={record} />
    </article>
  );
}

export function RecordBrowser({
  pin,
  query,
  onNode,
  onBrowse,
}: {
  pin: ExtractionRevision;
  query: PageQuery;
  onNode: (id: string) => void;
  onBrowse: (query: PageQuery) => void;
}) {
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [refresh, setRefresh] = useState(0);
  const [state, setState] = useState<{
    key: string;
    page?: ExtractionPage;
    error?: string;
  }>({ key: "" });
  const cursor = cursors[cursors.length - 1];
  const key = JSON.stringify([pin.analysisRevisionId, query, cursor, refresh]);
  useEffect(() => {
    const controller = new AbortController();
    setState({ key });
    extractionApi
      .page(pin.analysisRevisionId, query, cursor, controller.signal)
      .then((page) => {
        assertPinnedPage(page, pin, query.collection);
        if (!controller.signal.aborted) setState({ key, page });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({ key, error: errorMessage(error) });
      });
    return () => controller.abort();
    // JSON key includes all query/pin/cursor inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const current = state.key === key ? state : null;
  return (
    <section
      aria-label={`${query.collection} records`}
      aria-busy={!current?.page && !current?.error}
    >
      <div className="ex-browser-heading">
        <h2>
          {query.route === "outline" ? "Semantic outline" : query.collection}
        </h2>
        <span className="ex-help">
          Page {cursors.length} · up to 25 records
        </span>
      </div>
      {query.filters && (
        <p className="ex-help">Filters: {JSON.stringify(query.filters)}</p>
      )}
      {current?.error ? (
        <div role="alert" className="feedback error">
          <p>{current.error}</p>
          <button
            className="secondary"
            onClick={() => setRefresh((n) => n + 1)}
          >
            Retry page
          </button>
        </div>
      ) : !current?.page ? (
        <p role="status">Loading records…</p>
      ) : (
        <>
          {current.page.items.length === 0 && (
            <p className="ex-empty">
              No records for this collection and filter. This alone does not
              establish that the feature is fully supported; check coverage.
            </p>
          )}
          <div className="ex-records">
            {current.page.items.map((record, index) => (
              <RecordCard
                key={`${recordId(record)}:${index}`}
                record={record}
                pin={pin}
                onNode={onNode}
                onBrowse={onBrowse}
              />
            ))}
          </div>
          <nav aria-label="Record pages" className="ex-pagination">
            <button
              className="secondary"
              disabled={cursors.length === 1}
              onClick={() => setCursors([null])}
            >
              First page
            </button>
            <button
              className="secondary"
              disabled={cursors.length === 1}
              onClick={() => setCursors((c) => c.slice(0, -1))}
            >
              Previous page
            </button>
            <button
              disabled={!current.page.nextCursor || cursors.length >= 200}
              onClick={() =>
                setCursors((c) => [...c, current.page!.nextCursor])
              }
            >
              Next page
            </button>
          </nav>
          {cursors.length >= 200 && (
            <p className="ex-help">
              Navigation history is limited to 200 pages. Narrow the filter or
              return to the first page.
            </p>
          )}
        </>
      )}
    </section>
  );
}

export function NodeDetail({
  pin,
  nodeId,
  onNode,
  onClose,
  onBrowse,
}: {
  pin: ExtractionRevision;
  nodeId: string;
  onNode: (id: string) => void;
  onClose: () => void;
  onBrowse: (query: PageQuery) => void;
}) {
  const [node, setNode] = useState<ExtractionRecord | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"tokens" | "formatting" | "children">(
    "tokens",
  );
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    extractionApi
      .node(pin.analysisRevisionId, nodeId, controller.signal)
      .then((result) => {
        if (
          result.analysisRevisionId !== pin.analysisRevisionId ||
          result.versionId !== pin.versionId ||
          text(result.node.nodeId) !== nodeId
        )
          throw new Error(
            "Node response does not match the selected extraction.",
          );
        if (!controller.signal.aborted) {
          setNode(result.node);
          setError("");
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(errorMessage(error));
      });
    return () => controller.abort();
  }, [pin.analysisRevisionId, pin.versionId, nodeId, refresh]);
  const run = node?.kind === "run";
  const query: PageQuery =
    tab === "children"
      ? {
          route: "nodes",
          collection: "nodes",
          filters: { parent_node_id: nodeId },
        }
      : {
          route: "collections",
          collection: tab,
          filters: {
            [run
              ? tab === "tokens"
                ? "run_node_id"
                : "record_id"
              : "owner_node_id"]: nodeId,
          },
        };
  return (
    <aside className="ex-node-detail" aria-label="Node evidence">
      <div className="ex-browser-heading">
        <h2>Node evidence</h2>
        <button className="secondary" onClick={onClose}>
          Close node
        </button>
      </div>
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button onClick={() => setRefresh((n) => n + 1)}>Retry node</button>
        </div>
      ) : !node ? (
        <p role="status">Loading node…</p>
      ) : (
        <>
          <RecordCard record={node} pin={pin} onBrowse={onBrowse} />
          <div className="ex-tabs" aria-label="Node detail views">
            {(["tokens", "formatting", "children"] as const).map((name) => (
              <button
                key={name}
                aria-pressed={tab === name}
                onClick={() => setTab(name)}
              >
                {name === "tokens"
                  ? "Exact text tokens"
                  : name === "formatting"
                    ? "Formatting evidence"
                    : "Child nodes"}
              </button>
            ))}
          </div>
          <p className="ex-help">
            Tokens preserve their original channels, breaks, field/revision
            context and whitespace. Child nodes are browsed separately; this is
            not an invented flattened paragraph or a Word layout preview.
          </p>
          <RecordBrowser
            key={JSON.stringify(query)}
            pin={pin}
            query={query}
            onNode={onNode}
            onBrowse={onBrowse}
          />
        </>
      )}
    </aside>
  );
}
