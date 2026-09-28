"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { editRevisionField, fetchRevisionEditor } from "@/app/actions/revisiones";
import { LoginForm } from "@/components/auth/login-form";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { dedupeRequest } from "@/lib/dedupe-request";
import { useRevisiones } from "@/components/screens/revisiones-provider";
import { CAJA_FUERTE_FILTERS } from "@/lib/revisiones-archive";
import { BOOLEAN_FIELDS, QUANTITY_LIMITS, type InventoryKey } from "@/lib/revision-form";
import {
  editorValueFromRaw,
  persistRevisionFieldValue,
  REVISION_EDIT_LABELS,
  revisionEditDecision,
  validateRevisionField,
  validateRevisionFieldDependencies,
  type RevisionEditField,
} from "@/lib/revision-edit";
import { useOnline } from "@/lib/use-online";
import type { RevisionCasitaInicio } from "@/types/database";

function editorText(field: RevisionEditField, value: string | null | undefined) {
  const text = editorValueFromRaw(value);
  if (
    (field === "casita" || QUANTITY_LIMITS[field as keyof typeof QUANTITY_LIMITS] !== undefined) &&
    /^\d+$/.test(text)
  ) {
    return String(Number(text));
  }
  return text;
}

export function RevisionEditSheet({
  revisionId,
  field,
  onClose,
  onSaved,
}: {
  revisionId: string;
  field: RevisionEditField;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const online = useOnline();
  const { replaceRevision, selectedRevision } = useRevisiones();
  const [initialText] = useState(() => {
    if (selectedRevision?.id !== revisionId) return null;
    const local = selectedRevision[field];
    return editorText(field, field === "caja_fuerte" && local === "—" ? null : local);
  });
  const [user, setUser] = useState<{ id: number; nombre: string } | null | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);
  const [checking, setChecking] = useState(true);
  const [raw, setRaw] = useState<RevisionCasitaInicio | null>(null);
  const [value, setValue] = useState(initialText ?? "");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const touched = useRef(false);
  const label = REVISION_EDIT_LABELS[field];

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
        const fresh = editorText(field, result.row[field]);
        if (initialText === null || fresh.trim() !== initialText.trim()) {
          setValue(fresh);
          if (initialText !== null && touched.current) {
            setNotice("Este dato cambió hace un momento. Revisa el valor actual antes de guardar.");
          }
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
  }, [attempt, field, initialText, revisionId]);

  const expected = raw ? raw[field] ?? null : null;

  const save = async () => {
    if (saving.current || busy || !raw) return;
    if (!online) {
      setError("Conéctate para guardar. Conservamos el valor anterior.");
      return;
    }
    const fieldError =
      validateRevisionField(field, value) ||
      validateRevisionFieldDependencies(field, value, raw);
    if (fieldError) {
      setError(fieldError);
      return;
    }
    if (revisionEditDecision(expected, expected, value, field) === "noop") {
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
        campo: field,
        esperado: expected,
        nuevo: persistRevisionFieldValue(field, value),
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
      onSaved?.();
      onClose();
    } catch {
      setError("No pudimos conectar para guardar el cambio.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  return (
    <BottomSheet open onClose={onClose} title={`Editar ${label.toLowerCase()}`}>
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
      ) : initialText === null && checking ? (
        <p role="status">Cargando el valor guardado…</p>
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
            field={field}
            label={label}
            value={value}
            onChange={(next) => {
              touched.current = true;
              setNotice("");
              setValue(next);
            }}
            disabled={busy}
          />
          {notice ? <p className="auth-notice" role="status">{notice}</p> : null}
          <div className="sheet-actions">
            <button type="button" className="secondary-button" disabled={busy} onClick={onClose}>
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
    const selected = /^\d+$/.test(value) ? String(Number(value)) : value;
    return (
      <label className="revision-text-field">
        {label}
        <select aria-label={label} disabled={disabled} value={selected} onChange={(event) => onChange(event.target.value)}>
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
    return (
      <label className="revision-text-field">
        {label}
        <select aria-label={label} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)}>
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
    return (
      <label className="revision-text-field">
        {label}
        <select aria-label={label} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">Sin registro</option>
          <option value="Si">Sí</option>
          <option value="No">No</option>
        </select>
      </label>
    );
  }
  const max = QUANTITY_LIMITS[field as keyof typeof QUANTITY_LIMITS];
  if (max !== undefined) {
    const selected = /^\d+$/.test(value) ? String(Number(value)) : value;
    return (
      <label className="revision-text-field">
        {label}
        <select aria-label={label} disabled={disabled} value={selected} onChange={(event) => onChange(event.target.value)}>
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
        <textarea
          aria-label={label}
          disabled={disabled}
          rows={field === "notas" ? 4 : 3}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input aria-label={label} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  );
}
