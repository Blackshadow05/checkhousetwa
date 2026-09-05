"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { ArrowLeft, Camera, Check, CheckCheck, ClipboardCheck, CloudCheck, House, ImagePlus, LoaderCircle, LockKeyhole, Minus, Package, Plus, Tv, WifiOff } from "lucide-react";
import { createRevision } from "@/app/actions/revisiones";
import { useRevisionDraft } from "@/hooks/use-revision-draft";
import { useRevisiones } from "@/components/screens/revisiones-provider";
import { CAJA_FUERTE_FILTERS } from "@/lib/revisiones-archive";
import { ELECTRONIC_FIELDS, EQUIPMENT_FIELDS, statusAppearance } from "@/lib/revisiones-display";
import { BOOLEAN_FIELDS, QUANTITY_LIMITS, evidencePhotoLimit, formatRevisionDateTime, validateRevisionForm, type InventoryKey, type RevisionFormErrors, type RevisionFormValues, type RevisionPhoto } from "@/lib/revision-form";
import { prepareRevisionPhoto } from "@/lib/revision-photos";
import { discardUpload, ensureBackgroundUploads, releaseUploads, resolveEvidenciaUrls } from "@/lib/revision-evidence-upload";
import type { InicioRevisionRow } from "@/types/database";
import { RevisionPhotoPreview } from "@/components/screens/revision-photo-preview";

function FieldError({ name, errors }: { name: keyof RevisionFormErrors; errors: RevisionFormErrors }) {
  return errors[name] ? <p className="revision-field-error" id={`error-${name}`}>{errors[name]}</p> : null;
}

function ChoiceField({ name, label, options, value, onChange, errors, numeric = false }: {
  name: keyof RevisionFormValues; label: string; options: readonly string[]; value: string;
  onChange: (name: keyof RevisionFormValues, value: string) => void; errors: RevisionFormErrors;
  numeric?: boolean;
}) {
  const selected = numeric && /^\d+$/.test(value) ? String(Number(value)) : value;
  return (
    <fieldset className="revision-choice-field" data-invalid={Boolean(errors[name])} aria-describedby={errors[name] ? `error-${name}` : undefined}>
      <legend>{label}</legend>
      <div className={`revision-choices${numeric ? " revision-number-choices" : ""}`}>
        {options.map((option) => (
          <label key={option} className={selected === option ? "is-selected" : ""}>
            <input type="radio" name={name} value={option} checked={selected === option}
              onChange={() => onChange(name, option)} aria-describedby={errors[name] ? `error-${name}` : undefined} />
            <span>{numeric ? (option === "0" ? "0" : option.padStart(2, "0")) : option === "Si" ? "Sí" : statusAppearance(option).label}</span>
            {!numeric && selected === option && <Check size={14} aria-hidden="true" />}
          </label>
        ))}
      </div>
      <FieldError name={name} errors={errors} />
    </fieldset>
  );
}

function FormCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return <section className="revision-form-card"><h3><span>{icon}</span>{title}</h3>{children}</section>;
}

