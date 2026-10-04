"use client";

import { House } from "lucide-react";
import { useRevisiones } from "@/components/screens/revisiones-provider";
import { casitaNumber, type groupHoyCasitas } from "@/lib/revisiones-display";
import styles from "./inicio-screen.module.css";

export function HoyCasitas({
  groups,
  total,
}: {
  groups: ReturnType<typeof groupHoyCasitas>;
  total: number;
}) {
  const { openRevision } = useRevisiones();

  return (
    <section id="hoy-casitas" className={styles.board} aria-labelledby="hoy-casitas-title">
      <div className={styles.sectionHeading}>
        <h2 id="hoy-casitas-title">Casitas de hoy</h2>
        <span className={styles.count}>{total}</span>
      </div>
      <div className={styles.card}>
        {groups.length === 0 && (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>
              <House size={20} aria-hidden="true" />
            </span>
            <p>Sin movimientos por ahora</p>
          </div>
        )}
        {groups.map((group) => (
          <div key={group.id} className={styles.group}>
            <div className={styles.groupHeading}>
              <span className={styles.groupDot} data-tone={group.tone} aria-hidden="true" />
              <h3>{group.id === "upsell" ? "Upsells vigentes" : group.label}</h3>
              <span>{group.rows.length}</span>
            </div>
            <div className={styles.chips}>
              {group.rows.map((row) => {
                const number = casitaNumber(row.casita);
                return (
                  <button
                    key={row.id || number}
                    type="button"
                    className={`hoy-chip tone-${group.tone}`}
                    data-revision-card={row.id || undefined}
                    onClick={() => openRevision(row)}
                    aria-label={`Casita ${number}, ${group.label}. Ver detalle`}
                  >
                    {number}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
