"use client";

import { useEffect, useRef, useState } from "react";

export type DocumentField = {
  index: number;
  tag: string;
  part: string;
  label: string;
  value: string;
  changed: boolean;
};

export function FieldNavigator({ items, sessionId, autoLocate = true }: {
  items: DocumentField[];
  sessionId: string;
  autoLocate?: boolean;
}) {
  const bridge = useRef<Window | null>(null);
  const pending = useRef<{ id: string; tag: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState("");
  const [changedOnly, setChangedOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("Loading field navigation…");
  const changedCount = items.filter(item => item.changed).length;
  const visible = changedOnly ? items.filter(item => item.changed) : items;
  const position = visible.findIndex(item => item.tag === active);

  function locate(tag: string, target = bridge.current) {
    if (!target || pending.current || !items.some(item => item.tag === tag)) return;
    const id = crypto.randomUUID();
    const timer = setTimeout(() => {
      pending.current = null;
      setBusy(false);
      setNotice("Could not locate the field. Select it again to retry.");
    }, 10000);
    pending.current = { id, tag, timer };
    setBusy(true);
    target.postMessage({ type: "idms-field-select", sessionId, requestId: id, tag }, window.location.origin);
  }

  useEffect(() => {
    let located = false;
    setReady(false);
    setActive("");
    setBusy(false);
    setNotice("Loading field navigation…");
    function receive(event: MessageEvent) {
      const data = event.data;
      const request = pending.current;
      if (event.origin !== window.location.origin || !data || data.sessionId !== sessionId) return;
      if (data.type === "idms-fields-ready" && event.source) {
        bridge.current = event.source as Window;
        setReady(true);
        setNotice("Choose a field to jump to its position.");
        const first = items.find(item => item.changed);
        if (!located && autoLocate && first) {
          located = true;
          locate(first.tag, event.source as Window);
        }
      } else if (data.type === "idms-field-result" && event.source === bridge.current &&
                 request && data.requestId === request.id && data.tag === request.tag) {
        clearTimeout(request.timer);
        pending.current = null;
        setBusy(false);
        if (data.ok === true) {
          setActive(data.tag);
          const item = items.find(field => field.tag === data.tag);
          setNotice(item?.changed ? `Changed field: ${item.label}` : `Field: ${item?.label ?? ""}`);
        } else setNotice("The editor could not locate this field. Select it again to retry.");
      }
    }
    window.addEventListener("message", receive);
    return () => {
      window.removeEventListener("message", receive);
      if (pending.current) clearTimeout(pending.current.timer);
      pending.current = null;
      bridge.current = null;
    };
  }, [items, sessionId, autoLocate]);

  if (!items.length) return null;
  return (
    <section className="editor-field-navigation" aria-label="Document field navigation">
      <div className="editor-field-legend">
        <span><i className="field-swatch changed" aria-hidden="true" />Changed from original ({changedCount})</span>
      </div>
      <label>
        <input type="checkbox" checked={changedOnly} disabled={!changedCount || busy}
          onChange={event => setChangedOnly(event.target.checked)} />
        Changed fields only
      </label>
      <select aria-label="Go to field" value={visible.some(item => item.tag === active) ? active : ""}
        disabled={!ready || busy} onChange={event => locate(event.target.value)}>
        <option value="" disabled>Choose a field</option>
        {visible.map(item => <option key={item.tag} value={item.tag}>
          {item.index + 1}. {item.label}{item.changed ? " — changed" : ""}
        </option>)}
      </select>
      <button type="button" className="secondary" disabled={!ready || busy || position <= 0}
        onClick={() => locate(visible[position - 1].tag)} aria-label="Previous field">←</button>
      <button type="button" className="secondary" disabled={!ready || busy || position >= visible.length - 1}
        onClick={() => locate(visible[position + 1].tag)} aria-label="Next field">→</button>
      <span className="muted" role="status">{busy ? "Locating field…" : notice}</span>
    </section>
  );
}
