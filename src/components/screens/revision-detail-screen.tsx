"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  ArrowRightLeft,
  CalendarDays,
  Check,
  ChevronLeft,
  CircleAlert,
  Clock3,
  Copy,
  DoorClosed,
  History,
  Lock,
  MessageSquareText,
  NotebookPen,
  Package,
  Pencil,
  Plus,
  ShieldCheck,
  Tv,
  X,
  type LucideIcon,
} from "lucide-react";
import { EvidenceGallery } from "@/components/screens/evidence-gallery";
import { RevisionEditSheet } from "@/components/screens/revision-edit-sheet";
import { RevisionNoteSheet } from "@/components/screens/revision-note-sheet";
import { RevisionRecognitionDetail } from "@/components/screens/revision-recognition-detail";
import { StatusBadge } from "@/components/ui/status-badge";
import { useRevisiones } from "@/components/screens/revisiones-provider";
import { fetchRevisionEdits, fetchRevisionNotes } from "@/app/actions/revisiones";
import {
  dayLabel,
  ELECTRONIC_FIELDS,
  EQUIPMENT_FIELDS,
  initials,
  normalizeText,
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
import { dedupeRequest } from "@/lib/dedupe-request";

type ValueKind = "empty" | "yes" | "no" | "count" | "status" | "text";

function describeValue(value: string | null | undefined): { kind: ValueKind; text: string } {
  const raw = (value ?? "").trim();
  if (!raw || raw === "—") return { kind: "empty", text: "Sin registro" };
  const normalized = normalizeText(raw);
  if (normalized === "si") return { kind: "yes", text: "Sí" };
  if (normalized === "no") return { kind: "no", text: "No" };
  if (/^\d+$/.test(raw)) return { kind: "count", text: String(Number(raw)) };
  if (
    /^(check inn?|check out|back to back|room move)$/.test(normalized) ||
    normalized.includes("upsell")
  ) {
    return { kind: "status", text: raw };
  }
  return { kind: "text", text: raw };
}

function DetailValue({ value }: { value: string | null | undefined }) {
  const { kind, text } = describeValue(value);
  if (kind === "status") return <StatusBadge value={text} />;
  if (kind === "yes" || kind === "no") {
    const Icon = kind === "yes" ? Check : X;
    return (
      <span className={`detail-pill is-${kind}`}>
        <Icon size={13} strokeWidth={2.6} aria-hidden="true" />
        {text}
      </span>
    );
  }
  return <span className={`detail-value is-${kind}`}>{text}</span>;
}

function DoorsValue({ value }: { value: string | null }) {
  const text = value?.trim();
  if (!text) return <span className="detail-value is-empty">Sin registro</span>;
  const ok = puertasVentanasOk(text);
  const Icon = ok ? Check : CircleAlert;
  return (
    <span className={`detail-pill ${ok ? "is-yes" : "is-no"}`}>
      <Icon size={13} strokeWidth={2.6} aria-hidden="true" />
      {text}
    </span>
  );
}

function DetailRow({
  icon: Icon,
  label,
  field,
  valueText,
  onEdit,
  children,
}: {
  icon: LucideIcon;
  label: string;
  field: RevisionEditField;
  valueText: string;
  onEdit: (field: RevisionEditField) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="detail-row"
      aria-label={`${label}: ${valueText}. Editar`}
      onClick={() => onEdit(field)}
    >
      <span className="detail-row-label">
        <span className="detail-row-icon">
          <Icon size={16} aria-hidden="true" />
        </span>
        {label}
      </span>
      <span className="detail-row-value">
        {children}
        <Pencil size={15} className="detail-edit-icon" aria-hidden="true" />
      </span>
    </button>
  );
}

function DetailTile({
  label,
  field,
  value,
  onEdit,
}: {
  label: string;
  field: RevisionEditField;
  value: string | null | undefined;
  onEdit: (field: RevisionEditField) => void;
}) {
  return (
    <button
      type="button"
      className="detail-tile"
      aria-label={`${label}: ${describeValue(value).text}. Editar`}
      onClick={() => onEdit(field)}
    >
      <span className="detail-tile-top">
        <span className="detail-tile-label">{label}</span>
        <Pencil size={14} className="detail-edit-icon" aria-hidden="true" />
      </span>
      <DetailValue value={value} />
    </button>
  );
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
      <Pencil size={17} aria-hidden="true" />
    </button>
  );
}

