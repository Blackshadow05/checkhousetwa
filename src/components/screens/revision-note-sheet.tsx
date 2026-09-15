"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, LoaderCircle } from "lucide-react";
import { createRevisionNote } from "@/app/actions/revisiones";
import { RevisionPhotoPreview } from "@/components/screens/revision-photo-preview";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { prepareRevisionPhoto } from "@/lib/revision-photos";
import {
  canSubmitNoteRevision,
  MAX_NOTA_REVISION_LENGTH,
  persistNotaRevision,
  persistNotaRevisionImage,
  validateNotaRevision,
  validateNotaRevisionImage,
  type RevisionNoteItem,
} from "@/lib/revision-notes";
import {
  discardUpload,
  ensureBackgroundUploads,
  releaseUploads,
  resolveEvidenciaUrls,
} from "@/lib/revision-evidence-upload";
import type { RevisionPhoto } from "@/lib/revision-form";
import { createUuid } from "@/lib/uuid";
import { useOnline } from "@/lib/use-online";

export function RevisionNoteSheet({
  revisionId,
  onClose,
  onCreated,
}: {
  revisionId: string;
  onClose: () => void;
  onCreated: (note: RevisionNoteItem) => void;
}) {
  const online = useOnline();
  const [nota, setNota] = useState("");
  const [photo, setPhoto] = useState<RevisionPhoto | null>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const saving = useRef(false);
  const saved = useRef(false);
  const mounted = useRef(true);
  const preparingRef = useRef(false);
  const busyRef = useRef(false);
  const photoProtected = useRef(false);
  const photoRef = useRef<RevisionPhoto | null>(null);
  const attemptIds = useRef(new Map<string, string>());
  const libraryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const updatePhoto = (next: RevisionPhoto | null) => {
    photoRef.current = next;
    setPhoto(next);
  };

  useEffect(
    () => () => {
      mounted.current = false;
      const current = photoRef.current;
      if (!current || saved.current || saving.current) return;
      if (photoProtected.current) releaseUploads([current.id]);
      else void discardUpload(current.id);
    },
    [],
  );

  const addPhoto = async (files: FileList | null) => {
    if (
      !files?.length ||
      preparingRef.current ||
      busyRef.current ||
      photoRef.current
    ) {
      return;
    }
    setError("");
    preparingRef.current = true;
    setPreparing(true);
    try {
      const prepared = await prepareRevisionPhoto(files[0]);
      if (!mounted.current) return;
      updatePhoto(prepared);
      ensureBackgroundUploads([prepared]);
    } catch (prepareError) {
      if (mounted.current) {
        setError(
          prepareError instanceof Error
            ? prepareError.message
            : "No pudimos preparar la foto.",
        );
      }
    } finally {
      preparingRef.current = false;
      if (mounted.current) setPreparing(false);
    }
  };

  const removePhoto = () => {
    const current = photoRef.current;
    updatePhoto(null);
    if (!current) return;
    if (photoProtected.current) releaseUploads([current.id]);
    else void discardUpload(current.id);
  };

  const requestClose = () => {
    if (busyRef.current || saving.current) return;
    onClose();
  };

  const attemptIdFor = (payloadKey: string) => {
    const existing = attemptIds.current.get(payloadKey);
    if (existing) return existing;
    const id = createUuid();
    attemptIds.current.set(payloadKey, id);
    return id;
  };

  const submitAttempt = async (
    payloadKey: string,
    payload: { revisionId: string; nota: string; imagen: string | null },
  ) => {
    const result = await createRevisionNote({
      id: attemptIdFor(payloadKey),
      ...payload,
    });
    if (result.conflict) attemptIds.current.delete(payloadKey);
    return result;
  };

  const save = async () => {
    if (saving.current || busyRef.current) return;
    if (preparingRef.current) {
      setError("Espera a que termine de preparar la foto antes de guardar.");
      return;
    }
    if (!online) {
      setError("Conéctate para guardar la nota. Conservamos tu texto y tu foto.");
      return;
    }
    const notaError = validateNotaRevision(nota);
    if (notaError) {
      setError(notaError);
      return;
    }
    const currentPhoto = photoRef.current;
    saving.current = true;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      let imagen: string | null = null;
      if (currentPhoto) {
        setProgress("Subiendo foto…");
        try {
          const paths = await resolveEvidenciaUrls([currentPhoto]);
          imagen = paths[0] ?? null;
        } catch {
          setError(
            "No pudimos subir la foto. Conservamos tu texto y tu foto para reintentar.",
          );
          return;
        }
        if (!imagen) {
          setError(
            "No pudimos subir la foto. Conservamos tu texto y tu foto para reintentar.",
          );
          return;
        }
      }
      const imagenError = validateNotaRevisionImage(imagen);
      if (imagenError) {
        setError(imagenError);
        return;
      }
      const persistedNota = persistNotaRevision(nota);
      const persistedImagen = persistNotaRevisionImage(imagen);
      const payloadKey = JSON.stringify({
        revisionId,
        nota: persistedNota,
        imagen: persistedImagen,
      });
      setProgress("Guardando nota…");
      let result = await submitAttempt(payloadKey, {
        revisionId,
        nota: persistedNota,
        imagen: persistedImagen,
      });
      if (result.conflict) {
        result = await submitAttempt(payloadKey, {
          revisionId,
          nota: persistedNota,
          imagen: persistedImagen,
        });
      }
      if (result.ambiguous) photoProtected.current = true;
      if (result.error || !result.row) {
        setError(
          result.error ||
            "No pudimos confirmar la nota. Conservamos tu texto y tu foto para reintentar.",
        );
        return;
      }
      saved.current = true;
      if (currentPhoto) releaseUploads([currentPhoto.id]);
      onCreated(result.row);
      onClose();
    } catch {
      photoProtected.current = true;
      setError(
        "No pudimos confirmar la nota. Conservamos tu texto y tu foto para reintentar.",
      );
    } finally {
      saving.current = false;
      busyRef.current = false;
      if (mounted.current) {
        setBusy(false);
        setProgress("");
      }
    }
  };

  const canSave = canSubmitNoteRevision({
    submitting: busy,
    preparing,
    online,
    nota,
  });

  return (
    <BottomSheet open onClose={requestClose} title="Agregar nota">
      <form
        className="revision-edit-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <p className="sheet-description" id="revision-note-hint">
          {online
            ? "La nota se guarda en esta revisión. Puedes agregar todas las que necesites."
            : "Sin conexión. Podrás guardarla cuando vuelvas a conectarte; no se pierden el texto ni la foto."}
        </p>
        <label className="revision-text-field">
          Nota
          <textarea
            aria-label="Nota"
            aria-describedby="revision-note-hint"
            disabled={busy}
            rows={5}
            maxLength={MAX_NOTA_REVISION_LENGTH}
            value={nota}
            onChange={(event) => {
              setNota(event.target.value);
              if (error) setError("");
            }}
          />
        </label>
        <div className="revision-note-photo">
          <p className="revision-note-photo-label">Foto (opcional)</p>
          {photo ? (
            <div className="revision-photo-grid">
              <RevisionPhotoPreview
                photo={photo}
                index={0}
                label="Foto de la nota"
                disabled={busy}
                active
                onRemove={removePhoto}
              />
            </div>
          ) : (
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
                Elegir foto
              </button>
            </div>
          )}
          {preparing ? <p role="status">Preparando foto…</p> : null}
          <input
            ref={libraryRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            hidden
            onChange={(event) => {
              void addPhoto(event.target.files);
              event.target.value = "";
            }}
          />
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(event) => {
              void addPhoto(event.target.files);
              event.target.value = "";
            }}
          />
        </div>
        <div className="sheet-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={requestClose}
          >
            Cancelar
          </button>
          <button className="primary-button" disabled={!canSave}>
            {busy ? (
              <>
                <LoaderCircle size={16} className="revision-spinner" />
                {progress || "Guardando…"}
              </>
            ) : preparing ? (
              "Preparando foto…"
            ) : (
              "Guardar"
            )}
          </button>
        </div>
        {error ? (
          <p className="revision-field-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </BottomSheet>
  );
}
