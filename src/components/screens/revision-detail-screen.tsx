"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  Copy,
  House,
  Lock,
  NotebookPen,
  Package,
  ShieldCheck,
  Tv,
} from "lucide-react";
import { EvidenceGallery } from "@/components/screens/evidence-gallery";
import { StatusBadge } from "@/components/ui/status-badge";
import { useRevisiones } from "@/components/screens/revisiones-provider";
import {
  dayLabel,
  ELECTRONIC_FIELDS,
  EQUIPMENT_FIELDS,
  hasRevisionValue,
  initials,
  puertasVentanasOk,
  revisionEvidence,
  shortTime,
} from "@/lib/revisiones-display";
import type { InicioRevisionRow } from "@/types/database";

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

export function RevisionDetailScreen() {
  const { selectedRevision, closeRevision, today } = useRevisiones();
  const backRef = useRef<HTMLButtonElement>(null);
  const [copyMessage, setCopyMessage] = useState("");

  useEffect(() => {
    backRef.current?.focus();
  }, [selectedRevision?.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRevision();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeRevision]);

  if (!selectedRevision) return null;

  const row = selectedRevision;
  const images = revisionEvidence(row);
  const equipment = EQUIPMENT_FIELDS.filter((field) =>
    hasRevisionValue(row[field.key]),
  );

  const copyRevision = async () => {
    try {
      await navigator.clipboard.writeText(copyText(row));
      setCopyMessage("Detalle copiado");
    } catch {
      setCopyMessage("No se pudo copiar. Inténtalo de nuevo.");
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
            aria-label="Volver a revisiones"
            onClick={closeRevision}
          >
            <ChevronLeft size={24} />
          </button>
          {images.length > 0 ? (
            <EvidenceGallery paths={images} casita={row.casita} />
          ) : (
            <>
              <h1 id="detail-title">Casita {row.casita}</h1>
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
              <div>
                <p className="eyebrow">CASITA</p>
                <h1 id="detail-title">Casita {row.casita}</h1>
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
              <StatusBadge value={row.caja_fuerte} />
            </div>
            {row.room_move && (
              <div className="detail-row">
                <span>
                  <House size={16} aria-hidden="true" />
                  Movimiento
                </span>
                <strong>{row.room_move}</strong>
              </div>
            )}
            <div className="detail-row">
              <span>Puertas y ventanas</span>
              <strong
                className={
                  puertasVentanasOk(row.puertas_ventanas)
                    ? "tone-ok"
                    : "tone-alert"
                }
              >
                {row.puertas_ventanas ?? "Sin registro"}
              </strong>
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
                <FieldValue value={row[field.key] ?? "0"} />
              </div>
            ))}
          </section>

          {equipment.length > 0 && (
            <section className="detail-card" aria-label="Equipamiento">
              <div className="detail-card-heading">
                <span className="detail-card-icon">
                  <Package size={18} aria-hidden="true" />
                </span>
                <h2>Equipamiento</h2>
              </div>
              {equipment.map((field) => (
                <div className="detail-row" key={field.key}>
                  <span>{field.label}</span>
                  <FieldValue value={row[field.key] ?? ""} />
                </div>
              ))}
            </section>
          )}

          {row.notas && (
            <section className="detail-card" aria-label="Notas">
              <div className="detail-card-heading">
                <span className="detail-card-icon">
                  <NotebookPen size={18} aria-hidden="true" />
                </span>
                <h2>Notas de revisión</h2>
              </div>
              <p className="detail-notes">{row.notas}</p>
            </section>
          )}

          <p className="copy-feedback" role="status">
            {copyMessage}
          </p>
        </div>
      </div>
    </section>
  );
}
