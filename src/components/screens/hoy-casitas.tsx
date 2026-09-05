"use client";

import { House } from "lucide-react";
import { useMemo } from "react";
import { useRevisiones } from "@/components/screens/revisiones-provider";
import {
  casitaNumber,
  groupHoyCasitas,
} from "@/lib/revisiones-display";

export function HoyCasitas() {
  const { revisiones, today, openRevision, upsells } = useRevisiones();
  const groups = useMemo(
    () => groupHoyCasitas(revisiones, today, upsells),
    [revisiones, today, upsells],
  );
  const total = groups.reduce((sum, group) => sum + group.rows.length, 0);

  if (groups.length === 0) {
    return (
      <div className="hoy-board-empty">
        <div className="menu-day-icon" aria-hidden="true">
          <House size={22} strokeWidth={1.7} />
        </div>
        <div>
          <p className="menu-day-kicker">Casitas de hoy</p>
          <h2>Sin movimientos aún</h2>
          <p>Cuando haya check in, upsell, room move o check out, los verás aquí.</p>
        </div>
      </div>
    );
  }

  return (
    <section className="hoy-board" aria-label="Casitas de hoy">
      <div className="hoy-board-heading">
        <div>
          <p className="menu-day-kicker">Casitas</p>
          <h2>Hoy y upsells vigentes</h2>
        </div>
        <span className="count-label">{total}</span>
      </div>
      {groups.map((group) => (
        <div key={group.id} className="hoy-group">
          <div className="hoy-group-heading">
            <h3>{group.label}</h3>
            <span>{group.rows.length}</span>
          </div>
          <div className="hoy-chips">
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
    </section>
  );
}