export function RevisionFormScreen({ open, onClose, onSaved }: {
  open: boolean; onClose: () => void; onSaved: (row: InicioRevisionRow) => void;
}) {
  const { draft, storage, update, clear } = useRevisionDraft();
  const { online, revisiones } = useRevisiones();
  const [errors, setErrors] = useState<RevisionFormErrors>({});
  const [message, setMessage] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [progress, setProgress] = useState("");
  const inFlight = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) titleRef.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!message || !open) return;
    const error = scrollRef.current?.querySelector<HTMLElement>(".revision-submit-error");
    error?.focus();
    error?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [message, open]);

  useEffect(() => {
    if (draft?.photos.length) ensureBackgroundUploads(draft.photos);
  }, [draft?.photos]);

  if (!draft) return open ? <div className="revision-form-screen"><p className="revision-form-loading" role="status">Preparando tu revisión…</p></div> : null;
  const { values, photos } = draft;
  const busy = pending || preparing;
  const reviewers = [...new Set(revisiones.map((row) => row.quien_revisa))].sort((a, b) => a.localeCompare(b, "es"));

  const change = (name: keyof RevisionFormValues, value: string) => {
    update((previous) => {
      if (name !== "caja_fuerte") return { ...previous, values: { ...previous.values, [name]: value } };
      const limit = evidencePhotoLimit(value);
      for (const photo of previous.photos.slice(limit)) void discardUpload(photo.id);
      return {
        ...previous,
        photos: previous.photos.slice(0, limit),
        values: { ...previous.values, caja_fuerte: value, room_move: value === "Room Move" ? previous.values.room_move : "" },
      };
    });
    setErrors((previous) => ({ ...previous, [name]: undefined, evidencias: name === "caja_fuerte" ? undefined : previous.evidencias, room_move: name === "caja_fuerte" ? undefined : previous.room_move }));
    setMessage("");
  };
  const focusError = (nextErrors: RevisionFormErrors) => {
    const first = Object.keys(nextErrors)[0];
    requestAnimationFrame(() => {
      const target = first === "evidencias"
        ? scrollRef.current?.querySelector<HTMLElement>("[data-revision-evidencias]")
        : scrollRef.current?.querySelector<HTMLElement>(`[name="${first}"]`);
      target?.focus();
      target?.scrollIntoView({ block: "center", behavior: "instant" });
    });
  };
  const photoLimit = evidencePhotoLimit(values.caja_fuerte);
  const canAddNextEvidence = photos.length < photoLimit;
  const addPhotos = async (files: FileList | null) => {
    if (!files?.length || inFlight.current || preparing || !canAddNextEvidence) return;
    setMessage("");
    const selected = Array.from(files).slice(0, 1);
    setPreparing(true);
    try {
      const prepared: RevisionPhoto[] = [];
      for (const file of selected) prepared.push(await prepareRevisionPhoto(file));
      const next = [...photos, ...prepared].slice(0, photoLimit);
      update((previous) => ({ ...previous, photos: [...previous.photos, ...prepared].slice(0, evidencePhotoLimit(previous.values.caja_fuerte)) }));
      ensureBackgroundUploads(next);
      setErrors((previous) => ({ ...previous, evidencias: undefined }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No pudimos preparar la foto.");
    } finally { setPreparing(false); }
  };
  const submit = () => {
    if (inFlight.current) return;
    const nextErrors = validateRevisionForm(values, undefined, photos.length);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      focusError(nextErrors); return;
    }
    if (!navigator.onLine) { setMessage("Estás sin conexión. Puedes seguir llenando el borrador y guardarlo al volver a conectarte."); return; }
    inFlight.current = true;
    setMessage("");
    startTransition(async () => {
      try {
        const photoIds = photos.map((photo) => photo.id);
        let paths: string[] = [];
        if (photos.length) {
          setProgress("Subiendo evidencias…");
          try {
            paths = await resolveEvidenciaUrls(photos);
          } catch {
            setMessage("No pudimos subir una evidencia. Conservamos el borrador para que puedas reintentar.");
            return;
          }
        }
        setProgress("Guardando revisión…");
        const result = await createRevision({ id: draft.id, values, photos: paths });
        if (!result.row) { setMessage(result.error ?? "No pudimos confirmar el guardado."); return; }
        releaseUploads(photoIds);
        await clear();
        setErrors({});
        onSaved(result.row);
      } catch {
        setMessage("No pudimos confirmar el guardado. Tu borrador sigue aquí; vuelve a intentarlo.");
      } finally {
        inFlight.current = false;
        setProgress("");
      }
    });
  };

  const removePhoto = (photoId: string) => {
    void discardUpload(photoId);
    update((previous) => ({ ...previous, photos: previous.photos.filter((item) => item.id !== photoId) }));
  };

  const quantity = (field: { key: InventoryKey; label: string }) => (
    <div className="revision-quantity-field" key={field.key}>
      {BOOLEAN_FIELDS.has(field.key) ? <ChoiceField name={field.key} label={field.label} options={["Si", "No"]} value={values[field.key]} onChange={change} errors={errors} /> : QUANTITY_LIMITS[field.key] !== undefined ?
        <ChoiceField name={field.key} label={field.label} numeric options={Array.from({ length: QUANTITY_LIMITS[field.key]! + 1 }, (_, index) => String(index))} value={values[field.key]} onChange={change} errors={errors} /> : <>
        <div className="revision-quantity-row">
          <label htmlFor={`revision-${field.key}`}>{field.label}</label>
          <div className="revision-stepper">
            <button type="button" aria-label={`Restar ${field.label}`} disabled={values[field.key] === "0"} onClick={() => change(field.key, String(Math.max(0, Number(values[field.key] || 1) - 1)))}><Minus size={16} /></button>
            <input id={`revision-${field.key}`} name={field.key} type="text" inputMode="numeric" pattern="[0-9]{1,2}" maxLength={2} autoComplete="off" placeholder="—" value={values[field.key]} onChange={(event) => { if (/^\d{0,2}$/.test(event.target.value)) change(field.key, event.target.value); }} aria-invalid={Boolean(errors[field.key])} aria-describedby={errors[field.key] ? `error-${field.key}` : undefined} />
            <button type="button" aria-label={`Sumar ${field.label}`} disabled={Number(values[field.key]) >= 99} onClick={() => change(field.key, String(Math.min(99, Number(values[field.key]) + 1)))}><Plus size={16} /></button>
          </div>
        </div>
        <FieldError name={field.key} errors={errors} />
      </>}
    </div>
  );

  return (
    <section className="revision-form-screen" hidden={!open} aria-label="Nueva revisión" inert={!open ? true : undefined}>
      <header className="revision-form-header">
        <button type="button" className="icon-button" onClick={onClose} aria-label="Volver a revisiones" disabled={pending}><ArrowLeft size={21} /></button>
        <div><h1 ref={titleRef} tabIndex={-1}>Nueva revisión</h1></div>
      </header>
      <form className="revision-form" noValidate onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <div className="revision-form-scroll" ref={scrollRef}>
          <div className={`revision-draft-status ${storage === "error" || !online ? "is-warning" : ""}`} role="status">
            {!online ? <WifiOff size={14} /> : storage === "saved" ? <CheckCheck size={15} /> : null}
            <span>{storage === "error" ? "No pudimos guardar el borrador en este dispositivo. Mantén la app abierta." : storage === "saving" ? "Guardando borrador en este dispositivo…" : !online ? "Sin conexión. Puedes continuar con tu borrador." : storage === "saved" ? "Borrador guardado en este dispositivo" : "Tu borrador se guarda mientras completas la revisión."}</span>
          </div>
          <fieldset className="revision-form-fields" disabled={busy}>
              <FormCard icon={<House size={18} />} title="Datos de la revisión">
                <div className="revision-text-field"><label htmlFor="revision-casita">Número de casita</label><select id="revision-casita" name="casita" value={values.casita ? String(Number(values.casita)) : ""} onChange={(e) => change("casita", e.target.value)} aria-invalid={Boolean(errors.casita)} aria-describedby={errors.casita ? "error-casita" : undefined}><option value="" disabled>Selecciona una casita</option>{Array.from({ length: 50 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select><FieldError name="casita" errors={errors} /></div>
                <div className="revision-text-field"><label htmlFor="revision-quien_revisa">¿Quién revisa?</label><input id="revision-quien_revisa" name="quien_revisa" list="revision-reviewers" autoComplete="name" maxLength={100} value={values.quien_revisa} onChange={(e) => change("quien_revisa", e.target.value)} aria-invalid={Boolean(errors.quien_revisa)} aria-describedby={errors.quien_revisa ? "error-quien_revisa" : undefined} /><datalist id="revision-reviewers">{reviewers.map((name) => <option key={name} value={name} />)}</datalist><FieldError name="quien_revisa" errors={errors} /></div>
                <div className="revision-text-field"><label htmlFor="revision-created_at">Fecha y hora</label><input id="revision-created_at" name="created_at" type="text" readOnly value={formatRevisionDateTime(values.created_at)} aria-readonly="true" /></div>
              </FormCard>
              <FormCard icon={<LockKeyhole size={18} />} title="Seguridad">
                <ChoiceField name="caja_fuerte" label="Caja fuerte" options={CAJA_FUERTE_FILTERS} value={values.caja_fuerte} onChange={change} errors={errors} />
                <div className="revision-text-field"><label htmlFor="revision-puertas_ventanas">Puertas y ventanas<small>Ej. Cerradas y en buen estado</small></label><textarea id="revision-puertas_ventanas" name="puertas_ventanas" rows={2} maxLength={500} placeholder="Ej. Cerradas y en buen estado" value={values.puertas_ventanas} onChange={(e) => change("puertas_ventanas", e.target.value)} aria-invalid={Boolean(errors.puertas_ventanas)} aria-describedby={errors.puertas_ventanas ? "error-puertas_ventanas" : undefined} /><FieldError name="puertas_ventanas" errors={errors} /></div>
                {values.caja_fuerte === "Room Move" && <div className="revision-text-field"><label htmlFor="revision-room_move">Movimiento entre casitas<small>Ej. De casita 12 a casita 24</small></label><input id="revision-room_move" name="room_move" placeholder="Ej. De casita 12 a casita 24" maxLength={120} value={values.room_move} onChange={(e) => change("room_move", e.target.value)} aria-invalid={Boolean(errors.room_move)} aria-describedby={errors.room_move ? "error-room_move" : undefined} /><FieldError name="room_move" errors={errors} /></div>}
              </FormCard>
              <FormCard icon={<Tv size={18} />} title="Electrónicos">{ELECTRONIC_FIELDS.map(quantity)}</FormCard>
              <FormCard icon={<Package size={18} />} title="Cuidado personal">{EQUIPMENT_FIELDS.slice(0, 5).map(quantity)}</FormCard>
              <FormCard icon={<Package size={18} />} title="Accesorios de la casita">{EQUIPMENT_FIELDS.slice(5, 11).map(quantity)}</FormCard>
              <FormCard icon={<House size={18} />} title="Orden">{quantity(EQUIPMENT_FIELDS[11])}</FormCard>
              <FormCard icon={<ClipboardCheck size={18} />} title="Notas de revisión">
                <div className="revision-text-field"><label htmlFor="revision-notas">Observaciones<small>Opcional. ¿Hay algún daño, faltante o detalle por atender?</small></label><textarea id="revision-notas" name="notas" rows={4} maxLength={2000} placeholder="¿Hay algún daño, faltante o detalle por atender?" value={values.notas} onChange={(e) => change("notas", e.target.value)} aria-invalid={Boolean(errors.notas)} aria-describedby={errors.notas ? "error-notas" : undefined} /><FieldError name="notas" errors={errors} /></div>
              </FormCard>
              {photoLimit > 0 && <FormCard icon={<Camera size={18} />} title={`Evidencias · ${photos.length} de ${photoLimit}`}>
                <div data-revision-evidencias="" tabIndex={-1}>
                  {photos.length > 0 && <div className="revision-photo-grid">{photos.map((photo, index) => <RevisionPhotoPreview key={photo.id} photo={photo} index={index} disabled={busy} active={open} onRemove={() => removePhoto(photo.id)} />)}</div>}
                  <input ref={libraryRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden onChange={(e) => { void addPhotos(e.target.files); e.target.value = ""; }} />
                  <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void addPhotos(e.target.files); e.target.value = ""; }} />
                  {canAddNextEvidence && <div className="revision-photo-actions"><button className="secondary-button" type="button" onClick={() => cameraRef.current?.click()}><Camera size={17} />Tomar foto</button><button className="secondary-button" type="button" onClick={() => libraryRef.current?.click()}><ImagePlus size={17} />Elegir fotos</button></div>}
                  {preparing && <p role="status">Preparando fotos…</p>}
                  <FieldError name="evidencias" errors={errors} />
                </div>
              </FormCard>}
          </fieldset>
          {message && <div className="inline-notice notice-error revision-submit-error" role="alert" tabIndex={-1}>{message}</div>}
          {Object.values(errors).some(Boolean) && <p className="sr-only" role="alert">Revisa los campos marcados antes de continuar.</p>}
        </div>
        <footer className="revision-form-footer">
          <button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Salir</button>
          <button type="submit" className="primary-button" disabled={busy || !online}>{pending ? <><LoaderCircle size={17} className="revision-spinner" />{progress || "Guardando…"}</> : <><CloudCheck size={18} />{online ? "Guardar revisión" : "Sin conexión"}</>}</button>
        </footer>
      </form>
    </section>
  );
}
