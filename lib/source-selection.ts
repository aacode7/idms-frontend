import type { OutlineNode, SourceSectionChoice } from "../types/contracts";

export type ContentScope = "subtree" | "section" | "exclude" | "omit";

export function branchNodes(nodes: OutlineNode[], root: OutlineNode) {
  return nodes
    .filter(
      (n) =>
        n.block_index >= root.block_index &&
        n.block_index <= root.end_block_index,
    )
    .sort((a, b) => a.block_index - b.block_index);
}

export function wholeBranch(
  nodes: OutlineNode[],
  root: OutlineNode,
): SourceSectionChoice[] {
  return branchNodes(nodes, root).map((n) => ({
    node_key: n.node_key,
    content: "section",
  }));
}

export function changeContent(
  nodes: OutlineNode[],
  root: OutlineNode,
  current: SourceSectionChoice[],
  target: OutlineNode,
  scope: ContentScope,
): SourceSectionChoice[] {
  const subtree = branchNodes(nodes, target);
  const keys = new Set(
    scope === "omit" ? [target.node_key] : subtree.map((n) => n.node_key),
  );
  const choices = new Map(
    current
      .filter((c) => !keys.has(c.node_key))
      .map((c) => [c.node_key, c.content]),
  );
  if (scope === "subtree")
    subtree.forEach((n) => choices.set(n.node_key, "section"));
  else if (scope === "section") choices.set(target.node_key, "section");
  return branchNodes(nodes, root)
    .filter((n) => choices.has(n.node_key))
    .map((n) => ({ node_key: n.node_key, content: choices.get(n.node_key)! }));
}

export function selectionContext(
  nodes: OutlineNode[],
  a: OutlineNode,
  b: OutlineNode,
): OutlineNode {
  const start = Math.min(a.block_index, b.block_index);
  const end = Math.max(a.end_block_index, b.end_block_index);
  return (
    nodes
      .filter((n) => n.block_index <= start && n.end_block_index >= end)
      .sort((left, right) => right.block_index - left.block_index)[0] ?? {
      ...a,
      node_key: "selection-batch",
      title: "Selected sections",
      display_title: "Selected sections",
      automatic_label: null,
      parent_node_key: null,
      level: 1,
      block_index: start,
      end_block_index: end,
    }
  );
}

// Each disconnected selected branch becomes an actual insertion root. Never
// manufacture an ancestor heading/body to satisfy the engine's rooted contract.
export function splitSelection(
  nodes: OutlineNode[],
  root: OutlineNode,
  choices: SourceSectionChoice[],
) {
  const byKey = new Map(choices.map((choice) => [choice.node_key, choice]));
  const groups: {
    node: OutlineNode;
    includedSections: SourceSectionChoice[];
  }[] = [];
  const parents: {
    node: OutlineNode;
    group: (typeof groups)[number] | null;
  }[] = [];
  for (const node of branchNodes(nodes, root)) {
    while (
      parents.length &&
      parents[parents.length - 1].node.end_block_index < node.block_index
    )
      parents.pop();
    const choice = byKey.get(node.node_key);
    let group = null;
    if (choice) {
      group = parents[parents.length - 1]?.group ?? {
        node,
        includedSections: [],
      };
      if (!parents[parents.length - 1]?.group) groups.push(group);
      group.includedSections.push(choice);
    }
    parents.push({ node, group });
  }
  return groups;
}

export function contentState(
  nodes: OutlineNode[],
  node: OutlineNode,
  choices: SourceSectionChoice[],
) {
  const branch = branchNodes(nodes, node);
  const byKey = new Map(choices.map((c) => [c.node_key, c.content]));
  const included = branch.filter((n) => byKey.has(n.node_key));
  const full = branch.every((n) => byKey.get(n.node_key) === "section");
  const own = byKey.get(node.node_key);
  const mode = full ? "subtree" : included.length === 1 && own ? own : "custom";
  return {
    mode,
    own,
    included: included.length,
    total: branch.length,
    checked: Boolean(own),
    partial: Boolean(own) && branch.length > 1 && !full,
  };
}
