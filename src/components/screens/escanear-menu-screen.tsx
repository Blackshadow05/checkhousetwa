"use client";

import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Camera, Check, Images, LoaderCircle, Replace, ScanText, TriangleAlert, X } from "lucide-react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useEscanearMenu } from "@/hooks/use-escanear-menu";
import { fechaTexto } from "@/lib/fechas";
import styles from "./escanear-menu-screen.module.css";

function dayMonth(fecha: string) {
  return fechaTexto(fecha, false);
}

function dayCount(count: number) {
  return `${count} ${count === 1 ? "día" : "días"}`;
}

export function EscanearMenuFeature({ onOpen }: { onOpen: () => void }) {
  return <button type="button" className="pantalla-feature" onClick={onOpen}>
    <span className="pantalla-feature-icon"><ScanText size={27} aria-hidden /></span>
    <span><strong>Escanear menú</strong></span>
    <ArrowRight size={21} aria-hidden />
  </button>;
}

export function EscanearMenuScreen({ onBack }: { onBack: () => void }) {
  return <EscanearMenuView menu={useEscanearMenu()} onBack={onBack} />;
}

export function EscanearMenuView({ menu, onBack }: { menu: ReturnType<typeof useEscanearMenu>; onBack: () => void }) {
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);
  const reading = menu.fase === "leyendo";
  const saving = menu.fase === "guardando";
  const picked = menu.fase === "leyendo" || menu.fase === "error";
  const reviewing = menu.fase === "revisando" || saving;
  if (confirmarDescarte && menu.fase !== "revisando") setConfirmarDescarte(false);
  const chosen = new Set(menu.elegidos);
  const existing = new Set(menu.existentes);
  const count = menu.elegidos.length;
  const replaced = menu.resultado?.reemplazados ?? 0;

  const salir = () => {
    if (menu.fase === "guardado") menu.descartar();
    onBack();
  };

  return <section className={styles.screen} aria-label="Escanear menú">
    <button type="button" className={styles.back} disabled={saving} onClick={salir}><ArrowLeft size={18} aria-hidden />Otros</button>
    <div className={styles.header}>
      <h1>Escanear menú</h1>
      {(picked || reviewing) && <button type="button" className={styles.close} aria-label="Descartar y empezar de nuevo" disabled={saving} onClick={() => { if (menu.fase === "revisando") setConfirmarDescarte(true); else menu.descartar(); }}><X size={20} aria-hidden /></button>}
    </div>
    <input name="menu-camara" ref={camera} type="file" accept="image/*" capture="environment" hidden aria-label="Tomar foto del menú" onChange={event => { menu.elegir(event.target.files?.[0]); event.target.value = ""; }} />
    <input name="menu-galeria" ref={library} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden aria-label="Elegir foto del menú" onChange={event => { menu.elegir(event.target.files?.[0]); event.target.value = ""; }} />

    {menu.fase === "vacio" && <div className={styles.start}>
      <span className={styles.mark} aria-hidden><ScanText size={38} strokeWidth={1.6} /></span>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={() => camera.current?.click()}><Camera size={21} aria-hidden />Tomar foto</button>
        <button type="button" className={styles.secondary} onClick={() => library.current?.click()}><Images size={21} aria-hidden />Galería</button>
      </div>
    </div>}

    {picked && menu.fotoUrl && <>
      <div className={styles.preview}>
        <div className={styles.photo} style={{ backgroundImage: `url("${menu.fotoUrl}")` }} role="img" aria-label="Foto del menú" />
        {reading && <span className={styles.sweep} aria-hidden />}
        {reading && <span className={styles.reading} role="status"><LoaderCircle size={17} className={styles.spin} aria-hidden />Leyendo menú…</span>}
      </div>
      {menu.fase === "error" && <>
        <p className={styles.error} role="alert"><TriangleAlert size={18} aria-hidden /><span>{menu.error}</span></p>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} disabled={!menu.online} onClick={menu.reintentar}>Reintentar</button>
          <button type="button" className={styles.secondary} onClick={menu.descartar}>Otra foto</button>
        </div>
      </>}
    </>}

    {reviewing && <>
      <ul className={styles.days}>
        {menu.dias.map((dia, index) => {
          const on = chosen.has(dia.fecha);
          return <li key={dia.fecha} style={{ "--i": Math.min(index, 8) } as React.CSSProperties}>
            <button type="button" role="checkbox" aria-checked={on} className={styles.day} data-on={on || undefined} disabled={saving} onClick={() => menu.alternar(dia.fecha)}>
              <span className={styles.check} aria-hidden>{on && <Check size={16} strokeWidth={3} />}</span>
              <span className={styles.dayBody}>
                <span className={styles.dayHead}>
                  <strong>{dia.diaSemana}</strong>
                  <span className={styles.date}>{dayMonth(dia.fecha)}</span>
                  {existing.has(dia.fecha) && <span className={styles.replace}><Replace size={12} aria-hidden />Reemplaza</span>}
                </span>
                <span className={styles.dishes}>{dia.comidas.map(plato => <span key={plato}>{plato}</span>)}</span>
              </span>
            </button>
          </li>;
        })}
      </ul>
      <div className={styles.bar}>
        {menu.verificandoExistentes && <p className="pantalla-status" role="status">Comprobando si ya existen menús para estas fechas…</p>}
        {menu.errorExistentes && <>
          <p className={styles.error} role="alert"><TriangleAlert size={18} aria-hidden /><span>{menu.errorExistentes}</span></p>
          {menu.online && <button type="button" className={styles.secondary} disabled={saving} onClick={menu.recomprobarExistentes}>Volver a comprobar fechas</button>}
        </>}
        {menu.error && <p className={styles.error} role="alert"><TriangleAlert size={18} aria-hidden /><span>{menu.error}</span></p>}
        <button type="button" className={styles.primary} disabled={saving || menu.verificandoExistentes || !count || !menu.online} onClick={() => void menu.guardar()}>
          {saving ? <><LoaderCircle size={20} className={styles.spin} aria-hidden />Guardando…</>
            : menu.verificandoExistentes ? <><LoaderCircle size={20} className={styles.spin} aria-hidden />Comprobando fechas…</>
            : !menu.online ? "Sin conexión"
            : count ? `Guardar ${dayCount(count)}` : "Elige un día"}
        </button>
      </div>
    </>}

    {menu.fase === "guardado" && <div className={styles.done} role="status">
      <span className={styles.doneMark} aria-hidden><Check size={42} strokeWidth={2.4} /></span>
      <h2>Menú guardado</h2>
      <p>{dayCount(menu.resultado?.guardados ?? 0)}{replaced ? ` · ${replaced} ${replaced === 1 ? "reemplazado" : "reemplazados"}` : ""}</p>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={salir}>Listo</button>
        <button type="button" className={styles.secondary} onClick={menu.descartar}>Escanear otro</button>
      </div>
    </div>}

    <BottomSheet open={confirmarDescarte} onClose={() => setConfirmarDescarte(false)} title="Descartar escaneo">
      <div className="admin-confirm">
        <h3>¿Descartar los {dayCount(menu.dias.length)} detectados?</h3>
        <p className="pantalla-status">Tendrás que volver a escanear la foto si descartas sin guardar.</p>
        <div className="auth-actions">
          <button type="button" className="secondary-button" onClick={() => setConfirmarDescarte(false)}>Seguir revisando</button>
          <button type="button" className="admin-danger-solid" onClick={() => { setConfirmarDescarte(false); menu.descartar(); }}>Descartar</button>
        </div>
      </div>
    </BottomSheet>
  </section>;
}
