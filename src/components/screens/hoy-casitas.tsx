"use client";

import { House } from "lucide-react";
import { useMemo } from "react";
import { useRevisiones } from "@/components/screens/revisiones-provider";
import {
  casitaNumber,
  groupHoyCasitas,
} from "@/lib/revisiones-display";
import styles from "./inicio-screen.module.css";

export function HoyCasitas() {
  const { revisiones, today, openRevision, upsells } = useRevisiones();
  const groups = useMemo(
    () => groupHoyCasitas(revisiones, today, upsells),
    [revisiones, today, upsells],
  );
  const total = groups.reduce((sum, group) => sum + group.rows.length, 0);

  return (
    <section className={styles.board} aria-label="Casitas de hoy">
      <div className={styles.sectionHeading}>
        <House size={20} aria-hidden="true" />
        <h2>Casitas de hoy</h2>
        <span className={styles.count}>{total}</span>
      </div>
      <div className={styles.card}>
        {groups.length === 0 && <div className={styles.empty}><h3>Sin movimientos</h3></div>}
        {groups.map((group) => (
          <div key={group.id} className={styles.group}>
            <div className={styles.groupHeading}>
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