export function RevisionDetailScreen() {
  const { selectedRevision, closeRevision, today } = useRevisiones();
  const online = useOnline();
  const backRef = useRef<HTMLButtonElement>(null);
  const [sharedEntry] = useState(
    () => document.documentElement.dataset.detailTransition === "open",
  );
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
    if (!copyMessage) return;
    const timer = window.setTimeout(() => setCopyMessage(""), 2400);
    return () => window.clearTimeout(timer);
  }, [copyMessage]);

  useEffect(() => {
    if (!noteMessage) return;
    const timer = window.setTimeout(() => setNoteMessage(null), 4000);
    return () => window.clearTimeout(timer);
  }, [noteMessage]);

  useEffect(() => {
    const id = selectedRevision?.id;
    if (!id || !online) return;
    let live = true;
    void dedupeRequest(`notes:${id}`, () => fetchRevisionNotes(id))
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
    void dedupeRequest(`edits:${id}`, () => fetchRevisionEdits(id))
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
      data-shared-entry={sharedEntry || undefined}
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
              <h1 id="detail-title">Casita {row.casita}</h1>
              <div className="detail-actions">
                <EditButton field="casita" onEdit={setEditingField} />
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Copiar detalle"
                  onClick={() => void copyRevision()}
                >
                  <Copy size={17} />
                </button>
              </div>
            </>
          )}
        </header>

        <div className="detail-body">
          {images.length > 0 && (
            <div className="detail-title-row">
              <h1 id="detail-title">Casita {row.casita}</h1>
              <div className="detail-actions">
                <EditButton field="casita" onEdit={setEditingField} />
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Copiar detalle"
                  onClick={() => void copyRevision()}
                >
                  <Copy size={17} />
                </button>
              </div>
            </div>
          )}

          <div className="detail-summary">
            <button
              type="button"
              className="detail-person"
              aria-label={`Revisó ${row.quien_revisa}. Editar`}
              onClick={() => setEditingField("quien_revisa")}
            >
              <span className="detail-avatar" aria-hidden="true">
                {initials(row.quien_revisa)}
              </span>
              <span className="detail-person-copy">
                <span>Revisó</span>
                <strong>{row.quien_revisa}</strong>
              </span>
              <Pencil size={15} className="detail-edit-icon" aria-hidden="true" />
            </button>
            <dl className="detail-meta">
              <div>
                <dt>
                  <CalendarDays size={14} aria-hidden="true" />
                  Fecha
                </dt>
                <dd>{dayLabel(row.created_at.slice(0, 10), today)}</dd>
              </div>
              <div>
                <dt>
                  <Clock3 size={14} aria-hidden="true" />
                  Hora
                </dt>
                <dd>{shortTime(row.created_at)}</dd>
              </div>
            </dl>
          </div>

          <section className="detail-card" aria-label="Seguridad">
            <div className="detail-card-heading">
              <span className="detail-card-icon">
                <ShieldCheck size={17} aria-hidden="true" />
              </span>
              <h2>Seguridad</h2>
            </div>
            <div className="detail-rows">
              <DetailRow
                icon={Lock}
                label="Caja fuerte"
                field="caja_fuerte"
                valueText={describeValue(row.caja_fuerte).text}
                onEdit={setEditingField}
              >
                {row.caja_fuerte?.trim() ? (
                  <StatusBadge value={row.caja_fuerte} />
                ) : (
                  <span className="detail-value is-empty">Sin registro</span>
                )}
              </DetailRow>
              <DetailRow
                icon={ArrowRightLeft}
                label="Movimiento"
                field="room_move"
                valueText={describeValue(row.room_move).text}
                onEdit={setEditingField}
              >
                <DetailValue value={row.room_move} />
              </DetailRow>
              <DetailRow
                icon={DoorClosed}
                label="Puertas y ventanas"
                field="puertas_ventanas"
                valueText={describeValue(row.puertas_ventanas).text}
                onEdit={setEditingField}
              >
                <DoorsValue value={row.puertas_ventanas} />
              </DetailRow>
            </div>
          </section>

          <section className="detail-card" aria-label="Electrónicos">
            <div className="detail-card-heading">
              <span className="detail-card-icon">
                <Tv size={17} aria-hidden="true" />
              </span>
              <h2>Electrónicos</h2>
            </div>
            <div className="detail-tiles">
              {ELECTRONIC_FIELDS.map((field) => (
                <DetailTile
                  key={field.key}
                  label={field.label}
                  field={field.key}
                  value={row[field.key]}
                  onEdit={setEditingField}
                />
              ))}
            </div>
          </section>

          <section className="detail-card" aria-label="Equipamiento">
            <div className="detail-card-heading">
              <span className="detail-card-icon">
                <Package size={17} aria-hidden="true" />
              </span>
              <h2>Equipamiento</h2>
            </div>
            <div className="detail-tiles">
              {EQUIPMENT_FIELDS.map((field) => (
                <DetailTile
                  key={field.key}
                  label={field.label}
                  field={field.key}
                  value={row[field.key]}
                  onEdit={setEditingField}
                />
              ))}
            </div>
          </section>

          <section className="detail-card" aria-label="Notas">
            <div className="detail-card-heading">
              <span className="detail-card-icon">
                <NotebookPen size={17} aria-hidden="true" />
              </span>
              <h2>Notas de revisión</h2>
              <EditButton field="notas" onEdit={setEditingField} />
            </div>
            <p className={`detail-notes${row.notas ? "" : " is-empty"}`}>
              {row.notas || "Sin notas"}
            </p>
          </section>

          <section className="detail-card" aria-label="Historial de ediciones">
            <div className="detail-card-heading">
              <span className="detail-card-icon">
                <History size={17} aria-hidden="true" />
              </span>
              <h2>Historial de ediciones</h2>
              {history.length > 0 && <span className="detail-card-count">{history.length}</span>}
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
                      <span className="is-before">
                        <span className="sr-only">Antes: </span>
                        {displayAuditValue(item.previous)}
                      </span>
                      <ArrowRight size={14} className="detail-history-arrow" aria-hidden="true" />
                      <span className="is-after">
                        <span className="sr-only">Ahora: </span>
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
                <MessageSquareText size={17} aria-hidden="true" />
              </span>
              <h2>Notas adicionales</h2>
              {notes.length > 0 && <span className="detail-card-count">{notes.length}</span>}
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
                    <p className="detail-note-meta">
                      <span className="detail-avatar is-small" aria-hidden="true">
                        {note.usuario ? initials(note.usuario) : "?"}
                      </span>
                      <strong>{note.usuario || "Sin usuario"}</strong>
                      <span>
                        {note.createdAt
                          ? `${dayLabel(note.createdAt.slice(0, 10), today)} · ${shortTime(note.createdAt)}`
                          : "Sin fecha"}
                      </span>
                    </p>
                    <p className="detail-note-text">{note.nota}</p>
                    {note.imagen ? (
                      <div className="detail-note-media">
                        <EvidenceGallery
                          paths={[note.imagen]}
                          casita={row.casita}
                        />
                      </div>
                    ) : null}
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
              className="detail-note-add"
              onClick={() => {
                setNoteMessage(null);
                setNoteSheetOpen(true);
              }}
            >
              <Plus size={18} aria-hidden="true" />
              Agregar nota
            </button>
            {noteMessage && noteMessage.revisionId === notesState.revisionId ? (
              <p className="detail-note-feedback" role="status">
                <Check size={14} strokeWidth={2.6} aria-hidden="true" />
                {noteMessage.text}
              </p>
            ) : null}
          </section>
          <RevisionRecognitionDetail items={row.reconocimiento} />
        </div>
      </div>
      <p className="sr-only" role="status">
        {copyMessage}
      </p>
      {copyMessage ? (
        <p className="copy-feedback" aria-hidden="true">
          {copyMessage}
        </p>
      ) : null}
      {editingField ? (
        <RevisionEditSheet
          key={editingField}
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
