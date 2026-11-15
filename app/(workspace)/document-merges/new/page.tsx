"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createDocumentMerge } from "../../../../lib/api/document-merges";

export default function NewDocumentMergePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const merge = await createDocumentMerge(name.trim());
      router.push(`/document-merges/${merge.id}`);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The merge could not be created.",
      );
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <main className="dashboard-shell document-merge-shell">
      <a className="merge-back-link" href="/dashboard">
        ← Your document studio
      </a>
      <section className="dashboard-card document-merge-card">
        <p className="eyebrow">MERGE DOCUMENTS</p>
        <h1>Merge two documents</h1>
        <form className="document-merge-form" onSubmit={submit}>
          <label htmlFor="merge-name">Merged document name</label>
          <input
            id="merge-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={150}
            placeholder="e.g. Combined system design"
            disabled={busy}
          />
          {error && (
            <p className="feedback error" role="alert">
              {error}
            </p>
          )}
          <button disabled={busy || !name.trim()}>
            {busy ? "Creating…" : "Continue to documents →"}
          </button>
        </form>
      </section>
    </main>
  );
}
