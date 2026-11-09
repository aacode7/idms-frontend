"use client";
import {
  DragEvent,
  MouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  resolutionOptions: {
    inherit_heading_format: boolean;
    adopt_heading_style: boolean;
    adopt_heading_font: boolean;
    adopt_heading_size: boolean;
    adopt_heading_colour: boolean;
    adopt_heading_emphasis: boolean;
    adopt_heading_paragraph_format: boolean;
    renumber_manual_headings: boolean;
    normalise_tables: boolean;
  };
};

const defaultResolutionOptions: Selection["resolutionOptions"] = {
  inherit_heading_format: true,
  adopt_heading_style: true,
  adopt_heading_font: true,
  adopt_heading_size: true,
  adopt_heading_colour: true,
  adopt_heading_emphasis: true,
  adopt_heading_paragraph_format: true,
  renumber_manual_headings: true,
  normalise_tables: true,
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
    [merging, setMerging] = useState(false),
    [mergeProgress, setMergeProgress] = useState(0),
    [mergedDocumentName, setMergedDocumentName] = useState(""),
    [initialMergeDescription, setInitialMergeDescription] = useState(""),
    [deletingMergeDocumentId, setDeletingMergeDocumentId] = useState<
      string | null
    >(null),
    [placementCandidate, setPlacementCandidate] = useState<Pick<
      Selection,
      "document" | "node"
    > | null>(null),
    [dragged, setDragged] = useState<Pick<
      Selection,
      "document" | "node"
    > | null>(null),
    [dropTarget, setDropTarget] = useState<string | null>(null);
  const deletingMergeRef = useRef<string | null>(null);
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
              resolutionOptions: defaultResolutionOptions,
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
  function upsertSelection(
    candidate: Pick<Selection, "document" | "node">,
    destination: string | null,
    position: "before" | "after",
  ) {
    setPreview(null);
    setSelected((items) => {
      const existing = items.find(
        (item) =>
          item.document.id === candidate.document.id &&
          item.node.node_key === candidate.node.node_key,
      );
      const next = {
        ...candidate,
        destination,
        position,
        resolutionOptions:
          existing?.resolutionOptions ?? defaultResolutionOptions,
      };
      return existing
        ? items.map((item) => (item === existing ? next : item))
        : [...items, next];
    });
    setPlacementCandidate(candidate);
    setMessage(
      `Planned “${candidate.node.title}” ${position} the selected master heading.`,
    );
  }
  function chooseForPlacement(document: Document, node: OutlineNode) {
    const candidate = { document, node };
    if (
      !selected.some(
        (item) =>
          item.document.id === document.id &&
          item.node.node_key === node.node_key,
      )
    ) {
      upsertSelection(candidate, masterOutline[0]?.node_key ?? null, "after");
    }
    setPlacementCandidate(candidate);
    setMessage(
      `“${node.title}” is selected. Click a master heading to place it after that heading, or drag it to a gap.`,
    );
  }
  function placeCandidate(
    destination: string | null,
    position: "before" | "after",
  ) {
    if (placementCandidate)
      upsertSelection(placementCandidate, destination, position);
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
    setMessage(
      `Drag “${node.title}” to a labelled master gap. The gap label is the exact insertion point.`,
    );
  }
  function allowDrop(event: DragEvent, target: string) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTarget(target);
  }
  function candidateFromDrag(event: DragEvent) {
    try {
      const data = event.dataTransfer.getData(
        "application/x-idms-outline-section",
      );
      if (data) {
        const { documentId, nodeKey } = JSON.parse(data) as {
          documentId: string;
          nodeKey: string;
        };
        const document = sources.find((item) => item.id === documentId);
        const node = document
          ? outlines[document.id]?.find((item) => item.node_key === nodeKey)
          : undefined;
        if (document && node) return { document, node };
      }
    } catch {
      // Fall back to the current drag state for browsers that do not retain a
      // custom MIME type during a same-page drag.
    }
    return dragged;
  }
  function dropOn(
    event: DragEvent,
    destination: string | null,
    position: "before" | "after",
  ) {
    event.preventDefault();
    event.stopPropagation();
    const candidate = candidateFromDrag(event);
    if (candidate) {
      upsertSelection(candidate, destination, position);
      const destinationTitle = destination
        ? masterOutline.find((node) => node.node_key === destination)?.title
        : "the start of the document";
      setMessage(
        `Planned “${candidate.node.title}” ${position} “${destinationTitle}”.`,
      );
    } else {
      setMessage(
        "That drop could not identify the source section. Drag it again from its source row.",
      );
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
      resolution_options: s.resolutionOptions,
    }));
  function setResolution(
    operationIndex: number,
    key: keyof Selection["resolutionOptions"],
    enabled: boolean,
  ) {
    setSelected((items) =>
      items.map((item, index) =>
        index === operationIndex
          ? {
              ...item,
              resolutionOptions: { ...item.resolutionOptions, [key]: enabled },
            }
          : item,
      ),
    );
    setMessage(
      "Compatibility choices updated. The checked adjustments will be applied to the new immutable merge.",
    );
  }
  async function check() {
    setChecking(true);
    setMessage(
      "Checking compatibility… Large DOCX files can take up to two minutes.",
    );
    try {
      setPreview(await previewMerge(projectId, operations()));
      setMessage("Compatibility results are shown below.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Compatibility check failed.",
      );
    } finally {
      setChecking(false);
    }
  }
  async function merge() {
    if (!master || !selected.length) return;
    setMerging(true);
    setMergeProgress(5);
    try {
      const job = await createMergeJob(projectId, operations(), {
        generated_filename: mergedDocumentName.trim() || undefined,
        initial_description: initialMergeDescription.trim() || undefined,
      });
      setMessage("Merge queued. Waiting for the generated document…");
      let polling = false;
      const poll = async () => {
        if (polling) return;
        polling = true;
        try {
          const status = await getJob(job.id);
          if (status.status === "queued")
            setMergeProgress((value) => Math.max(value, 10));
          if (status.stage === "staging")
            setMergeProgress((value) => Math.max(value, 25));
          if (status.stage === "merging")
            setMergeProgress((value) => Math.max(value, 55));
          if (status.stage === "persisting")
            setMergeProgress((value) => Math.max(value, 80));
          if (status.status === "completed") {
            window.clearInterval(timer);
            setMergeProgress(100);
            setResults(await getMergeResults(projectId));
            setMerging(false);
            setMessage(
              "Merge complete and saved as version 1. Open it to edit and save later versions.",
            );
          }
          if (status.status === "failed") {
            window.clearInterval(timer);
            setMergeProgress(0);
            setMerging(false);
            setMessage("Merge failed. Review your selections and try again.");
          }
        } catch {
          window.clearInterval(timer);
          setMergeProgress(0);
          setMerging(false);
          setMessage(
            "Merge status could not be retrieved. Refresh this page to check the result.",
          );
        } finally {
          polling = false;
        }
      };
      const timer = window.setInterval(poll, 2000);
      void poll();
    } catch (error) {
      setMerging(false);
      setMergeProgress(0);
      setMessage(
        error instanceof Error ? error.message : "Merge could not be started.",
      );
    }
  }
  async function removeGeneratedMerge(result: MergeResult) {
    if (deletingMergeRef.current === result.generated_document_id) return;
    if (
      !confirm(
        "Permanently delete this merged document and all of its generated versions, exports, and stored files? Original master and source DOCX files will be kept.",
      )
    )
      return;
    deletingMergeRef.current = result.generated_document_id;
    setDeletingMergeDocumentId(result.generated_document_id);
    try {
      await deleteGeneratedMerge(projectId, result.generated_document_id);
      setResults((items) =>
        items.filter(
          (item) => item.generated_document_id !== result.generated_document_id,
        ),
      );
      setMessage(
        "Merged document and its stored files were permanently deleted.",
      );
    } catch {
      setMessage(
        "The merged document could not be deleted. No database records were removed.",
      );
    } finally {
      deletingMergeRef.current = null;
      setDeletingMergeDocumentId(null);
    }
  }
  return (
    <main className="merge-shell">
      <header className="merge-header">
        <a className="back" href={`/projects/${projectId}`}>
          <span>←</span> Back to workspace
        </a>
        <div className="merge-title-row">
          <div>
            <p className="eyebrow">STEP 3 OF 3 · MERGE WORKSPACE</p>
            <h1>Compose your final document</h1>
            <p className="merge-intro">
              Add reviewed source sections to the master without changing the
              original files.
            </p>
          </div>
          <div
            className="merge-progress"
            aria-label="Document composition workflow"
          >
            <span>
              1 <em>Upload</em>
            </span>
            <span>
              2 <em>Review</em>
            </span>
            <strong>
              3 <em>Merge</em>
            </strong>
          </div>
        </div>
      </header>
      <div className="merge-layout">
        <aside className="source-pane">
          <div className="pane-heading">
            <div>
              <p className="eyebrow">SOURCE DOCUMENTS</p>
              <h2>Parsed sections</h2>
            </div>
            <span className="pane-count">{sources.length}</span>
          </div>
          <p className="pane-hint">
            Select a heading, then place it in the master map.
          </p>
          {!sources.length && (
            <p className="merge-empty">
              No source documents are available. Return to the workspace to add
              one.
            </p>
          )}
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
                    onDragEnd={() => {
                      setDragged(null);
                      setDropTarget(null);
                    }}
                    onDoubleClick={(event: MouseEvent) => {
                      if ((event.target as HTMLElement).tagName !== "INPUT")
                        chooseForPlacement(doc, node);
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
            {!master && (
              <p className="merge-empty">
                Choose a master document in the workspace before planning a
                merge.
              </p>
            )}
            {master && !masterOutline.length && (
              <p className="merge-empty">
                The master outline is loading, or no headings were found.
              </p>
            )}
            {masterOutline.map((node, index) => (
              <div key={node.node_key}>
                {index === 0 && (
                  <div
                    className={`master-drop-zone ${dropTarget === `before:${node.node_key}` ? "is-drop-target" : ""}`}
                    onDragOver={(event) =>
                      allowDrop(event, `before:${node.node_key}`)
                    }
                    onDragLeave={() => setDropTarget(null)}
                    onDrop={(event) => dropOn(event, node.node_key, "before")}
                  >
                    Drop before {node.title}
                  </div>
                )}
                <div
                  className={`master-node ${placementCandidate ? "master-node-selectable" : ""}`}
                  style={{ marginLeft: (node.level - 1) * 16 }}
                  onClick={() => placeCandidate(node.node_key, "after")}
                  title={
                    placementCandidate
                      ? "Click to insert the selected source section after this heading"
                      : undefined
                  }
                >
                  <div>
                    <strong>
                      H{node.level} · {node.title}
                    </strong>
                    <small>
                      Master blocks {node.block_index + 1}–
                      {node.end_block_index + 1}
                    </small>
                  </div>
                  {selected
                    .filter((s) => s.destination === node.node_key)
                    .map((s) => (
                      <mark key={s.document.id + s.node.node_key}>
                        {s.position}: {s.node.title}
                      </mark>
                    ))}
                </div>
                <div
                  className={`master-drop-zone ${dropTarget === `after:${node.node_key}` ? "is-drop-target" : ""}`}
                  onDragOver={(event) =>
                    allowDrop(event, `after:${node.node_key}`)
                  }
                  onDragLeave={() => setDropTarget(null)}
                  onDrop={(event) => dropOn(event, node.node_key, "after")}
                >
                  Drop after {node.title}
                </div>
              </div>
            ))}
          </section>
          <section className="insertion-plan">
            <div className="plan-heading">
              <div>
                <p className="eyebrow">INSERTION PLAN</p>
                <h2>
                  {selected.length
                    ? `${selected.length} selected section${selected.length === 1 ? "" : "s"}`
                    : "No sections selected"}
                </h2>
              </div>
              {selected.length > 0 && (
                <span className="selection-status">Ready to review</span>
              )}
            </div>
            {!selected.length && (
              <p className="merge-empty">
                Select a source heading to build an ordered insertion plan.
              </p>
            )}
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
                <button
                  type="button"
                  className="remove-selection"
                  onClick={() =>
                    setSelected((items) =>
                      items.filter((_, index) => index !== i),
                    )
                  }
                >
                  Remove
                </button>
              </div>
            ))}
          </section>
          {results.length > 0 && (
            <section className="merge-diagnostics">
              <p className="eyebrow">MERGED DOCUMENT</p>
              {results.map((result) => (
                <div
                  className="merged-document-result"
                  key={`${result.generated_document_id}:${result.generated_version_id}`}
                >
                  <a
                    className="editor-link"
                    href={`/documents/${result.generated_document_id}/versions/${result.generated_version_id}/edit?mode=edit&expected=${result.generated_version_id}&anchor=${encodeURIComponent(result.editor_anchor_ids[0] ?? "")}&anchors=${encodeURIComponent(result.editor_anchor_ids.join(","))}&initialMerge=1&returnTo=${encodeURIComponent(`/projects/${projectId}/merge`)}`}
                  >
                    Open saved merge in document editor →
                  </a>
                  <small>
                    {result.editor_anchor_ids.length} inserted section
                    {result.editor_anchor_ids.length === 1 ? "" : "s"}; use the
                    up/down controls in the editor to review each one.
                  </small>
                  <button
                    type="button"
                    className="secondary delete-document"
                    disabled={
                      deletingMergeDocumentId === result.generated_document_id
                    }
                    onClick={() => removeGeneratedMerge(result)}
                  >
                    {deletingMergeDocumentId === result.generated_document_id
                      ? "Deleting merged document…"
                      : "Delete merged document"}
                  </button>
                </div>
              ))}
            </section>
          )}
          {preview && (
            <section className="merge-diagnostics">
              <p className="eyebrow">COMPATIBILITY RESULTS</p>
              <p className="compatibility-guidance">
                Choose the formatting adjustments to apply. Required safeguards
                are kept on to preserve a valid master document.
              </p>
              {compatibilityGroups.length || preview.warnings.length ? (
                <>
                  {compatibilityGroups.map(([operationIndex, findings]) => (
                    <article
                      className="compatibility-section"
                      key={operationIndex}
                    >
                      <h3>Selection {operationIndex + 1}</h3>
                      <div className="compatibility-table-wrap">
                        <table className="compatibility-table">
                          <thead>
                            <tr>
                              <th scope="col">Property</th>
                              <th scope="col">Source section</th>
                              <th scope="col">Master / merge result</th>
                              <th scope="col">Apply</th>
                            </tr>
                          </thead>
                          <tbody>
                            {findings.map((finding) => (
                              <tr key={finding.code}>
                                <th scope="row">
                                  {finding.code
                                    .replace("compatibility.", "")
                                    .replaceAll("_", " ")}
                                </th>
                                <td>{finding.source_value ?? "—"}</td>
                                <td>
                                  <strong>{finding.master_value ?? "—"}</strong>
                                  <span>
                                    {finding.merge_effect ?? finding.message}
                                  </span>
                                </td>
                                <td>
                                  {finding.resolution_key &&
                                  !finding.resolution_required ? (
                                    <label className="compatibility-choice">
                                      <input
                                        type="checkbox"
                                        checked={
                                          selected[operationIndex]
                                            ?.resolutionOptions[
                                            finding.resolution_key as keyof Selection["resolutionOptions"]
                                          ] ??
                                          finding.resolution_default ??
                                          true
                                        }
                                        onChange={(event) =>
                                          setResolution(
                                            operationIndex,
                                            finding.resolution_key as keyof Selection["resolutionOptions"],
                                            event.target.checked,
                                          )
                                        }
                                        aria-label={
                                          (selected[operationIndex]
                                            ?.resolutionOptions[
                                            finding.resolution_key as keyof Selection["resolutionOptions"]
                                          ] ??
                                          finding.resolution_default ??
                                          true)
                                            ? `Apply ${finding.code.replace("compatibility.", "").replaceAll("_", " ")}`
                                            : `Do not apply ${finding.code.replace("compatibility.", "").replaceAll("_", " ")}; keep source formatting`
                                        }
                                        title={
                                          (selected[operationIndex]
                                            ?.resolutionOptions[
                                            finding.resolution_key as keyof Selection["resolutionOptions"]
                                          ] ??
                                          finding.resolution_default ??
                                          true)
                                            ? "Apply adjustment"
                                            : "Do not apply; keep source formatting"
                                        }
                                      />
                                    </label>
                                  ) : finding.resolution_required ? (
                                    <small className="compatibility-required">
                                      Required
                                    </small>
                                  ) : (
                                    <small className="compatibility-required">
                                      Info
                                    </small>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </article>
                  ))}
                  {preview.warnings.length > 0 && (
                    <p className="compatibility-warnings">
                      Warnings: {preview.warnings.join(" ")}
                    </p>
                  )}
                </>
              ) : (
                <p className="compatibility-pass">
                  Passed: no warnings or conflicts reported.
                </p>
              )}
            </section>
          )}
          <section
            className="merge-metadata"
            aria-label="Initial merged version details"
          >
            <div>
              <p className="eyebrow">INITIAL MERGED VERSION</p>
              <h3>Name and describe version 1</h3>
              <p className="muted">
                Creating a merge saves the first immutable version immediately.
                Later editor saves create version 2, version 3, and so on.
              </p>
            </div>
            <label>
              Merged document name
              <input
                value={mergedDocumentName}
                onChange={(event) => setMergedDocumentName(event.target.value)}
                maxLength={255}
                placeholder={"e.g. Final proposal.docx"}
              />
            </label>
            <label>
              Version 1 summary
              <textarea
                value={initialMergeDescription}
                onChange={(event) =>
                  setInitialMergeDescription(event.target.value)
                }
                maxLength={1000}
                placeholder="e.g. Approved merge notes"
                rows={2}
              />
            </label>
          </section>
          <footer className="merge-actions">
            {merging && (
              <div
                className="merge-operation-progress"
                aria-label={`Merge progress: ${mergeProgress}%`}
              >
                <div className="merge-operation-progress-heading">
                  <span>Generating merged document</span>
                  <strong>{mergeProgress}%</strong>
                </div>
                <div
                  className="merge-operation-progress-track"
                  role="progressbar"
                  aria-valuemin={1}
                  aria-valuemax={100}
                  aria-valuenow={mergeProgress}
                >
                  <span style={{ width: `${mergeProgress}%` }} />
                </div>
              </div>
            )}
            <p role="status" aria-live="polite">
              {message ||
                "Select headings, map insertion points, then verify compatibility."}
            </p>
            <button
              type="button"
              className="secondary"
              disabled={!selected.length || checking || merging}
              onClick={check}
            >
              {checking ? "Checking…" : "Check compatibility"}
            </button>
            <button
              type="button"
              disabled={!master || !selected.length || checking || merging}
              onClick={merge}
            >
              {merging
                ? "Creating merge…"
                : `Create merge (${selected.length})`}
            </button>
          </footer>
        </section>
      </div>
    </main>
  );
}
