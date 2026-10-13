"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { idbGet, idbPut, IDB_STORES } from "@/lib/idb/database";
import { discardUpload } from "@/lib/revision-evidence-upload";
import { newRevisionDraft, type RevisionDraft, type RevisionMode } from "@/lib/revision-form";

const DRAFT_KEY = "new-revision-draft-v1";
const SAVED_KEY = "saved-revision-drafts-v1";
const SAVED_EVENT = "casitas:saved-drafts";
type Snapshot = { id: typeof DRAFT_KEY; draft: RevisionDraft | null };
export type SavedRevisionDraft = { draft: RevisionDraft; savedAt: string };
type SavedSnapshot = { id: typeof SAVED_KEY; items: SavedRevisionDraft[] };
let draftToRestore: RevisionDraft | null = null;
let savedQueue: Promise<unknown> = Promise.resolve();

function changeSavedDrafts(change: (items: SavedRevisionDraft[]) => SavedRevisionDraft[]) {
  const next = savedQueue.catch(() => {}).then(async () => {
    const saved = await idbGet<SavedSnapshot>(IDB_STORES.snapshots, SAVED_KEY);
    await idbPut<SavedSnapshot>(IDB_STORES.snapshots, { id: SAVED_KEY, items: change(saved?.items ?? []) });
    window.dispatchEvent(new Event(SAVED_EVENT));
  });
  savedQueue = next;
  return next;
}

export function saveRevisionDraftForLater(draft: RevisionDraft) {
  return changeSavedDrafts((items) => [{ draft, savedAt: new Date().toISOString() }, ...items.filter((item) => item.draft.id !== draft.id)]);
}

export function takeSavedRevisionDraft(id: string) {
  return changeSavedDrafts((items) => items.filter((item) => item.draft.id !== id));
}

export function useSavedRevisionDrafts() {
  const [items, setItems] = useState<SavedRevisionDraft[]>([]);
  useEffect(() => {
    let live = true;
    const load = () => void idbGet<SavedSnapshot>(IDB_STORES.snapshots, SAVED_KEY)
      .then((saved) => { if (live) setItems(saved?.items ?? []); })
      .catch(() => {});
    load();
    window.addEventListener(SAVED_EVENT, load);
    return () => {
      live = false;
      window.removeEventListener(SAVED_EVENT, load);
    };
  }, []);
  return items;
}

export function revisionDraftHasProgress(draft: RevisionDraft | null) {
  if (!draft) return false;
  if (draft.photos.length || draft.completarDespues || draft.completa) return true;
  return Object.entries(draft.values).some(([key, value]) => key !== "quien_revisa" && key !== "created_at" && String(value ?? "").trim() !== "");
}

export function restoreRevisionDraft(draft: RevisionDraft) {
  draftToRestore = draft;
}

function isFormRoute() {
  return new URLSearchParams(window.location.search).get("nueva") === "1";
}

export function useRevisionDraft(open: boolean, mode: RevisionMode = "manual") {
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
  const modeRef = useRef(mode);

  useLayoutEffect(() => {
    modeRef.current = mode;
  }, [mode]);

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
    const next = draftToRestore ?? newRevisionDraft(modeRef.current);
    draftToRestore = null;
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
      current.current = newRevisionDraft(modeRef.current);
      setDraft(current.current);
      setStorage("idle");
      if (saved?.draft) void persist(null);
    }).catch(() => {
      if (cancelled || gen !== generation.current) return;
      storageAvailable.current = false;
      current.current = newRevisionDraft(modeRef.current);
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
        if (!draftToRestore) return;
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

  const detach = useCallback(() => {
    generation.current += 1;
    current.current = newRevisionDraft(modeRef.current);
    setDraft(current.current);
    void persist(null);
  }, [persist]);

  const keepForLater = useCallback(async () => {
    const saved = current.current;
    if (!saved) return;
    await saveRevisionDraftForLater(saved);
    if (current.current === saved) detach();
  }, [detach]);

  return { draft, storage, update, detach, keepForLater };
}
