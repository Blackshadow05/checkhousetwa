"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, LoaderCircle, X } from "lucide-react";
import { editRevisionEvidence, fetchRevisionEditor } from "@/app/actions/revisiones";
import { LoginForm } from "@/components/auth/login-form";
import { RevisionPhotoPreview } from "@/components/screens/revision-photo-preview";
import { useRevisiones } from "@/components/screens/revisiones-provider";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { cloudinaryPreviewUrl } from "@/lib/cloudinary";
import { dedupeRequest } from "@/lib/dedupe-request";
import {
  addEvidenceDraftItems,
  canAddEvidenceDraft,
  evidenceDraftCancelPlan,
  evidenceDraftFromRow,
  evidenceDraftNeedsUpload,
  evidenceDraftSlots,
  evidenceSlotsFromRow,
  markEvidenceDraftUploaded,
  removeEvidenceDraftItem,
  snapshotEvidenceDraft,
  type EvidenceDraftItem,
  type EvidenceSlots,
} from "@/lib/revision-evidence-edit";
import { EVIDENCE_FIELDS } from "@/lib/revision-evidence";
import {
  discardUpload,
  ensureBackgroundUploads,
  releaseUploads,
  resolveEvidenciaUrls,
} from "@/lib/revision-evidence-upload";
import { evidencePhotoLimit, type RevisionPhoto } from "@/lib/revision-form";
import { prepareRevisionPhoto } from "@/lib/revision-photos";
import { useOnline } from "@/lib/use-online";
import type { RevisionCasitaInicio } from "@/types/database";

