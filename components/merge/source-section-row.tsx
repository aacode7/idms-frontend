"use client";
import type { DragEvent } from "react";
import type { OutlineNode, SourceSectionChoice } from "../../types/contracts";
import { contentState, type ContentScope } from "../../lib/source-selection";

export function SourceSectionRow({
  node,
  nodes,
  choices,
  active,
  disabled,
  title,
  onToggle,
  onScope,
  onChoose,
  onDragStart,
  onDragEnd,
}: {
  node: OutlineNode;
  nodes: OutlineNode[];
  choices: SourceSectionChoice[];
  active: boolean;
  disabled: boolean;
  title: string;
  onToggle: (checked: boolean) => void;
  onScope: (scope: ContentScope) => void;
  onChoose: () => void;
  onDragStart: (event: DragEvent) => void;
  onDragEnd: () => void;
}) {
  const state = contentState(nodes, node, choices);
  const hasChildren = state.total > 1;
  return (
    <div
      className={`source-node ${active ? "placement-active" : ""}`}
      style={{ paddingLeft: 12 + (node.level - 1) * 14 }}
      draggable={!disabled}
      onDragStart={(event) => {
        if (
          disabled ||
          (event.target as HTMLElement).closest("input, select, option")
        ) {
          event.preventDefault();
          return;
        }
        onDragStart(event);
      }}
      onDragEnd={onDragEnd}
      onDoubleClick={(event) => {
        if (!(event.target as HTMLElement).closest("input, select, button"))
          onChoose();
      }}
    >
      <div className="source-choice-heading">
        <label>
          <input
            type="checkbox"
            checked={state.checked}
            disabled={disabled}
            aria-label={`Include ${title}`}
            title="Checked means this section and its own content are included. Unchecking keeps checked children."
            onChange={(event) => onToggle(event.target.checked)}
          />
          <span>
            <strong>{title}</strong>
            <small>
              {state.own
                ? hasChildren
                  ? `${state.included}/${state.total} sections included${state.own === "heading" ? " · Heading only" : ""}${state.partial ? " · Partial selection" : ""}`
                  : `${state.own === "heading" ? "Heading only" : "Section selected"} · No child sections`
                : state.included
                  ? `Not selected · ${state.included} child section${state.included === 1 ? "" : "s"} selected`
                  : `Heading ${node.level} · blocks ${node.block_index + 1}–${node.end_block_index + 1}`}
            </small>
          </span>
        </label>
        <button
          type="button"
          className="source-place"
          disabled={disabled}
          draggable={!disabled}
          onClick={onChoose}
          aria-label={`Place ${title}`}
          title="Place this selection in the master, or drag it to a gap"
        >
          Place
        </button>
      </div>
      {state.included > 0 && hasChildren && (
        <select
          aria-label={`Content scope for ${title}`}
          value={state.mode}
          disabled={disabled}
          onChange={(event) => onScope(event.target.value as ContentScope)}
        >
          <option value="subtree">Include content + all child sections</option>
          <option value="section">Include content — no child sections</option>
          <option value="exclude">Exclude this branch</option>
          <option value="custom" disabled>
            Custom selection
          </option>
        </select>
      )}
    </div>
  );
}
