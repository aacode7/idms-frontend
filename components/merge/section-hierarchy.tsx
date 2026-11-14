import type { SourceSectionChoice } from "../../types/contracts";

export type HierarchySection = SourceSectionChoice & {
  title?: string | null;
  level?: number | null;
  parent_node_key?: string | null;
};

type Branch = HierarchySection & { children: Branch[] };

export function SectionHierarchy({
  sections,
}: {
  sections: HierarchySection[];
}) {
  const nodes = new Map<string, Branch>();
  for (const section of sections)
    nodes.set(section.node_key, { ...section, children: [] });
  const roots: Branch[] = [];
  for (const section of nodes.values()) {
    const parent = nodes.get(section.parent_node_key ?? "");
    // Missing/excluded parents stay absent. Strict levels also prevent cycles
    // in incomplete legacy metadata; unknown relationships render flat.
    if (
      parent &&
      parent.level != null &&
      section.level != null &&
      parent.level < section.level
    )
      parent.children.push(section);
    else roots.push(section);
  }
  function render(branches: Branch[], root = false) {
    return (
      <ul
        className={root ? "section-hierarchy" : undefined}
        aria-label={root ? "Included section hierarchy" : undefined}
      >
        {branches.map((section) => (
          <li key={section.node_key} data-node-key={section.node_key}>
            <div className="section-hierarchy-node">
              <span className="section-hierarchy-title">
                {section.title ?? "Section details unavailable"}
              </span>
              <small>
                {section.content === "heading"
                  ? "Heading only"
                  : "Content included"}
              </small>
            </div>
            {!!section.children.length && render(section.children)}
          </li>
        ))}
      </ul>
    );
  }
  return render(roots, true);
}
