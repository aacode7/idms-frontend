import type { OutlineNode, SourceSectionChoice } from "../types/contracts";

export function insertedHeadingDepth(
  root: OutlineNode,
  included: SourceSectionChoice[],
  source: OutlineNode[],
  destination: OutlineNode | undefined,
  parent: OutlineNode | undefined,
  options: {
    promote_to_top_level: boolean;
    promote_to_parent_level: boolean;
    adopt_heading_style: boolean;
    adopt_heading_paragraph_format: boolean;
  },
) {
  const targetLevel = !destination
    ? root.level
    : options.promote_to_top_level
      ? 1
      : options.promote_to_parent_level
        ? (parent?.level ?? root.level)
        : options.adopt_heading_style && options.adopt_heading_paragraph_format
          ? destination.level
          : root.level;
  const keys = new Set(included.map((choice) => choice.node_key));
  return Math.max(
    targetLevel,
    ...source
      .filter((node) => keys.has(node.node_key))
      .map((node) => node.level + targetLevel - root.level),
  );
}
