"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  Copy,
  History,
  House,
  Lock,
  NotebookPen,
  Package,
  Pencil,
  Plus,
  ShieldCheck,
  Tv,
} from "lucide-react";
import { EvidenceGallery } from "@/components/screens/evidence-gallery";
import { RevisionEditSheet } from "@/components/screens/revision-edit-sheet";
import { RevisionNoteSheet } from "@/components/screens/revision-note-sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import { useRevisiones } from "@/components/screens/revisiones-provider";
import { fetchRevisionEdits, fetchRevisionNotes } from "@/app/actions/revisiones";
import {
  dayLabel,
  ELECTRONIC_FIELDS,
  EQUIPMENT_FIELDS,
  initials,
  puertasVentanasOk,
  revisionEvidence,
  shortTime,
} from "@/lib/revisiones-display";
import {
  displayAuditValue,
  REVISION_EDIT_LABELS,
  type RevisionEditField,
  type RevisionEditHistoryItem,
} from "@/lib/revision-edit";
import {
  mergeNotaRevision,
  type RevisionNoteItem,
} from "@/lib/revision-notes";
import type { InicioRevisionRow } from "@/types/database";
import { useOnline } from "@/lib/use-online";

function FieldValue({ value }: { value: string }) {
  const normalized = value.trim();
  if (
    /^(si|sí|no|check in|check out)$/i.test(normalized) ||
    normalized.toLowerCase().includes("upsell")
  ) {
    return <StatusBadge value={value} />;
  }
  return <span>{value}</span>;
}

function copyText(row: InicioRevisionRow) {
  const lines = [
    `Casita ${row.casita}`,
    `Revisó: ${row.quien_revisa}`,
    `Caja fuerte: ${row.caja_fuerte}`,
    `Fecha: ${row.created_at}`,
  ];
  if (row.puertas_ventanas) lines.push(`Puertas y ventanas: ${row.puertas_ventanas}`);
  if (row.room_move) lines.push(`Movimiento: ${row.room_move}`);
  if (row.notas) lines.push(`Notas: ${row.notas}`);
  return lines.join("\n");
}

function EditButton({
  field,
  onEdit,
}: {
  field: RevisionEditField;
  onEdit: (field: RevisionEditField) => void;
}) {
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={`Editar ${REVISION_EDIT_LABELS[field].toLowerCase()}`}
      onClick={() => onEdit(field)}
    >
      <Pencil size={16} aria-hidden="true" />
    </button>
  );
}

