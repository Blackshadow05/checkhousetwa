import { ScanLine } from "lucide-react";
import { ELECTRONIC_FIELDS, EQUIPMENT_FIELDS } from "@/lib/revisiones-display";
import type { RecognitionDetailItem } from "@/lib/revision-recognition-detail";
import styles from "./revision-recognition-detail.module.css";

const labels = new Map<string, string>(
  [...ELECTRONIC_FIELDS, ...EQUIPMENT_FIELDS].map(({ key, label }) => [key, label]),
);

export function RevisionRecognitionDetail({ items }: { items?: RecognitionDetailItem[] }) {
  if (!items?.length) return null;
  return (
    <section className="detail-card" aria-labelledby="recognition-detail-title">
      <div className="detail-card-heading">
        <span className="detail-card-icon"><ScanLine size={17} aria-hidden="true" /></span>
        <h2 id="recognition-detail-title">Reconocimiento</h2>
      </div>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.campo} className={styles.item}>
            <h3 className={styles.name}>{labels.get(item.campo)}</h3>
            <dl className={styles.values}>
              <div><dt>Detectado</dt><dd>{item.detectado}</dd></div>
              <div><dt>Usuario</dt><dd>{item.guardado}</dd></div>
            </dl>
          </li>
        ))}
      </ul>
    </section>
  );
}