function ExistingEvidencePreview({
  path,
  index,
  disabled,
  onRemove,
}: {
  path: string;
  index: number;
  disabled: boolean;
  onRemove: () => void;
}) {
  const label = `Evidencia ${index + 1}`;
  return (
    <figure className="revision-photo">
      <div className="revision-photo-open">
        {/* Remote Cloudinary previews stay out of the image optimizer. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cloudinaryPreviewUrl(path)} alt={label} decoding="async" />
      </div>
      <button
        type="button"
        className="revision-photo-remove"
        onClick={onRemove}
        disabled={disabled}
        aria-label={`Quitar ${label}`}
      >
        <X size={17} aria-hidden="true" />
      </button>
      <figcaption>
        <strong>{label}</strong>
        <span>Foto actual</span>
      </figcaption>
    </figure>
  );
}

export function RevisionEvidenceEditSheet({
  revisionId,
  onClose,
  onSaved,
}: {
  revisionId: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const online = useOnline();
  const { replaceRevision, selectedRevision } = useRevisiones();
  const [user, setUser] = useState<{ id: number; nombre: string } | null | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);
  const [checking, setChecking] = useState(true);
  const [raw, setRaw] = useState<RevisionCasitaInicio | null>(null);
  const [items, setItems] = useState<EvidenceDraftItem[]>(() =>
    selectedRevision?.id === revisionId ? evidenceDraftFromRow(selectedRevision) : [],
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [progress, setProgress] = useState("");
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const saving = useRef(false);
  const saved = useRef(false);
  const mounted = useRef(true);
  const touched = useRef(false);
  const photoProtected = useRef(false);
  const preparingRef = useRef(false);
  const busyRef = useRef(false);
  const itemsRef = useRef(items);
  const snapshotRef = useRef<EvidenceDraftItem[]>(snapshotEvidenceDraft(items));
  const libraryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const updateItems = (next: EvidenceDraftItem[]) => {
    itemsRef.current = next;
    setItems(next);
  };

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(
    () => () => {
      mounted.current = false;
      if (saved.current || saving.current) return;
      const { discard } = evidenceDraftCancelPlan(snapshotRef.current, itemsRef.current);
      for (const item of discard) {
        if (photoProtected.current) releaseUploads([item.id]);
        else void discardUpload(item.id);
      }
    },
    [],
  );

  useEffect(() => {
    let live = true;
    void dedupeRequest(`editor:${revisionId}`, () => fetchRevisionEditor(revisionId))
      .then((result) => {
        if (!live) return;
        if (!result.user && !result.error) {
          setUser(null);
          return;
        }
        setUser(result.user);
        if (result.error || !result.row) {
          setError(result.error || "No encontramos esta revisión.");
          return;
        }
        setRaw(result.row);
        if (!touched.current) {
          const next = evidenceDraftFromRow(result.row);
          snapshotRef.current = snapshotEvidenceDraft(next);
          updateItems(next);
        }
      })
      .catch(() => {
        if (live) setError("No pudimos conectar para abrir el editor.");
      })
      .finally(() => {
        if (live) setChecking(false);
      });
    return () => {
      live = false;
    };
  }, [attempt, revisionId]);

  const cajaFuerte = raw?.caja_fuerte ?? (selectedRevision?.id === revisionId ? selectedRevision.caja_fuerte : "");
  const limit = evidencePhotoLimit(cajaFuerte === "—" ? "" : cajaFuerte ?? "");
  const canAdd = canAddEvidenceDraft(items, cajaFuerte === "—" ? "" : cajaFuerte);
  const expected: EvidenceSlots | null = raw ? evidenceSlotsFromRow(raw) : null;

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length || preparingRef.current || busyRef.current || !canAdd) return;
    setError("");
    setNotice("");
    preparingRef.current = true;
    setPreparing(true);
    const room = Math.max(0, limit - itemsRef.current.length);
    const selected = Array.from(files).slice(0, room);
    const prepared: RevisionPhoto[] = [];
    let failure = "";
    try {
      for (const file of selected) {
        try {
          prepared.push(await prepareRevisionPhoto(file));
        } catch (prepareError) {
          failure ||= prepareError instanceof Error ? prepareError.message : "No pudimos preparar la foto.";
        }
      }
      if (!mounted.current) return;
      if (prepared.length) {
        touched.current = true;
        setNotice("");
        const result = addEvidenceDraftItems(
          itemsRef.current,
          prepared,
          cajaFuerte === "—" ? "" : cajaFuerte,
        );
        updateItems(result.items);
        ensureBackgroundUploads(result.added.map((item) => item.photo));
        if (files.length > room && room > 0) {
          setNotice(`Solo se agregaron ${room === 1 ? "1 foto" : `${room} fotos`}; el máximo es ${limit}.`);
        }
      }
      if (failure) setError(failure);
    } finally {
      preparingRef.current = false;
      if (mounted.current) setPreparing(false);
    }
  };

  const removeItem = (id: string) => {
    if (busyRef.current) return;
    touched.current = true;
    setNotice("");
    setError("");
    const result = removeEvidenceDraftItem(itemsRef.current, id);
    updateItems(result.items);
    if (result.removed?.kind === "new") {
      if (photoProtected.current) releaseUploads([result.removed.id]);
      else void discardUpload(result.removed.id);
    }
  };

  const requestClose = () => {
    if (busyRef.current || saving.current) return;
    onClose();
  };

  const save = async () => {
    if (saving.current || busyRef.current || !raw || !expected) return;
    if (preparingRef.current) {
      setError("Espera a que termine de preparar las fotos antes de guardar.");
      return;
    }
    if (!online) {
      setError("Conéctate para guardar. Conservamos las fotos actuales.");
      return;
    }
    saving.current = true;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      let working = itemsRef.current;
      if (evidenceDraftNeedsUpload(working)) {
        setProgress("Subiendo fotos…");
        const pending = working.filter(
          (item): item is Extract<EvidenceDraftItem, { kind: "new" }> => item.kind === "new" && !item.path,
        );
        try {
          const paths = await resolveEvidenciaUrls(pending.map((item) => item.photo));
          pending.forEach((item, index) => {
            const path = paths[index];
            if (path) working = markEvidenceDraftUploaded(working, item.id, path);
          });
          updateItems(working);
        } catch {
          setError("No pudimos subir las fotos. Conservamos las evidencias anteriores para reintentar.");
          return;
        }
      }
      const slots = evidenceDraftSlots(working);
      if (!slots) {
        setError("No pudimos subir las fotos. Conservamos las evidencias anteriores para reintentar.");
        return;
      }
      const fotos = EVIDENCE_FIELDS.map((field) => slots[field]).filter((path): path is string => Boolean(path));
      setProgress("Guardando…");
      const result = await editRevisionEvidence({
        id: revisionId,
        esperado: expected,
        fotos,
      });
      if (result.needsLogin) {
        setUser(null);
        setError(result.error ?? "Inicia sesión para guardar este cambio.");
        return;
      }
      if (result.error || !result.row) {
        photoProtected.current = true;
        setError(result.error || "No pudimos confirmar el cambio. Conservamos las fotos anteriores.");
        return;
      }
      saved.current = true;
      for (const item of working) {
        if (item.kind === "new") releaseUploads([item.id]);
      }
      replaceRevision(result.row);
      onSaved?.();
      onClose();
    } catch {
      photoProtected.current = true;
      setError("No pudimos conectar para guardar el cambio.");
    } finally {
      saving.current = false;
      busyRef.current = false;
      if (mounted.current) {
        setBusy(false);
        setProgress("");
      }
    }
  };

  return (
    <BottomSheet open onClose={requestClose} title="Editar fotos de evidencia">
      {user === null ? (
        <LoginForm
          online={online}
          variant="sheet"
          onSuccess={(usuario) => {
            setUser(usuario);
            setError("");
            setChecking(true);
            setAttempt((current) => current + 1);
          }}
        />
      ) : checking && !raw ? (
        <p role="status">Cargando las fotos guardadas…</p>
      ) : (
        <form
          className="revision-edit-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <p className="sheet-description">
            {online
              ? limit === 0
                ? "Esta opción de caja fuerte no admite evidencias. Si hay fotos, quítalas y guarda."
                : "Los cambios se aplican al guardar. Cancelar deja las fotos como están."
              : "Sin conexión. El guardado estará disponible cuando vuelvas a conectarte."}
          </p>
          <div className="revision-note-photo">
            <p className="revision-note-photo-label" id="revision-evidence-edit-label">
              Fotos de evidencia
            </p>
            {items.length === 0 ? (
              <div className="revision-evidence-empty">
                <ImagePlus size={26} strokeWidth={1.5} aria-hidden="true" />
                <p>No hay fotos en esta revisión.</p>
              </div>
            ) : (
              <div className="revision-photo-grid" aria-labelledby="revision-evidence-edit-label">
                {items.map((item, index) =>
                  item.kind === "existing" ? (
                    <ExistingEvidencePreview
                      key={item.id}
                      path={item.path}
                      index={index}
                      disabled={busy}
                      onRemove={() => removeItem(item.id)}
                    />
                  ) : (
                    <RevisionPhotoPreview
                      key={item.id}
                      photo={item.photo}
                      index={index}
                      disabled={busy}
                      active
                      onRemove={() => removeItem(item.id)}
                    />
                  ),
                )}
              </div>
            )}
            {canAdd ? (
              <div className="revision-photo-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy || preparing}
                  onClick={() => cameraRef.current?.click()}
                >
                  <Camera size={17} aria-hidden="true" />
                  Tomar foto
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy || preparing}
                  onClick={() => libraryRef.current?.click()}
                >
                  <ImagePlus size={17} aria-hidden="true" />
                  Elegir fotos
                </button>
              </div>
            ) : null}
            {preparing ? <p role="status">Preparando fotos…</p> : null}
            <input
              name="evidencias-editar-galeria"
              ref={libraryRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              multiple={limit - items.length > 1}
              hidden
              aria-label="Elegir fotos de evidencia"
              onChange={(event) => {
                void addPhotos(event.target.files);
                event.target.value = "";
              }}
            />
            <input
              name="evidencias-editar-camara"
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              aria-label="Tomar foto de evidencia"
              onChange={(event) => {
                void addPhotos(event.target.files);
                event.target.value = "";
              }}
            />
          </div>
          {notice ? <p className="auth-notice" role="status">{notice}</p> : null}
          <div className="sheet-actions">
            <button type="button" className="secondary-button" disabled={busy} onClick={requestClose}>
              Cancelar
            </button>
            <button className="primary-button" disabled={busy || !online || !raw || preparing} aria-busy={checking || busy}>
              {checking || busy ? <LoaderCircle size={17} className="auth-spinner" aria-hidden="true" /> : null}
              {busy ? progress || "Guardando" : "Guardar"}
            </button>
          </div>
          {error ? <p className="revision-field-error" role="alert">{error}</p> : null}
        </form>
      )}
    </BottomSheet>
  );
}
