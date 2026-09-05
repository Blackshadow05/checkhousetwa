"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { idbGet, idbPut, IDB_STORES } from "@/lib/idb/database";
import { newRevisionDraft, type RevisionDraft } from "@/lib/revision-form";

const DRAFT_KEY = "new-revision-draft-v1";
type Snapshot = { id: typeof DRAFT_KEY; draft: RevisionDraft | null };

export function useRevisionDraft() {
  const [draft, setDraft] = useState<RevisionDraft | null>(null);
  const [storage, setStorage] = useState<"loading" | "idle" | "saving" | "saved" | "error">("loading");
  const current = useRef<RevisionDraft | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const version = useRef(0);
  const storageAvailable = useRef(true);

  useEffect(() => {
    let cancelled = false;
    void idbGet<Snapshot>(IDB_STORES.snapshots, DRAFT_KEY).then((saved) => {
      if (cancelled) return;
      current.current = saved?.draft ?? newRevisionDraft();
      setDraft(current.current);
      setStorage(saved?.draft ? "saved" : "idle");
    }).catch(() => {
      if (cancelled) return;
      storageAvailable.current = false;
      current.current = newRevisionDraft();
      setDraft(current.current);
      setStorage("error");
    });
    return () => { cancelled = true; };
  }, []);

  const persist = useCallback((next: RevisionDraft | null) => {
    if (!storageAvailable.current) {
      setStorage("error");
      return Promise.resolve();
    }
    const revision = ++version.current;
    setStorage("saving");
    // Serialize commits, including clearing the draft after a successful save.
    queue.current = queue.current.catch(() => {}).then(async () => {
      if (revision !== version.current) return;
      try {
        await idbPut<Snapshot>(IDB_STORES.snapshots, { id: DRAFT_KEY, draft: next });
        if (version.current === revision) setStorage(next ? "saved" : "idle");
      } catch {
        if (version.current === revision) setStorage("error");
      }
    });
    return queue.current;
  }, []);

  const update = useCallback((change: (draft: RevisionDraft) => RevisionDraft) => {
    if (!current.current) return;
    const next = change(current.current);
    current.current = next;
    setDraft(next);
    void persist(next);
  }, [persist]);

  const clear = useCallback(async () => {
    await persist(null);
    current.current = newRevisionDraft();
    setDraft(current.current);
  }, [persist]);

  return { draft, storage, update, clear };
}
