import { Suspense } from "react";
import ExtractionInspector from "../../../../../components/extraction/inspector";

export default function ExtractionPage() {
  return (
    <Suspense
      fallback={
        <main className="workspace-shell">
          <p role="status">Loading extraction inspector…</p>
        </main>
      }
    >
      <ExtractionInspector />
    </Suspense>
  );
}
