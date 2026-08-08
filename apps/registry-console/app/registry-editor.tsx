"use client";

import { useEffect, useMemo, useState } from "react";
import type { ConciergeRegistryContent } from "bitcoin-staking-mcp";
import type { PublisherSession } from "../lib/auth";
import type { RevisionEntry } from "../lib/store";

type Section = "bonds" | "custody" | "projects" | "products" | "notices" | "integrations" | "sources";
const labels: Record<Section, string> = {
  bonds: "Bonds",
  custody: "Custody paths",
  projects: "Projects",
  products: "Products",
  notices: "Notices",
  integrations: "Partners & integrations",
  sources: "Sources",
};

export default function RegistryEditor({ session }: { session: PublisherSession }) {
  const [content, setContent] = useState<ConciergeRegistryContent | null>(null);
  const [text, setText] = useState<Record<Section, string> | null>(null);
  const [revisions, setRevisions] = useState<RevisionEntry[]>([]);
  const [publishedRevision, setPublishedRevision] = useState<string>("none");
  const [message, setMessage] = useState("Loading registry…");
  const [busy, setBusy] = useState(false);

  useEffect(() => { void refresh(); }, []);
  async function refresh() {
    const response = await fetch("/api/admin/state", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) { setMessage(body.error ?? "Unable to load registry."); return; }
    const value = body.editorContent as ConciergeRegistryContent;
    setContent(value);
    setText({
      bonds: pretty(value.bonds),
      custody: pretty(value.custody),
      projects: pretty(value.facts.filter((fact) => fact.category === "project")),
      products: pretty(value.facts.filter((fact) => fact.category === "product")),
      notices: pretty(value.facts.filter((fact) => fact.category === "announcement")),
      integrations: pretty(value.integrations),
      sources: pretty(value.sources),
    });
    setRevisions(body.revisions ?? []);
    setPublishedRevision(body.publishedSnapshot?.revision ?? "none");
    setMessage(body.draft ? `Draft saved ${body.draft.savedAt} by ${body.draft.savedBy}.` : "No saved draft.");
  }
  function compose(): ConciergeRegistryContent {
    if (!content || !text) throw new Error("Registry is not loaded.");
    return {
      ...content,
      bonds: JSON.parse(text.bonds),
      custody: JSON.parse(text.custody),
      facts: [...JSON.parse(text.projects), ...JSON.parse(text.products), ...JSON.parse(text.notices)],
      integrations: JSON.parse(text.integrations),
      sources: JSON.parse(text.sources),
    };
  }
  async function mutate(path: string, method: string, body?: unknown) {
    setBusy(true);
    try {
      const response = await fetch(path, { method, headers: { "content-type": "application/json", "x-registry-csrf": session.csrf }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? `Request failed (${response.status}).`);
      setMessage(pretty(result));
      return result;
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); throw error; }
    finally { setBusy(false); }
  }
  async function runEditorAction(action: () => Promise<void>) {
    try { await action(); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  }
  async function save() { await runEditorAction(async () => { await mutate("/api/admin/draft", "PUT", { content: compose() }); await refresh(); }); }
  async function validate() { await runEditorAction(async () => { await mutate("/api/admin/validate", "POST", { content: compose() }); }); }
  async function diff() { const response = await fetch("/api/admin/diff", { cache: "no-store" }); const result = await response.json(); setMessage(pretty(result)); }
  async function publish() { await mutate("/api/admin/publish", "POST"); await refresh(); }
  async function discard() { await mutate("/api/admin/draft", "DELETE"); await refresh(); }
  async function rollback(revision: string) { if (!window.confirm(`Publish a new revision using ${revision}?`)) return; await mutate("/api/admin/rollback", "POST", { revision }); await refresh(); }
  const dirty = useMemo(() => { if (!content || !text) return false; try { return JSON.stringify(compose()) !== JSON.stringify(content); } catch { return true; } }, [content, text]);

  return <main className="shell">
    <p className="eyebrow">Scout control plane</p><h1>Live Knowledge Registry</h1>
    <div className="meta"><span>Publisher: {session.email}</span><span>Published revision: {publishedRevision}</span><span>{dirty ? "Unsaved local edits" : "Editor matches loaded state"}</span></div>
    {content && <div className="toolbar"><label>Registry reviewed at (UTC) <input type="datetime-local" value={content.reviewedAt.slice(0, 16)} onChange={(event) => { if (event.target.value) setContent({ ...content, reviewedAt: new Date(`${event.target.value}:00.000Z`).toISOString() }); }} /></label><span>Review deadline: {new Date(new Date(content.reviewedAt).getTime() + 7 * 86_400_000).toISOString()}</span></div>}
    <div className="toolbar">
      <button disabled={busy || !text} onClick={save}>Save draft</button>
      <button disabled={busy || !text} className="secondary" onClick={validate}>Validate</button>
      <button disabled={busy} className="secondary" onClick={diff}>Preview diff</button>
      <button disabled={busy} onClick={publish}>Publish</button>
      <button disabled={busy} className="danger" onClick={discard}>Discard draft</button>
    </div>
    <p className={message.toLowerCase().includes("error") || message.toLowerCase().includes("invalid") ? "status error" : "status"}>{message}</p>
    {text && <div className="grid">{(Object.keys(labels) as Section[]).map((section) => <section className={`card ${section === "bonds" || section === "custody" ? "wide" : ""}`} key={section}><h2>{labels[section]}</h2><textarea aria-label={labels[section]} value={text[section]} onChange={(event) => setText({ ...text, [section]: event.target.value })} /></section>)}</div>}
    <section className="card wide" style={{ marginTop: 18 }}><h2>Revision history</h2>{revisions.length === 0 ? <p>No revisions published yet.</p> : revisions.map((revision) => <div className="meta" key={revision.revision} style={{ marginBottom: 10 }}><span>{revision.revision}</span><span>{revision.publishedAt}</span><span>{revision.publishedBy}</span><button disabled={busy || revision.revision === publishedRevision} className="secondary" onClick={() => rollback(revision.revision)}>Roll back</button></div>)}</section>
  </main>;
}

function pretty(value: unknown) { return JSON.stringify(value, null, 2); }
