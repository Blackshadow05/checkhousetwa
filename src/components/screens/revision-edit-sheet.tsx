"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { editRevisionField, fetchRevisionEditor } from "@/app/actions/revisiones";
import { LoginForm } from "@/components/auth/login-form";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { dedupeRequest } from "@/lib/dedupe-request";
import { useRevisiones } from "@/components/screens/revisiones-provider";
import { CAJA_FUERTE_FILTERS } from "@/lib/revisiones-archive";
import { BOOLEAN_FIELDS, evidencePhotoLimit, QUANTITY_LIMITS, type InventoryKey } from "@/lib/revision-form";
import {
  editorValueFromRaw,
  normalizeRevisionEditValue,
  persistRevisionFieldValue,
  REVISION_EDIT_LABELS,
  revisionEditDecision,
  revisionEvidenceCount,
  validateRevisionField,
  validateRevisionFieldDependencies,
  type RevisionEditField,
} from "@/lib/revision-edit";
import { useOnline } from "@/lib/use-online";
import type { RevisionCasitaInicio } from "@/types/database";

function editorText(field: RevisionEditField, value: string | null | undefined) {
  return normalizeRevisionEditValue(field, value);
}

export function RevisionEditSheet({
  open = true,
  revisionId,
  field,
  onClose,
  onSaved,
}: {
  open?: boolean;
  revisionId: string;
  field: RevisionEditField | null;
  onClose: () => void;
  onSaved?: (result?: { openEvidence?: boolean }) => void;
}) {
  const online = useOnline();
  const { replaceRevision, selectedRevision } = useRevisiones();
  const sessionKey = open && field ? `${revisionId}:${field}` : null;
  const computeInitialText = (targetField: RevisionEditField | null) => {
    if (!targetField || selectedRevision?.id !== revisionId) return null;
    const local = selectedRevision[targetField];
    return editorText(targetField, targetField === "caja_fuerte" && local === "—" ? null : local);
  };
  const computeInitialRoomMove = () =>
    selectedRevision?.id === revisionId ? editorValueFromRaw(selectedRevision.room_move) : "";

  const [activeSessionKey, setActiveSessionKey] = useState<string | null>(sessionKey);
  const [lastField, setLastField] = useState<RevisionEditField | null>(field);
  const [initialText, setInitialText] = useState<string | null>(() => computeInitialText(field));
  const [user, setUser] = useState<{ id: number; nombre: string } | null | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);
  const [checking, setChecking] = useState(Boolean(sessionKey));
  const [raw, setRaw] = useState<RevisionCasitaInicio | null>(null);
  const [value, setValue] = useState(() => computeInitialText(field) ?? "");
  const [roomMove, setRoomMove] = useState(() => computeInitialRoomMove());
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const touched = useRef(false);
  const roomMoveTouched = useRef(false);
  const lastFetchedSession = useRef<string | null>(null);

  if (activeSessionKey !== sessionKey) {
    setActiveSessionKey(sessionKey);
    if (sessionKey && field) {
      const nextInitial = computeInitialText(field);
      setLastField(field);
      setInitialText(nextInitial);
      setValue(nextInitial ?? "");
      setRoomMove(computeInitialRoomMove());
      setUser(undefined);
      setRaw(null);
      setChecking(true);
      setError("");
      setNotice("");
      setAttempt(0);
    }
  }

  const activeField = field ?? lastField;
  const label = activeField ? REVISION_EDIT_LABELS[activeField] : "Dato";

  useEffect(() => {
    if (!open || !field || !sessionKey) return;
    if (lastFetchedSession.current !== sessionKey) {
      lastFetchedSession.current = sessionKey;
      touched.current = false;
      roomMoveTouched.current = false;
    }
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
        const fresh = editorText(field, result.row[field]);
        if (initialText === null || fresh.trim() !== initialText.trim()) {
          setValue(fresh);
          if (initialText !== null && touched.current) {
            setNotice("Este dato cambió hace un momento. Revisa el valor actual antes de guardar.");
          }
        }
        if (field === "caja_fuerte" && !roomMoveTouched.current) {
          setRoomMove(editorValueFromRaw(result.row.room_move));
        }
        setRaw(result.row);
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
  }, [attempt, field, initialText, open, revisionId, sessionKey]);

  const requestClose = () => {
    if (saving.current || busy) return;
    onClose();
  };

  const expected = raw && activeField ? raw[activeField] ?? null : null;
  const currentPhotoCount = raw ? revisionEvidenceCount(raw) : 0;
  const nextPhotoLimit = activeField === "caja_fuerte" ? evidencePhotoLimit(value) : 0;
  const willClearEvidence = activeField === "caja_fuerte" && nextPhotoLimit === 0 && currentPhotoCount > 0;
  const needsPhotosAfterSave = activeField === "caja_fuerte" && nextPhotoLimit > 0 && currentPhotoCount === 0;
  const showRoomMoveInput = activeField === "caja_fuerte" && value === "Room Move";

  const save = async () => {
    if (saving.current || busy || !raw || !activeField) return;
    if (!online) {
      setError("Conéctate para guardar. Conservamos el valor anterior.");
      return;
    }
    const fieldError =
      validateRevisionField(activeField, value) ||
      (showRoomMoveInput ? validateRevisionField("room_move", roomMove) : undefined) ||
      validateRevisionFieldDependencies(activeField, value, raw, {
        clearEvidence: willClearEvidence,
        roomMove: showRoomMoveInput ? roomMove : undefined,
      });
    if (fieldError) {
      setError(fieldError);
      return;
    }
    const fieldNoop = revisionEditDecision(expected, expected, value, activeField) === "noop";
    const roomNoop =
      !showRoomMoveInput ||
      revisionEditDecision(raw.room_move ?? null, raw.room_move ?? null, roomMove, "room_move") === "noop";
    if (fieldNoop && roomNoop && !willClearEvidence) {
      onClose();
      return;
    }
    saving.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await editRevisionField({
        id: revisionId,
        campo: activeField,
        esperado: expected,
        nuevo: persistRevisionFieldValue(activeField, value),
        roomMove: showRoomMoveInput
          ? {
              esperado: raw.room_move ?? null,
              nuevo: persistRevisionFieldValue("room_move", roomMove),
            }
          : undefined,
        limpiarEvidencias: willClearEvidence || undefined,
      });
      if (result.needsLogin) {
        setUser(null);
        setError(result.error ?? "Inicia sesión para guardar este cambio.");
        return;
      }
      if (result.error || !result.row) {
        setError(result.error || "No pudimos confirmar el cambio. Conservamos el valor anterior.");
        return;
      }
      replaceRevision(result.row);
      onSaved?.({ openEvidence: needsPhotosAfterSave });
      onClose();
    } catch {
      setError("No pudimos conectar para guardar el cambio.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={open && Boolean(field)} onClose={requestClose} title={`Editar ${label.toLowerCase()}`}>
      {!activeField ? null : user === null ? (
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
      ) : initialText === null && checking ? (
        <p role="status">Cargando el valor guardado…</p>
      ) : !checking && !raw ? (
        <div className="revision-edit-form">
          <p className="revision-field-error" role="alert">
            {error || "No pudimos cargar el dato guardado."}
          </p>
          <div className="sheet-actions">
            <button type="button" className="secondary-button" onClick={requestClose}>
              Cerrar
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={!online || checking}
              onClick={() => {
                setError("");
                setChecking(true);
                setAttempt((current) => current + 1);
              }}
            >
              Reintentar
            </button>
          </div>
        </div>
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
              ? "El cambio quedará registrado en el historial de ediciones."
              : "Sin conexión. El guardado estará disponible cuando vuelvas a conectarte."}
          </p>
          <FieldControl
            field={activeField}
            label={label}
            value={value}
            onChange={(next) => {
              touched.current = true;
              setNotice("");
              setError("");
              setValue(next);
            }}
            disabled={busy}
          />
          {showRoomMoveInput ? (
            <label className="revision-text-field">
              {REVISION_EDIT_LABELS.room_move}
              <textarea
                name="room_move"
                aria-label={REVISION_EDIT_LABELS.room_move}
                disabled={busy}
                rows={3}
                maxLength={120}
                value={roomMove}
                onChange={(event) => {
                  roomMoveTouched.current = true;
                  setNotice("");
                  setError("");
                  setRoomMove(event.target.value);
                }}
              />
            </label>
          ) : null}
          {willClearEvidence ? (
            <p className="auth-notice" role="status">
              Al guardar, se quitarán {currentPhotoCount === 1 ? "la evidencia actual" : `las ${currentPhotoCount} evidencias actuales`} de esta revisión.
            </p>
          ) : needsPhotosAfterSave ? (
            <p className="auth-notice" role="status">
              Al guardar, se abrirá el editor para añadir la foto de evidencia requerida.
            </p>
          ) : null}
          {notice ? <p className="auth-notice" role="status">{notice}</p> : null}
          <div className="sheet-actions">
            <button type="button" className="secondary-button" disabled={busy} onClick={requestClose}>
              Cancelar
            </button>
            <button className="primary-button" disabled={busy || !online || !raw} aria-busy={checking || busy}>
              {checking || busy ? <LoaderCircle size={17} className="auth-spinner" aria-hidden="true" /> : null}
              {busy ? "Guardando" : "Guardar"}
            </button>
          </div>
          {error ? <p className="revision-field-error" role="alert">{error}</p> : null}
        </form>
      )}
    </BottomSheet>
  );
}

