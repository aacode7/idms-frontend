"use client";
import { DragEvent, MouseEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  createMergeJob,
  deleteGeneratedMerge,
  getJob,
  getMergeResults,
  getOutline,
  listDocuments,
  previewMerge,
} from "../../../../../lib/api/projects";
import type {
  Diagnostic,
  Document,
  MergePreview,
  MergeResult,
  OutlineNode,
} from "../../../../../types/contracts";
type Selection = {
  document: Document;
  node: OutlineNode;
  destination: string | null;
  position: "before" | "after";
};

export default function MergePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [docs, setDocs] = useState<Document[]>([]),
    [outlines, setOutlines] = useState<Record<string, OutlineNode[]>>({}),
    [selected, setSelected] = useState<Selection[]>([]),
    [open, setOpen] = useState<string | null>(null),
    [message, setMessage] = useState(""),
    [preview, setPreview] = useState<MergePreview | null>(null),
    [results, setResults] = useState<MergeResult[]>([]),
    [checking, setChecking] = useState(false),
    [deletingMergeDocumentId, setDeletingMergeDocumentId] = useState<string | null>(null),
    [placementCandidate, setPlacementCandidate] = useState<Pick<Selection, "document" | "node"> | null>(null),
    [dragged, setDragged] = useState<Pick<Selection, "document" | "node"> | null>(null),
    [dropTarget, setDropTarget] = useState<string | null>(null);
  const master = useMemo(() => docs.find((d) => d.role === "master"), [docs]);
  const sources = docs.filter(
    (d) => d.role === "source" || d.role === "master_candidate",
  );
  const masterOutline = master ? (outlines[master.id] ?? []) : [];
  const compatibilityGroups = useMemo(() => {
    const groups = new Map<number, Diagnostic[]>();
    for (const finding of preview?.diagnostics ?? []) {
      if (!finding.code.startsWith("compatibility.")) continue;
      const index = finding.operation_index ?? 0;
      groups.set(index, [...(groups.get(index) ?? []), finding]);
    }
    return [...groups.entries()];
  }, [preview]);
  useEffect(() => {
    listDocuments(projectId)
      .then(async (values) => {
        setDocs(values);
        const m = values.find((d) => d.role === "master");
        if (m) {
          const masterNodes = await getOutline(m.id);
          setOutlines((v) => ({ ...v, [m.id]: masterNodes }));
        }
        setResults(await getMergeResults(projectId));
      })
      .catch(() => setMessage("Merge workspace could not be loaded."));
  }, [projectId]);
  async function load(doc: Document) {
    if (!outlines[doc.id]) {
      const nodes = await getOutline(doc.id);
      setOutlines((v) => ({ ...v, [doc.id]: nodes }));
    }
    setOpen((v) => (v === doc.id ? null : doc.id));
  }
  function toggle(document: Document, node: OutlineNode, checked: boolean) {
    setPreview(null);
    setSelected((v) =>
      checked
        ? [
            ...v,
            {
              document,
              node,
              destination: masterOutline[0]?.node_key ?? null,
              position: "after",
            },
          ]
        : v.filter(
            (x) =>
              !(
                x.document.id === document.id &&
                x.node.node_key === node.node_key
              ),
          ),
    );
    setPlacementCandidate(checked ? { document, node } : null);
  }
  function upsertSelection(candidate: Pick<Selection, "document" | "node">, destination: string | null, position: "before" | "after") {
    setPreview(null);
    setSelected((items) => {
      const existing = items.find((item) => item.document.id === candidate.document.id && item.node.node_key === candidate.node.node_key);
      const next = { ...candidate, destination, position };
      return existing ? items.map((item) => item === existing ? next : item) : [...items, next];
    });
    setPlacementCandidate(candidate);
    setMessage(`Planned “${candidate.node.title}” ${position} the selected master heading.`);
  }
  function chooseForPlacement(document: Document, node: OutlineNode) {
    const candidate = { document, node };
    if (!selected.some((item) => item.document.id === document.id && item.node.node_key === node.node_key)) {
      upsertSelection(candidate, masterOutline[0]?.node_key ?? null, "after");
    }
    setPlacementCandidate(candidate);
    setMessage(`“${node.title}” is selected. Click a master heading to place it after that heading, or drag it to a gap.`);
  }
  function placeCandidate(destination: string | null, position: "before" | "after") {
    if (placementCandidate) upsertSelection(placementCandidate, destination, position);
  }
  function startDrag(event: DragEvent, document: Document, node: OutlineNode) {
    event.dataTransfer.effectAllowed = "move";
    // The browser drag payload is the source of truth at drop time. React state
    // updates from dragstart are asynchronous, so relying on `dragged` alone
    // can leave an earlier checkbox placement in the insertion plan.
    event.dataTransfer.setData(
      "application/x-idms-outline-section",
      JSON.stringify({ documentId: document.id, nodeKey: node.node_key }),
    );
    event.dataTransfer.setData("text/plain", `${document.id}:${node.node_key}`);
    const candidate = { document, node };
    setDragged(candidate);
    setPlacementCandidate(candidate);
    setMessage(`Drag “${node.title}” to a labelled master gap. The gap label is the exact insertion point.`);
  }
  function allowDrop(event: DragEvent, target: string) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTarget(target);
  }
  function candidateFromDrag(event: DragEvent) {
    try {
      const data = event.dataTransfer.getData("application/x-idms-outline-section");
      if (data) {
        const { documentId, nodeKey } = JSON.parse(data) as { documentId: string; nodeKey: string };
        const document = sources.find((item) => item.id === documentId);
        const node = document ? outlines[document.id]?.find((item) => item.node_key === nodeKey) : undefined;
        if (document && node) return { document, node };
      }
    } catch {
      // Fall back to the current drag state for browsers that do not retain a
      // custom MIME type during a same-page drag.
    }
    return dragged;
  }
  function dropOn(event: DragEvent, destination: string | null, position: "before" | "after") {
    event.preventDefault();
    event.stopPropagation();
    const candidate = candidateFromDrag(event);
    if (candidate) {
      upsertSelection(candidate, destination, position);
      const destinationTitle = destination
        ? masterOutline.find((node) => node.node_key === destination)?.title
        : "the start of the document";
      setMessage(`Planned “${candidate.node.title}” ${position} “${destinationTitle}”.`);
    } else {
      setMessage("That drop could not identify the source section. Drag it again from its source row.");
    }
    setDragged(null);
    setDropTarget(null);
  }
  const operations = () =>
    selected.map((s, sort_order) => ({
      source_version_id: s.document.version_id,
      source_node_key: s.node.node_key,
      destination_node_key: s.destination,
      position: s.position,
      sort_order,
    }));
  async function check() {
    setChecking(true);
    setMessage("Checking compatibility… Large DOCX files can take up to two minutes.");
    try {
      setPreview(await previewMerge(projectId, operations()));
      setMessage("Compatibility results are shown below.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Compatibility check failed.");
    } finally {
      setChecking(false);
    }
  }
  async function merge() {
    if (!master || !selected.length) return;
    const job = await createMergeJob(projectId, operations());
    setMessage("Merge queued. Waiting for generated document…");
    const timer = window.setInterval(async () => {
      const status = await getJob(job.id);
      if (status.status === "completed") {
        window.clearInterval(timer);
        setResults(await getMergeResults(projectId));
        setMessage("Merge complete. Open an inserted section in ONLYOFFICE.");
      }
      if (status.status === "failed") {
        window.clearInterval(timer);
        setMessage("Merge failed.");
      }
    }, 2000);
  }
  async function removeGeneratedMerge(result: MergeResult) {
    if (!confirm("Permanently delete this merged document and all of its generated versions, exports, and stored files? Original master and source DOCX files will be kept.")) return;
    setDeletingMergeDocumentId(result.generated_document_id);
    try {
      await deleteGeneratedMerge(projectId, result.generated_document_id);
      setResults((items) => items.filter((item) => item.generated_document_id !== result.generated_document_id));
      setMessage("Merged document and its stored files were permanently deleted.");
    } catch {
      setMessage("The merged document could not be deleted. No database records were removed.");
    } finally {
      setDeletingMergeDocumentId(null);
    }
  }
  return (
    <main className="merge-shell">
      <header className="merge-header">
        <a className="back" href={`/projects/${projectId}`}>
          <span>←</span> Back to workspace
        </a>
        <p className="eyebrow">MERGE WORKSPACE</p>
        <h1>Compose your final document</h1>
      </header>
      <div className="merge-layout">
        <aside className="source-pane">
          <p className="eyebrow">SOURCE DOCUMENTS</p>
          <h2>Parsed sections</h2>
          {sources.map((doc) => (
            <section className="source-card" key={doc.id}>
              <button type="button" onClick={() => load(doc)}>
                <strong>{doc.filename}</strong>
                <small>
                  {outlines[doc.id]?.length ?? 0} sections ·{" "}
                  {open === doc.id ? "Hide" : "Show"}
                </small>
              </button>
              {open === doc.id &&
                outlines[doc.id]?.map((node) => (
                  <label
                    className={`source-node ${placementCandidate?.document.id === doc.id && placementCandidate.node.node_key === node.node_key ? "placement-active" : ""}`}
                    key={node.node_key}
                    style={{ paddingLeft: 12 + (node.level - 1) * 14 }}
                    draggable
                    onDragStart={(event) => startDrag(event, doc, node)}
                    onDragEnd={() => { setDragged(null); setDropTarget(null); }}
                    onDoubleClick={(event: MouseEvent) => {
                      if ((event.target as HTMLElement).tagName !== "INPUT") chooseForPlacement(doc, node);
                    }}
                    title="Double-click to select and place, or drag to a master gap"
                  >
                    <input
                      type="checkbox"
                      checked={selected.some(
                        (s) =>
                          s.document.id === doc.id &&
                          s.node.node_key === node.node_key,
                      )}
                      onChange={(e) => toggle(doc, node, e.target.checked)}
                    />
                    <span>
                      <strong>{node.title}</strong>
                      <small>
                        Heading {node.level} · blocks {node.block_index + 1}–
                        {node.end_block_index + 1}
                      </small>
                    </span>
                  </label>
                ))}
            </section>
          ))}
        </aside>
        <section className="master-pane">
          <div className="master-heading">
            <div>
              <p className="eyebrow">MASTER DOCUMENT MAP</p>
              <h2>{master?.filename ?? "No master selected"}</h2>
              <p>Parsed headings; master layout remains authoritative.</p>
            </div>
            <span>{masterOutline.length} sections</span>
          </div>
          <section className={`master-paper ${dragged ? "is-dragging" : ""}`}>
            {masterOutline.map((node, index) => <div key={node.node_key}>
              {index === 0 && <div
                className={`master-drop-zone ${dropTarget === `before:${node.node_key}` ? "is-drop-target" : ""}`}
                onDragOver={(event) => allowDrop(event, `before:${node.node_key}`)}
                onDragLeave={() => setDropTarget(null)}
                onDrop={(event) => dropOn(event, node.node_key, "before")}
              >Drop before {node.title}</div>}
              <div
                className={`master-node ${placementCandidate ? "master-node-selectable" : ""}`}
                style={{ marginLeft: (node.level - 1) * 16 }}
                onClick={() => placeCandidate(node.node_key, "after")}
                title={placementCandidate ? "Click to insert the selected source section after this heading" : undefined}
              >
                <div>
                  <strong>H{node.level} · {node.title}</strong>
                  <small>Master blocks {node.block_index + 1}–{node.end_block_index + 1}</small>
                </div>
                {selected.filter((s) => s.destination === node.node_key).map((s) => (
                  <mark key={s.document.id + s.node.node_key}>{s.position}: {s.node.title}</mark>
                ))}
              </div>
              <div
                className={`master-drop-zone ${dropTarget === `after:${node.node_key}` ? "is-drop-target" : ""}`}
                onDragOver={(event) => allowDrop(event, `after:${node.node_key}`)}
                onDragLeave={() => setDropTarget(null)}
                onDrop={(event) => dropOn(event, node.node_key, "after")}
              >Drop after {node.title}</div>
            </div>)}
          </section>
          <section className="insertion-plan">
            <p className="eyebrow">INSERTION PLAN</p>
            <h2>{selected.length} selected sections</h2>
            {selected.map((s, i) => (
              <div className="plan-row" key={s.document.id + s.node.node_key}>
                <span>{i + 1}</span>
                <div>
                  <strong>{s.node.title}</strong>
                  <small>{s.document.filename}</small>
                </div>
                <select
                  value={s.position}
                  onChange={(e) =>
                    setSelected((v) =>
                      v.map((x, n) =>
                        n === i
                          ? {
                              ...x,
                              position: e.target.value as "before" | "after",
                            }
                          : x,
                      ),
                    )
                  }
                >
                  <option value="after">After</option>
                  <option value="before">Before</option>
                </select>
                <select
                  value={s.destination ?? ""}
                  onChange={(e) =>
                    setSelected((v) =>
                      v.map((x, n) =>
                        n === i
                          ? { ...x, destination: e.target.value || null }
                          : x,
                      ),
                    )
                  }
                >
                  <option value="">End of document</option>
                  {masterOutline.map((n) => (
                    <option key={n.node_key} value={n.node_key}>
                      {n.title}
                    </option>
                  ))}
                </select>
                <button type="button" className="remove-selection" onClick={() => setSelected((items) => items.filter((_, index) => index !== i))}>Remove</button>
              </div>
            ))}
          </section>
          {results.length > 0 && (
            <section className="merge-diagnostics">
              <p className="eyebrow">MERGED SECTIONS</p>
              {results.map((result) => (
                <p key={result.source_node_key}>
                  <a
                    className="editor-link"
                    href={`/documents/${result.generated_document_id}/versions/${result.generated_version_id}/edit?mode=edit&expected=${result.generated_version_id}&anchor=${encodeURIComponent(result.editor_anchor_id ?? "")}`}
                  >
                    Open inserted section in ONLYOFFICE →
                  </a>{" "}
                  <small>{result.source_node_key}</small>{" "}
                  <button
                    type="button"
                    className="secondary delete-document"
                    disabled={deletingMergeDocumentId === result.generated_document_id}
                    onClick={() => removeGeneratedMerge(result)}
                  >
                    {deletingMergeDocumentId === result.generated_document_id ? "Deleting merged document…" : "Delete merged document"}
                  </button>
                </p>
              ))}
            </section>
          )}
          {preview && (
            <section className="merge-diagnostics">
              <p className="eyebrow">COMPATIBILITY RESULTS</p>
              {compatibilityGroups.length || preview.warnings.length ? (
                <>
                  {compatibilityGroups.map(([operationIndex, findings]) => (
                    <article className="compatibility-section" key={operationIndex}>
                      <h3>Selection {operationIndex + 1}</h3>
                      <ul>
                        {findings.map((finding) => (
                          <li key={finding.code}>
                            <strong>{finding.code.replace("compatibility.", "").replaceAll("_", " ")}</strong>
                            <span>{finding.message}</span>
                          </li>
                        ))}
                      </ul>
                    </article>
                  ))}
                  {preview.warnings.length > 0 && <p className="compatibility-warnings">Warnings: {preview.warnings.join(" ")}</p>}
                </>
              ) : (
                <p className="compatibility-pass">
                  Passed: no warnings or conflicts reported.
                </p>
              )}
            </section>
          )}
          <footer className="merge-actions">
            <p>
              {message ||
                "Select headings, map insertion points, then verify compatibility."}
            </p>
            <button
              type="button"
              className="secondary"
              disabled={!selected.length || checking}
              onClick={check}
            >
              {checking ? "Checking…" : "Check compatibility"}
            </button>
            <button
              type="button"
              disabled={!master || !selected.length}
              onClick={merge}
            >
              Create merge ({selected.length})
            </button>
          </footer>
        </section>
      </div>
    </main>
  );
}
