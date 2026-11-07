"use client";

import { House, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { fetchLatestRevisionCasita } from "@/app/actions/revisiones";
import { useRevisiones } from "@/components/screens/revisiones-provider";
import { vistaExpansionGrupo } from "@/lib/hoy-casitas-expansion";
import {
  type HoyBoardChip,
  type HoyBoardGroup,
} from "@/lib/revisiones-display";
import styles from "./inicio-screen.module.css";

function tituloGrupo(group: HoyBoardGroup) {
  return group.id === "upsell" ? "Upsells vigentes" : group.label;
}

function ChipsGrupo({
  group,
  titulo,
  rows,
  opening,
  onOpen,
}: {
  group: HoyBoardGroup;
  titulo: string;
  rows: readonly HoyBoardChip[];
  opening: string | null;
  onOpen: (chip: HoyBoardChip) => void;
}) {
  return (
    <div className={styles.chips} id={`hoy-chips-${group.id}`} data-hoy-chips={group.id}>
      {rows.map((chip) => {
        const estado =
          (group.id === "check_in" || group.id === "check_in_hoy" || group.id === "check_in_manana") &&
          chip.tone === "blue"
            ? "Upsell"
            : titulo;
        return (
          <button
            key={chip.row?.id || chip.casita}
            type="button"
            className={`hoy-chip tone-${chip.tone}`}
            data-revision-card={chip.row?.id || undefined}
            disabled={opening !== null}
            aria-busy={opening === chip.casita}
            onClick={() => onOpen(chip)}
            aria-label={`Casita ${chip.casita}, ${estado}. Ver detalle`}
          >
            {opening === chip.casita ? (
              <LoaderCircle size={18} className="auth-spinner" aria-hidden="true" />
            ) : (
              chip.casita
            )}
          </button>
        );
      })}
    </div>
  );
}

function Grupo({
  group,
  heading,
  opening,
  onOpen,
}: {
  group: HoyBoardGroup;
  heading: "h3" | "h4";
  opening: string | null;
  onOpen: (chip: HoyBoardChip) => void;
}) {
  const Title = heading;
  const titulo = tituloGrupo(group);
  const [expandido, setExpandido] = useState(false);
  const vista = vistaExpansionGrupo(group, expandido);

  return (
    <div className={heading === "h3" ? styles.group : styles.subGroup} data-hoy-grupo={group.id}>
      <div className={styles.groupHeading}>
        <span className={styles.groupDot} data-tone={group.tone} aria-hidden="true" />
        <Title>{titulo}</Title>
        <span>{vista.encabezado}</span>
      </div>
      {group.rows.length > 0 ? (
        <>
          <ChipsGrupo
            group={group}
            titulo={titulo}
            rows={vista.filasVisibles}
            opening={opening}
            onOpen={onOpen}
          />
          {vista.muestraControl && vista.etiquetaControl ? (
            <button
              className={styles.expandGroup}
              type="button"
              aria-expanded={expandido}
              aria-controls={`hoy-chips-${group.id}`}
              data-hoy-expansion={group.id}
              onClick={() => setExpandido((actual) => !actual)}
            >
              {vista.etiquetaControl}
            </button>
          ) : null}
        </>
      ) : null}
      {group.sections?.map((section) => (
        <Grupo
          key={section.id}
          group={section}
          heading="h4"
          opening={opening}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}

export function HoyCasitas({
  groups,
  total,
}: {
  groups: HoyBoardGroup[];
  total: number;
}) {
  const { openRevision } = useRevisiones();
  const [opening, setOpening] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const openChip = (chip: HoyBoardChip) => {
    if (opening) return;
    if (chip.row) {
      openRevision(chip.row);
      return;
    }
    setOpening(chip.casita);
    setNotice(null);
    if (!navigator.onLine) {
      setNotice(`Casita ${chip.casita}: sin conexión, no tenemos su revisión en este dispositivo.`);
      setOpening(null);
      return;
    }
    void fetchLatestRevisionCasita(chip.casita)
      .then((result) => {
        if (result.error) setNotice(`Casita ${chip.casita}: ${result.error}`);
        else if (!result.row) setNotice(`Casita ${chip.casita} no tiene revisiones registradas.`);
        else openRevision(result.row);
      })
      .catch(() => {
        setNotice(`Casita ${chip.casita}: no pudimos abrir la última revisión.`);
      })
      .finally(() => setOpening(null));
  };

  return (
    <section id="hoy-casitas" className={styles.board} aria-labelledby="hoy-casitas-title">
      <div className={styles.sectionHeading}>
        <h2 id="hoy-casitas-title">Casitas de hoy</h2>
        <span className={styles.count}>{total}</span>
      </div>
      <div className={styles.card}>
        {groups.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>
              <House size={20} aria-hidden="true" />
            </span>
            <p>Sin movimientos por ahora</p>
          </div>
        ) : null}
        {groups.map((group) => (
          <Grupo
            key={group.id}
            group={group}
            heading="h3"
            opening={opening}
            onOpen={(chip) => openChip(chip)}
          />
        ))}
        {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
      </div>
    </section>
  );
}