function FieldControl({
  field,
  label,
  value,
  onChange,
  disabled,
}: {
  field: RevisionEditField;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  if (field === "casita") {
    const selected = normalizeRevisionEditValue(field, value);
    return (
      <label className="revision-text-field">
        {label}
        <select name={field} aria-label={label} disabled={disabled} value={selected} onChange={(event) => onChange(event.target.value)}>
          <option value="" disabled>
            Selecciona una casita
          </option>
          {Array.from({ length: 50 }, (_, index) => (
            <option key={index + 1} value={index + 1}>
              {index + 1}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (field === "caja_fuerte") {
    const selected = normalizeRevisionEditValue(field, value);
    return (
      <label className="revision-text-field">
        {label}
        <select name={field} aria-label={label} disabled={disabled} value={selected} onChange={(event) => onChange(event.target.value)}>
          <option value="" disabled>
            Selecciona el estado
          </option>
          {CAJA_FUERTE_FILTERS.map((option) => (
            <option key={option} value={option}>
              {option === "Si" ? "Sí" : option}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (BOOLEAN_FIELDS.has(field as InventoryKey)) {
    const selected = normalizeRevisionEditValue(field, value);
    return (
      <label className="revision-text-field">
        {label}
        <select name={field} aria-label={label} disabled={disabled} value={selected} onChange={(event) => onChange(event.target.value)}>
          <option value="">Sin registro</option>
          <option value="Si">Sí</option>
          <option value="No">No</option>
        </select>
      </label>
    );
  }
  const max = QUANTITY_LIMITS[field as keyof typeof QUANTITY_LIMITS];
  if (max !== undefined) {
    const selected = normalizeRevisionEditValue(field, value);
    return (
      <label className="revision-text-field">
        {label}
        <select name={field} aria-label={label} disabled={disabled} value={selected} onChange={(event) => onChange(event.target.value)}>
          <option value="">Sin registro</option>
          {Array.from({ length: max + 1 }, (_, index) => (
            <option key={index} value={index}>
              {index}
            </option>
          ))}
        </select>
      </label>
    );
  }
  const multiline = field === "notas" || field === "puertas_ventanas" || field === "room_move";
  return (
    <label className="revision-text-field">
      {label}
      {multiline ? (
        <textarea name={field}
          aria-label={label}
          disabled={disabled}
          rows={field === "notas" ? 4 : 3}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input name={field} aria-label={label} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  );
}
