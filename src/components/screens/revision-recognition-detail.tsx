import type { ReactNode } from "react";
import { CircleCheck, PencilLine, ScanLine, TriangleAlert } from "lucide-react";
import { ELECTRONIC_FIELDS, EQUIPMENT_FIELDS } from "@/lib/revisiones-display";
import {
  normalizeRecognitionDetail,
  type RecognitionDetail,
  type RecognitionDetailItem,
} from "@/lib/revision-recognition-detail";
import styles from "./revision-recognition-detail.module.css";

const labels = new Map<string, string>(
  [...ELECTRONIC_FIELDS, ...EQUIPMENT_FIELDS].map(({ key, label }) => [key, label]),
);

type Tono = "amber" | "blue" | "rose";

function q(value: string) {
  return `«${value}»`;
}

function explicacion(item: RecognitionDetailItem, revisor: string) {
  const escaneo = `El escaneo detectó ${q(item.detectado)}`;
  const cambio = `${revisor} lo cambió a ${q(item.guardado)}`;
  const estado = item.estado ?? "revisar";
  const cambiado = item.cambiado ?? item.detectado !== item.guardado;
  if (estado === "identificado") return `${escaneo} y lo dio como identificado. ${cambio}.`;
  if (!cambiado) return `${escaneo} y se guardó lo mismo.`;
  return `${escaneo}. ${cambio}.`;
}

function resultado(item: RecognitionDetailItem): { texto: string; tono: Tono } {
  const cambiado = item.cambiado ?? item.detectado !== item.guardado;
  if (!cambiado) return { texto: "Se dejó lo del escaneo", tono: "amber" };
  if (item.estado === "identificado") return { texto: "Cambiado aunque estaba identificado", tono: "rose" };
  return { texto: "Cambiado por quien revisó", tono: "blue" };
}

function Articulo({ item, revisor }: { item: RecognitionDetailItem; revisor: string }) {
  const { texto, tono } = resultado(item);
  const cambiado = item.cambiado ?? item.detectado !== item.guardado;
  return (
    <li className={styles.item}>
      <div className={styles.itemHeading}>
        <h4 className={styles.name}>{labels.get(item.campo) ?? item.campo}</h4>
        <span className={styles.result} data-tone={tono}>
          {cambiado ? <PencilLine size={12} aria-hidden="true" /> : <ScanLine size={12} aria-hidden="true" />}
          {texto}
        </span>
      </div>
      <dl className={styles.values}>
        <div>
          <dt>Detectó el escaneo</dt>
          <dd>{item.detectado}</dd>
        </div>
        <div data-changed={cambiado ? "" : undefined}>
          <dt>Se guardó</dt>
          <dd>{item.guardado}</dd>
        </div>
      </dl>
      <p className={styles.explanation}>{explicacion(item, revisor)}</p>
    </li>
  );
}

function Grupo({ titulo, descripcion, icono, tono, items, revisor }: {
  titulo: string;
  descripcion: string;
  icono: ReactNode;
  tono: Tono;
  items: RecognitionDetailItem[];
  revisor: string;
}) {
  if (!items.length) return null;
  return (
    <section className={styles.group} aria-label={titulo}>
      <h3 className={styles.groupTitle} data-tone={tono}>
        {icono}
        {titulo}
        <span className={styles.groupCount}>{items.length}</span>
      </h3>
      <p className={styles.groupDescription}>{descripcion}</p>
      <ul className={styles.list}>
        {items.map((item) => <Articulo key={item.campo} item={item} revisor={revisor} />)}
      </ul>
    </section>
  );
}

export function RevisionRecognitionDetail({ items: value, revisor }: {
  items?: RecognitionDetail | RecognitionDetailItem[];
  revisor: string;
}) {
  const detail = normalizeRecognitionDetail(value);
  if (!detail) return null;
  const quien = revisor.trim() || "Quien revisó";
  const revisar = detail.items.filter((item) => (item.estado ?? "revisar") === "revisar");
  const cambiadosCorrectos = detail.items.filter((item) => item.estado === "identificado");
  const sinInventario = detail.items.filter((item) => item.estado === "sin_inventario");
  const cambiados = detail.items.filter((item) => item.cambiado ?? item.detectado !== item.guardado).length;
  return (
    <section className="detail-card" aria-labelledby="recognition-detail-title">
      <div className="detail-card-heading">
        <span className="detail-card-icon"><ScanLine size={17} aria-hidden="true" /></span>
        <h2 id="recognition-detail-title">Reconocimiento de artículos</h2>
      </div>
      <p className={styles.intro}>
        Compara lo que detectó el escaneo de las fotos con lo que se guardó al final.
      </p>
      <ul className={styles.summary} aria-label="Resumen del reconocimiento">
        {revisar.length > 0 && (
          <li data-tone="amber"><TriangleAlert size={13} aria-hidden="true" />{revisar.length} para revisar</li>
        )}
        <li data-tone={cambiados ? "blue" : "sage"}>
          <PencilLine size={13} aria-hidden="true" />
          {cambiados === 0 ? "Nada cambiado" : cambiados === 1 ? "1 cambiado" : `${cambiados} cambiados`}
        </li>
        {detail.coincidieron !== null && detail.coincidieron > 0 && (
          <li data-tone="sage"><CircleCheck size={13} aria-hidden="true" />{detail.coincidieron} identificados sin cambios</li>
        )}
      </ul>
      <Grupo
        titulo="Marcados para revisar"
        descripcion="El escaneo los marcó para que se revisaran en la casita."
        icono={<TriangleAlert size={14} aria-hidden="true" />}
        tono="amber"
        items={revisar}
        revisor={quien}
      />
      <Grupo
        titulo="Cambiados aunque el escaneo los identificó"
        descripcion="El escaneo los dio como identificados, pero se guardó otro valor."
        icono={<PencilLine size={14} aria-hidden="true" />}
        tono="rose"
        items={cambiadosCorrectos}
        revisor={quien}
      />
      <Grupo
        titulo="Otros cambios"
        descripcion="Se guardó un valor distinto al que detectó el escaneo."
        icono={<PencilLine size={14} aria-hidden="true" />}
        tono="blue"
        items={sinInventario}
        revisor={quien}
      />
    </section>
  );
}