export function RevisionDetailScreen() {
  const { selectedRevision, closeRevision, today } = useRevisiones();
  const online = useOnline();
  const backRef = useRef<HTMLButtonElement>(null);
  const loadingMoreRef = useRef(false);
  const [copyMessage, setCopyMessage] = useState("");
  const [editingField, setEditingField] = useState<RevisionEditField | null>(null);
  const [history, setHistory] = useState<RevisionEditHistoryItem[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyTick, setHistoryTick] = useState(0);
  const [notesState, setNotesState] = useState<{
    revisionId: string;
    rows: RevisionNoteItem[];
    error: string | null;
    hasMore: boolean;
    loadedCount: number;
    loadedRevision: string | null;
    loadingMore: boolean;
  }>({
    revisionId: "",
    rows: [],
    error: null,
    hasMore: false,
    loadedCount: 0,
    loadedRevision: null,
    loadingMore: false,
  });
  const [notesTick, setNotesTick] = useState(0);
  const [noteMessage, setNoteMessage] = useState<{
    revisionId: string;
    text: string;
  } | null>(null);
  const [noteSheetOpen, setNoteSheetOpen] = useState(false);
  const notes = notesState.rows;
  const notesError = notesState.error;
  const notesLoading =
    online && notesState.loadedRevision !== notesState.revisionId;

  useEffect(() => {
    backRef.current?.focus();
  }, [selectedRevision?.id]);

  useEffect(() => {
    const id = selectedRevision?.id ?? "";
    setHistory([]);
    setHistoryError(null);
    setNotesState({
      revisionId: id,
      rows: [],
      error: null,
      hasMore: false,
      loadedCount: 0,
      loadedRevision: null,
      loadingMore: false,
    });
    setNoteMessage(null);
    setNoteSheetOpen(false);
  }, [selectedRevision?.id]);

  useEffect(() => {
    if (!noteMessage) return;
    const timer = window.setTimeout(() => setNoteMessage(null), 4000);
    return () => window.clearTimeout(timer);
  }, [noteMessage]);

  useEffect(() => {
    const id = selectedRevision?.id;
    if (!id || !online) return;
    let live = true;
    void fetchRevisionNotes(id)
      .then((result) => {
        if (!live) return;
        setNotesState((current) => {
          if (current.revisionId !== id) return current;
          if (result.error) {
            return {
              ...current,
              error: result.error,
              loadedRevision: id,
              rows: result.rows.length
                ? mergeNotaRevision(current.rows, result.rows)
                : current.rows,
            };
          }
          return {
            ...current,
            error: null,
            loadedRevision: id,
            rows: mergeNotaRevision(current.rows, result.rows),
            hasMore: result.hasMore,
            loadedCount: result.rows.length,
          };
        });
      })
      .catch(() => {
        if (!live) return;
        setNotesState((current) =>
          current.revisionId === id
            ? {
                ...current,
                error: "No pudimos conectar para cargar las notas.",
                loadedRevision: id,
              }
            : current,
        );
      });
    return () => {
      live = false;
    };
  }, [notesTick, online, selectedRevision?.id]);

  useEffect(() => {
    const id = selectedRevision?.id;
    if (!id) return;
    let live = true;
    setHistoryLoading(true);
    void fetchRevisionEdits(id)
      .then((result) => {
        if (!live) return;
        if (result.error) {
          setHistoryError(result.error);
          if (result.rows.length) setHistory(result.rows);
          return;
        }
        setHistoryError(null);
        setHistory(result.rows);
      })
      .catch(() => {
        if (live) setHistoryError("No pudimos conectar para cargar el historial.");
      })
      .finally(() => {
        if (live) setHistoryLoading(false);
      });
    return () => {
      live = false;
    };
  }, [historyTick, selectedRevision?.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (event.defaultPrevented || document.querySelector(".pswp--open")) {
        return;
      }
      if (document.querySelector(".bottom-sheet[open]")) return;
      closeRevision();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeRevision]);

  if (!selectedRevision) return null;

  const row = selectedRevision;
  const images = revisionEvidence(row);

  const copyRevision = async () => {
    try {
      await navigator.clipboard.writeText(copyText(row));
      setCopyMessage("Detalle copiado");
    } catch {
      setCopyMessage("No se pudo copiar. Inténtalo de nuevo.");
    }
  };

  const handleNoteCreated = (note: RevisionNoteItem) => {
    setNotesState((current) =>
      current.revisionId === note.revisionId
        ? {
            ...current,
            rows: mergeNotaRevision(current.rows, note),
            error: null,
          }
        : current,
    );
    setNoteMessage({ revisionId: note.revisionId, text: "Nota guardada." });
  };

  const loadMoreNotes = async () => {
    const id = notesState.revisionId;
    if (
      !id ||
      !online ||
      loadingMoreRef.current ||
      !notesState.hasMore
    ) {
      return;
    }
    loadingMoreRef.current = true;
    const offset = notesState.loadedCount;
    setNotesState((current) =>
      current.revisionId === id
        ? { ...current, loadingMore: true, error: null }
        : current,
    );
    try {
      const result = await fetchRevisionNotes(id, offset);
      setNotesState((current) => {
        if (current.revisionId !== id) return current;
        if (result.error) {
          return { ...current, loadingMore: false, error: result.error };
        }
        return {
          ...current,
          rows: mergeNotaRevision(current.rows, result.rows),
          hasMore: result.hasMore,
          loadedCount: current.loadedCount + result.rows.length,
          loadingMore: false,
        };
      });
    } catch {
      setNotesState((current) =>
        current.revisionId === id
          ? {
              ...current,
              loadingMore: false,
              error: "No pudimos conectar para cargar las notas.",
            }
          : current,
      );
    } finally {
      loadingMoreRef.current = false;
    }
  };

  return (
    <section
      className="detail-screen"
      role="dialog"
      aria-modal="true"
      aria-labelledby="detail-title"
    >
      <div className="detail-scroll">
        <header className={images.length ? "detail-media" : "detail-toolbar"}>
          <button
            ref={backRef}
            type="button"
            className="detail-back"
            aria-label="Volver"
            onClick={closeRevision}
          >
            <ChevronLeft size={24} />
          </button>
          {images.length > 0 ? (
            <EvidenceGallery paths={images} casita={row.casita} />
          ) : (
            <>
              <div className="detail-edit-heading">
                <h1 id="detail-title">Casita {row.casita}</h1>
                <EditButton field="casita" onEdit={setEditingField} />
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Copiar detalle"
                onClick={() => void copyRevision()}
              >
                <Copy size={18} />
              </button>
            </>
          )}
        </header>

        <div className="detail-body">
          {images.length > 0 && (
            <div className="detail-title-row">
              <div className="detail-edit-heading">
                <div>
                  <p className="eyebrow">CASITA</p>
                  <h1 id="detail-title">Casita {row.casita}</h1>
                </div>
                <EditButton field="casita" onEdit={setEditingField} />
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Copiar detalle"
                onClick={() => void copyRevision()}
              >
                <Copy size={18} />
              </button>
            </div>
          )}

          <div className="detail-person-card">
            <span className="person-initials" aria-hidden="true">
              {initials(row.quien_revisa)}
            </span>
            <div>
              <p className="eyebrow">REVISÓ</p>
              <strong>{row.quien_revisa}</strong>
            </div>
            <EditButton field="quien_revisa" onEdit={setEditingField} />
          </div>

          <dl className="detail-meta">
            <div>
              <dt>Fecha</dt>
              <dd>{dayLabel(row.created_at.slice(0, 10), today)}</dd>
            </div>
            <div>
              <dt>Hora</dt>
              <dd>{shortTime(row.created_at)}</dd>
            </div>
          </dl>

          <section className="detail-card" aria-label="Seguridad">
            <div className="detail-card-heading">
              <span className="detail-card-icon">
                <ShieldCheck size={18} aria-hidden="true" />
              </span>
              <h2>Seguridad</h2>
            </div>
            <div className="detail-row">
              <span>
                <Lock size={16} aria-hidden="true" />
                Caja fuerte
              </span>
              <div className="detail-row-value">
                <StatusBadge value={row.caja_fuerte} />
                <EditButton field="caja_fuerte" onEdit={setEditingField} />
              </div>
            </div>
            <div className="detail-row">
              <span>
                <House size={16} aria-hidden="true" />
                Movimiento
              </span>
              <div className="detail-row-value">
                <strong>{row.room_move || "Sin registro"}</strong>
                <EditButton field="room_move" onEdit={setEditingField} />
              </div>
            </div>
            <div className="detail-row">
              <span>Puertas y ventanas</span>
              <div className="detail-row-value">
                <strong
                  className={
                    puertasVentanasOk(row.puertas_ventanas)
                      ? "tone-ok"
                      : "tone-alert"
                  }
                >
                  {row.puertas_ventanas ?? "Sin registro"}
                </strong>
                <EditButton field="puertas_ventanas" onEdit={setEditingField} />
              </div>
            </div>
          </section>

          <section className="detail-card" aria-label="Electrónicos">
            <div className="detail-card-heading">
              <span className="detail-card-icon">
                <Tv size={18} aria-hidden="true" />
              </span>
              <h2>Electrónicos</h2>
            </div>
            {ELECTRONIC_FIELDS.map((field) => (
              <div className="detail-row" key={field.key}>
                <span>{field.label}</span>
                <div className="detail-row-value">
                  <FieldValue value={row[field.key] || "Sin registro"} />
                  <EditButton field={field.key} onEdit={setEditingField} />
                </div>
              </div>
            ))}
          </section>

          <section className="detail-card" aria-label="Equipamiento">
            <div className="detail-card-heading">
              <span className="detail-card-icon">
                <Package size={18} aria-hidden="true" />
              </span>
              <h2>Equipamiento</h2>
            </div>
            {EQUIPMENT_FIELDS.map((field) => (
              <div className="detail-row" key={field.key}>
                <span>{field.label}</span>
                <div className="detail-row-value">
                  <FieldValue value={row[field.key] || "Sin registro"} />
                  <EditButton field={field.key} onEdit={setEditingField} />
                </div>
              </div>
            ))}
          </section>

          <section className="detail-card" aria-label="Notas">
            <div className="detail-card-heading">
              <span className="detail-card-icon">
                <NotebookPen size={18} aria-hidden="true" />
              </span>
              <h2>Notas de revisión</h2>
              <EditButton field="notas" onEdit={setEditingField} />
            </div>
            <p className="detail-notes">{row.notas || "Sin notas"}</p>
          </section>

          <section className="detail-card" aria-label="Historial de ediciones">
            <div className="detail-card-heading">
              <span className="detail-card-icon">
                <History size={18} aria-hidden="true" />
              </span>
              <h2>Historial de ediciones</h2>
            </div>
            {historyLoading && history.length === 0 ? (
              <p className="detail-history-status" role="status">Cargando historial…</p>
            ) : historyError && history.length === 0 ? (
              <p className="detail-history-status" role="status">{historyError}</p>
            ) : history.length === 0 ? (
              <p className="detail-history-status">Aún no hay ediciones en esta revisión.</p>
            ) : (
              <ol className="detail-history">
                {history.map((item) => (
                  <li key={item.id} className="detail-history-item">
                    <p className="detail-history-meta">
                      <strong>{item.actor}</strong>
                      <span>
                        {dayLabel(item.createdAt.slice(0, 10), today)} · {shortTime(item.createdAt)}
                      </span>
                    </p>
                    <p className="detail-history-field">{item.label}</p>
                    <p className="detail-history-change">
                      <span>
                        <span className="detail-history-dir">Antes</span>
                        {displayAuditValue(item.previous)}
                      </span>
                      <span>
                        <span className="detail-history-dir">Ahora</span>
                        {displayAuditValue(item.next)}
                      </span>
                    </p>
                  </li>
                ))}
              </ol>
            )}
            {historyError && history.length > 0 ? (
              <p className="detail-history-status" role="status">{historyError}</p>
            ) : null}
          </section>

          <section className="detail-card" aria-label="Notas adicionales">
            <div className="detail-card-heading">
              <span className="detail-card-icon">
                <NotebookPen size={18} aria-hidden="true" />
              </span>
              <h2>Notas adicionales</h2>
            </div>
            {notes.length === 0 ? (
              notesError ? null : !online ? (
                <p className="detail-history-status" role="status">
                  Sin conexión. Las notas se cargarán al reconectar.
                </p>
              ) : notesLoading ? (
                <p className="detail-history-status" role="status">Cargando notas…</p>
              ) : (
                <p className="detail-history-status">
                  Aún no hay notas adicionales. Usa «Agregar nota» para registrar la primera.
                </p>
              )
            ) : (
              <ol className="detail-notes-list">
                {notes.map((note) => (
                  <li key={note.id} className="detail-note-item">
                    <p className="detail-note-text">{note.nota}</p>
                    {note.imagen ? (
                      <div className="detail-note-media">
                        <EvidenceGallery
                          paths={[note.imagen]}
                          casita={row.casita}
                        />
                      </div>
                    ) : null}
                    <p className="detail-note-meta">
                      <strong>{note.usuario || "Sin usuario"}</strong>
                      <span>
                        {note.createdAt
                          ? `${dayLabel(note.createdAt.slice(0, 10), today)} · ${shortTime(note.createdAt)}`
                          : "Sin fecha"}
                      </span>
                    </p>
                  </li>
                ))}
              </ol>
            )}
            {notesState.hasMore ? (
              <button
                type="button"
                className="secondary-button detail-note-more"
                disabled={notesLoading || notesState.loadingMore || !online}
                onClick={() => void loadMoreNotes()}
              >
                {notesState.loadingMore ? "Cargando más…" : "Cargar más notas"}
              </button>
            ) : null}
            {notesError ? (
              <p className="detail-history-status" role="status">{notesError}</p>
            ) : null}
            {notesError && online ? (
              <button
                type="button"
                className="secondary-button detail-note-retry"
                onClick={() => setNotesTick((tick) => tick + 1)}
              >
                Reintentar
              </button>
            ) : null}
            <button
              type="button"
              className="secondary-button detail-note-add"
              onClick={() => {
                setNoteMessage(null);
                setNoteSheetOpen(true);
              }}
            >
              <Plus size={18} aria-hidden="true" />
              Agregar nota
            </button>
            {noteMessage && noteMessage.revisionId === notesState.revisionId ? (
              <p className="detail-note-feedback" role="status">{noteMessage.text}</p>
            ) : null}
          </section>

          <p className="copy-feedback" role="status">
            {copyMessage}
          </p>
        </div>
      </div>
      {editingField ? (
        <RevisionEditSheet
          revisionId={row.id}
          field={editingField}
          onClose={() => setEditingField(null)}
          onSaved={() => setHistoryTick((tick) => tick + 1)}
        />
      ) : null}
      {noteSheetOpen ? (
        <RevisionNoteSheet
          revisionId={row.id}
          onClose={() => setNoteSheetOpen(false)}
          onCreated={handleNoteCreated}
        />
      ) : null}
    </section>
  );
}
