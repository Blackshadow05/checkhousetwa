"use client";

import { HoyCasitas } from "@/components/screens/hoy-casitas";
import { MenuDelDia } from "@/components/screens/menu-del-dia";
import { useRevisiones } from "@/components/screens/revisiones-provider";
import type { MenuDelDia as MenuDelDiaRow } from "@/types/database";

export function InicioScreen({
  menus = [],
  menusError = null,
}: {
  menus?: MenuDelDiaRow[];
  menusError?: string | null;
}) {
  const { today, online } = useRevisiones();

  return (
    <section className="home-screen" aria-label="Inicio">
      <div className="welcome-block">
        <p className="eyebrow date-eyebrow">
          {new Intl.DateTimeFormat("es-CR", {
            weekday: "long",
            day: "numeric",
            month: "long",
          }).format(new Date(`${today}T12:00:00`))}
        </p>
        <h1>
          Todo en su lugar<span>.</span>
        </h1>
        <p>Lo esencial del día, a la mano.</p>
      </div>
      <MenuDelDia
        initialMenus={menus}
        initialError={menusError}
        today={today}
        online={online}
      />
      <HoyCasitas />
    </section>
  );
}
