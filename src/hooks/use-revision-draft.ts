"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { idbGet, idbPut, IDB_STORES } from "@/lib/idb/database";
import { discardUpload } from "@/lib/revision-evidence-upload";
import { newRevisionDraft, type RevisionDraft } from "@/lib/revision-form";

const DRAFT_KEY = "new-revision-draft-v1";
type Snapshot = { id: typeof DRAFT_KEY; draft: RevisionDraft | null };

function isFormRoute() {
  return new URLSearchParams(window.location.search).get("nueva") === "1";
}

export function useRevisionDraft(open: boolean) {
  const [draft, setDraft] = useState<RevisionDraft | null>(null);
  const [storage, setStorage] = useState<"loading" | "idle" | "saving" | "saved" | "error">("loading");
  const current = useRef<RevisionDraft | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const version = useRef(0);
  const generation = useRef(0);
  const storageAvailable = useRef(true);
  const restoreOnOpen = useRef<boolean | null>(null);
  if (restoreOnOpen.current === null && typeof window !== "undefined") {
    restoreOnOpen.current = isFormRoute();
  }
  const wasOpen = useRef(open);

  const persist = useCallback((next: RevisionDraft | null) => {
    if (!storageAvailable.current) {
      setStorage("error");
      return Promise.resolve();
    }
    const revision = ++version.current;
    setStorage("saving");
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

  const discardPhotos = (photos: RevisionDraft["photos"] | undefined) => {
    for (const photo of photos ?? []) void discardUpload(photo.id);
  };

  const beginFresh = useCallback(() => {
    generation.current += 1;
    discardPhotos(current.current?.photos);
    const next = newRevisionDraft();
    current.current = next;
    setDraft(next);
    void persist(next);
  }, [persist]);

  const abandon = useCallback(async () => {
    generation.current += 1;
    discardPhotos(current.current?.photos);
    await persist(null);
    current.current = newRevisionDraft();
    setDraft(current.current);
  }, [persist]);

  useEffect(() => {
    let cancelled = false;
    const gen = generation.current;
    const restore = isFormRoute();
    void idbGet<Snapshot>(IDB_STORES.snapshots, DRAFT_KEY).then((saved) => {
      if (cancelled || gen !== generation.current) return;
      if (restore && saved?.draft) {
        current.current = saved.draft;
        setDraft(saved.draft);
        setStorage("saved");
        return;
      }
      current.current = newRevisionDraft();
      setDraft(current.current);
      setStorage("idle");
      if (saved?.draft) void persist(null);
    }).catch(() => {
      if (cancelled || gen !== generation.current) return;
      storageAvailable.current = false;
      current.current = newRevisionDraft();
      setDraft(current.current);
      setStorage("error");
    });
    return () => { cancelled = true; };
  }, [persist]);

  useLayoutEffect(() => {
    const previouslyOpen = wasOpen.current;
    wasOpen.current = open;
    if (open && !previouslyOpen) {
      if (restoreOnOpen.current) {
        restoreOnOpen.current = false;
        return;
      }
      beginFresh();
      return;
    }
    if (!open && previouslyOpen) void abandon();
  }, [abandon, beginFresh, open]);

  const update = useCallback((change: (draft: RevisionDraft) => RevisionDraft) => {
    if (!current.current) return;
    const next = change(current.current);
    current.current = next;
    setDraft(next);
    void persist(next);
  }, [persist]);

  const clear = useCallback(async () => {
    await abandon();
  }, [abandon]);

  return { draft, storage, update, clear };
}
