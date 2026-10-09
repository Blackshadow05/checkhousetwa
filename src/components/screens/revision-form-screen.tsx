"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { BedDouble, Camera, Check, CheckCheck, ClipboardCheck, CloudCheck, House, ImagePlus, ListChecks, Minus, Plus, ScanSearch, WifiOff } from "lucide-react";
import { useRevisionDraft } from "@/hooks/use-revision-draft";
import { useRevisiones } from "@/components/screens/revisiones-provider";
import { CAJA_FUERTE_FILTERS } from "@/lib/revisiones-archive";
import { statusAppearance } from "@/lib/revisiones-display";
import { BOOLEAN_FIELDS, CAJA_FUERTE_NO_EVIDENCE, QUANTITY_LIMITS, evidencePhotoLimit, validatePendienteForm, validateRevisionForm, withCurrentRevisionTime, type InventoryKey, type RevisionDraft, type RevisionFormErrors, type RevisionFormValues, type RevisionMode, type RevisionPhoto } from "@/lib/revision-form";
import { prepareRevisionPhoto, prepareRevisionPhotoWith, revisionShareFiles } from "@/lib/revision-photos";
import { discardUpload, ensureBackgroundUploads } from "@/lib/revision-evidence-upload";
import type { RevisionRecognitionInput } from "@/lib/revision-recognition-log";
import { RevisionPhotoPreview, type PhotoStatus } from "@/components/screens/revision-photo-preview";
import { RecognitionResults, RecognitionScanCard, recognitionStyles, type FotoPrevia } from "@/components/screens/revision-recognition";
import { useInventarioCasitas } from "@/hooks/use-inventario-casitas";
import { entradaDesdeImagen } from "@/lib/articulos-detector";
import { INVENTARIO_KEYS, compararInventario, type InventarioKey } from "@/lib/inventario-casitas";
import { useEscaneoArticulos } from "@/hooks/use-escaneo-articulos";
import { useReveladoEscaneo } from "@/hooks/use-revelado-escaneo";
import { articulosEnFoto, conEscaneo } from "@/lib/revision-scan";
import { createUuid } from "@/lib/uuid";
import { cajaFuerteSugerida } from "@/lib/caja-fuerte-sugerida";

function FieldError({ name, errors }: { name: keyof RevisionFormErrors; errors: RevisionFormErrors }) {
  return errors[name] ? <p className="revision-field-error" id={`error-${name}`}>{errors[name]}</p> : null;
}

function ChoiceField({ name, label, options, value, onChange, errors, numeric = false, plain = false, disabledOptions, badge, hint }: {
  name: keyof RevisionFormValues; label: string; options: readonly string[]; value: string;
  onChange: (name: keyof RevisionFormValues, value: string) => void; errors: RevisionFormErrors;
  numeric?: boolean; plain?: boolean; disabledOptions?: ReadonlySet<string>; badge?: ReactNode; hint?: ReactNode;
}) {
  const selected = numeric && /^\d+$/.test(value) ? String(Number(value)) : value;
  const choicesClassName = [
    "revision-choices",
    numeric ? "revision-number-choices" : "",
    name === "caja_fuerte" ? "revision-caja-fuerte-choices" : "",
  ].filter(Boolean).join(" ");
  return (
    <fieldset className="revision-choice-field" data-invalid={Boolean(errors[name])} aria-describedby={errors[name] ? `error-${name}` : undefined}>
      <legend className={badge ? recognitionStyles.legendRow : undefined}>{badge ? <span className={recognitionStyles.legend}><span>{label}</span>{badge}</span> : label}</legend>
      {hint ? <p className={recognitionStyles.choiceHint}>{hint}</p> : null}
      <div className={choicesClassName}>
        {options.map((option) => (
          <label key={option} className={selected === option ? "is-selected" : ""}>
            <input type="radio" name={name} value={option} checked={selected === option} disabled={disabledOptions?.has(option)}
              onChange={() => onChange(name, option)} aria-describedby={errors[name] ? `error-${name}` : undefined} />
            <span>{numeric ? (option === "0" ? "0" : option.padStart(2, "0")) : plain ? option : option === "Si" ? "Sí" : statusAppearance(option).label}</span>
            {!numeric && selected === option && <Check size={14} aria-hidden="true" />}
          </label>
        ))}
      </div>
      <FieldError name={name} errors={errors} />
    </fieldset>
  );
}

const SIN_FOTOS: RevisionPhoto[] = [];

function FormCard({ icon, title, children }: { icon?: ReactNode; title?: string; children: ReactNode }) {
  return <section className="revision-form-card">{title ? <h2><span>{icon}</span>{title}</h2> : null}{children}</section>;
}

const PUERTAS_VENTANAS = ["Todo en orden", "Ventana abierta", "Puerta Terraza abierta", "Puerta abierta"] as const;

const FORM_INVENTORY_GROUPS = [
  [
    { key: "chromecast", label: "Chromecast" },
    { key: "controles_tv", label: "Controles TV" },
    { key: "speaker", label: "Speaker" },
    { key: "usb_speaker", label: "USB speaker" },
  ],
  [
    { key: "binoculares", label: "Binoculares" },
    { key: "trapo_binoculares", label: "Trapo de binoculares" },
    { key: "secadora", label: "Secadora" },
    { key: "accesorios_secadora", label: "Accesorios secadora" },
    { key: "steamer", label: "Steamer" },
    { key: "bolsa_vapor", label: "Bolsa steamer" },
    { key: "plancha_cabello", label: "Plancha de cabello" },
  ],
  [
    { key: "bulto", label: "Bulto" },
    { key: "sombrero", label: "Sombrero" },
    { key: "bolso_yute", label: "Bolso de yute" },
    { key: "cola_caballo", label: "Cola de caballo" },
  ],
  [{ key: "camas_ordenadas", label: "Camas ordenadas" }],
] as const satisfies ReadonlyArray<ReadonlyArray<{ key: InventoryKey; label: string }>>;

const FORM_FIELD_BY_KEY = new Map<InventoryKey, { key: InventoryKey; label: string }>(
  FORM_INVENTORY_GROUPS.flat().map((field) => [field.key, field]),
);
const CAMAS_FIELD = { key: "camas_ordenadas", label: "Camas ordenadas" } as const;
const INVENTARIO_KEY_SET = new Set<string>(INVENTARIO_KEYS);

function withoutInventoryErrors(errors: RevisionFormErrors): RevisionFormErrors {
  return Object.fromEntries(Object.entries(errors).filter(([key]) => !INVENTARIO_KEY_SET.has(key))) as RevisionFormErrors;
}

export function RevisionFormScreen({ open, mode = "manual", reviewer, onClose, onQueued }: {
  open: boolean; mode?: RevisionMode; reviewer?: string; onClose: () => void;
  onQueued: (draft: RevisionDraft, reconocimiento: RevisionRecognitionInput | null, files: File[]) => void;
}) {
  const { draft, storage, update, detach } = useRevisionDraft(open, mode);
  const { online, revisiones } = useRevisiones();
  const [errors, setErrors] = useState<RevisionFormErrors>({});
  const [message, setMessage] = useState("");
  const [preparing, setPreparing] = useState(false);
  const inFlight = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const recognition = draft?.mode === "reconocimiento";
  const inventario = useInventarioCasitas(open && recognition);
  const escaneo = useEscaneoArticulos(open && recognition, draft, update);
  const fotosEscaneo = recognition && draft ? draft.photos : SIN_FOTOS;
  const revelado = useReveladoEscaneo(useMemo(() => fotosEscaneo.map((photo) => photo.id), [fotosEscaneo]), draft?.escaneos, escaneo.fallidas);
  const [resultadosVistos, setResultadosVistos] = useState(false);
  const [previas, setPrevias] = useState<FotoPrevia[]>([]);
  const [scanError, setScanError] = useState("");
  const [avisoEspera, setAvisoEspera] = useState(false);
  const [editarRevisor, setEditarRevisor] = useState(false);
  const [sugerida, setSugerida] = useState("");
  const [shownDraftId, setShownDraftId] = useState(draft?.id);
  if (shownDraftId !== draft?.id) {
    setShownDraftId(draft?.id);
    setErrors({});
    setMessage("");
    setScanError("");
    setAvisoEspera(false);
    setEditarRevisor(false);
    setSugerida("");
    setResultadosVistos(false);
  }

  useEffect(() => {
    if (open) scrollRef.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!message || !open) return;
    const error = scrollRef.current?.querySelector<HTMLElement>(".revision-submit-error");
    error?.focus();
    error?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [message, open]);

  const prefilledDraft = useRef<string | null>(null);
  const currentReviewer = draft?.values.quien_revisa;
  const draftId = draft?.id;
  useEffect(() => {
    const name = reviewer?.trim();
    if (!open || !name || !draftId || currentReviewer === undefined || prefilledDraft.current === draftId) return;
    prefilledDraft.current = draftId;
    if (currentReviewer.trim()) return;
    update((previous) => ({ ...previous, values: { ...previous.values, quien_revisa: name } }));
  }, [open, reviewer, currentReviewer, draftId, update]);

  useEffect(() => {
    if (draft?.photos.length) ensureBackgroundUploads(draft.photos);
  }, [draft?.photos]);

  useEffect(() => {
    if (open) scrollRef.current?.scrollTo(0, 0);
  }, [draft?.id, open]);

  if (!draft) return open ? <div className="revision-form-screen"><p className="revision-form-loading" role="status">Preparando tu revisión…</p></div> : null;
  const { values, photos } = draft;
  const completarDespues = draft.completarDespues === true && !draft.completa;
  const completando = draft.completa ?? null;
  const busy = !recognition && preparing;
  const scan = recognition ? draft.scan ?? null : null;
  const sinEscanear = recognition ? photos.filter((photo) => !draft.escaneos?.[photo.id]) : [];
  const falloEscaneo = sinEscanear.map((photo) => escaneo.fallidas[photo.id]).find(Boolean) ?? "";
  const scanNotice = falloEscaneo || scanError || (avisoEspera && sinEscanear.length ? "Espera a que terminen de escanearse las fotos." : "");
  const casitaInventario = values.casita ? inventario.rows?.find((row) => row.casita === Number(values.casita)) ?? null : null;
  const noCoinciden = scan && casitaInventario
    ? new Set<InventoryKey>(compararInventario(values, scan.detectados, casitaInventario).revisar
      .filter((item) => item.coincideAhora === false && (item.detectado ?? 0) > 0).map((item) => item.key))
    : null;
  const scanMarks = noCoinciden?.size && scan?.cajas
    ? new Map(scan.photoIds.flatMap((id, index) => {
      const marks = (scan.cajas?.[index] ?? []).filter((caja) => noCoinciden.has(caja.key))
        .map((caja) => ({ ...caja, label: FORM_FIELD_BY_KEY.get(caja.key)?.label ?? caja.key }));
      return marks.length ? [[id, marks] as const] : [];
    }))
    : undefined;
  const reviewers = [...new Set(revisiones.map((row) => row.quien_revisa))].sort((a, b) => a.localeCompare(b, "es"));
  const revisor = values.quien_revisa.trim() || (editarRevisor ? "" : reviewer?.trim() ?? "");
  const mostrarRevisor = editarRevisor || Boolean(errors.quien_revisa) || !revisor;
  const photoStatus = (photoId: string): PhotoStatus => {
    const item = draft.escaneos?.[photoId];
    const phase = revelado.fase(photoId);
    if (phase === "crece" || phase === "escanea") return { tone: "scanning", text: "Escaneando…", phase, cajas: item?.cajas };
    if (phase || revelado.revelado(photoId)) {
      if (item) {
        const total = articulosEnFoto(item);
        return { tone: "done", text: total === 0 ? "Sin artículos" : total === 1 ? "1 artículo" : `${total} artículos`, phase: phase ?? undefined };
      }
      if (escaneo.fallidas[photoId]) return { tone: "error", text: "No se escaneó", phase: phase ?? undefined };
    }
    return revelado.animando ? { tone: "queued", text: "En cola" } : { tone: "busy", text: "Contando…" };
  };
  if (scan && !revelado.activo && !resultadosVistos) setResultadosVistos(true);
  if (!scan && resultadosVistos) setResultadosVistos(false);
  const mostrarResultados = scan && (resultadosVistos || !revelado.activo) ? scan : null;
  const cambiarRevisor = () => {
    flushSync(() => setEditarRevisor(true));
    const input = scrollRef.current?.querySelector<HTMLInputElement>("#revision-quien_revisa");
    input?.focus({ preventScroll: true });
    input?.select();
    input?.scrollIntoView({ block: "center", behavior: "instant" });
  };

  const applyChange = (name: keyof RevisionFormValues, value: string) => {
    update((previous) => {
      if (name !== "caja_fuerte") return { ...previous, values: { ...previous.values, [name]: value } };
      const limit = evidencePhotoLimit(value);
      for (const photo of previous.photos.slice(limit)) void discardUpload(photo.id);
      return conEscaneo({
        ...previous,
        photos: previous.photos.slice(0, limit),
        values: { ...previous.values, caja_fuerte: value, room_move: value === "Room Move" ? previous.values.room_move : "" },
      });
    });
    setErrors((previous) => ({ ...previous, [name]: undefined, evidencias: name === "caja_fuerte" ? undefined : previous.evidencias, room_move: name === "caja_fuerte" ? undefined : previous.room_move }));
    setMessage("");
    if (name === "caja_fuerte") setScanError("");
  };
  const change = (name: keyof RevisionFormValues, value: string) => {
    applyChange(name, value);
    if (name === "caja_fuerte") setSugerida("");
    if (name !== "casita" || (values.caja_fuerte && values.caja_fuerte !== sugerida)) return;
    const next = cajaFuerteSugerida(revisiones, value);
    if (next !== values.caja_fuerte) applyChange("caja_fuerte", next);
    setSugerida(next);
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
  const appendPhotos = async (selected: File[]) => {
    setPreparing(true);
    const prepared: RevisionPhoto[] = [];
    let failure = "";
    try {
      for (const file of selected) {
        try { prepared.push(await prepareRevisionPhoto(file)); }
        catch (error) { failure ||= error instanceof Error ? error.message : "No pudimos preparar la foto."; }
      }
      if (prepared.length) {
        const next = [...photos, ...prepared].slice(0, photoLimit);
        update((previous) => ({ ...previous, photos: [...previous.photos, ...prepared].slice(0, evidencePhotoLimit(previous.values.caja_fuerte)) }));
        ensureBackgroundUploads(next);
        setErrors((previous) => ({ ...previous, evidencias: undefined }));
      }
    } finally { setPreparing(false); }
    return failure;
  };
  const addPhotos = async (files: FileList | null) => {
    if (!files?.length || inFlight.current || preparing || !canAddNextEvidence) return;
    setMessage("");
    const room = photoLimit - photos.length;
    const selected = Array.from(files);
    const failure = await appendPhotos(selected.slice(0, room));
    if (failure) setMessage(failure);
    else if (selected.length > room) setMessage(`Solo se agregaron ${room === 1 ? "1 foto" : `${room} fotos`}; el máximo es ${photoLimit}.`);
  };
  const addScanPhotos = async (files: FileList | null) => {
    const room = photoLimit - photos.length - previas.length;
    if (!files?.length || inFlight.current || room <= 0) return;
    setScanError("");
    setAvisoEspera(false);
    setErrors((previous) => ({ ...withoutInventoryErrors(previous), evidencias: undefined }));
    const draftId = draft.id;
    const items = Array.from(files).slice(0, room).map((file) => ({ id: createUuid(), file, url: URL.createObjectURL(file) }));
    setPrevias((previous) => [...previous, ...items.map(({ id, url }) => ({ id, url }))]);
    let failure = "";
    for (const item of items) {
      try {
        const { photo, extra } = await prepareRevisionPhotoWith(item.file, (image) => entradaDesdeImagen(image, image.naturalWidth, image.naturalHeight));
        escaneo.registrar(photo.id, extra);
        update((previous) => previous.id !== draftId ? previous : conEscaneo({
          ...previous,
          photos: [...previous.photos, photo].slice(0, evidencePhotoLimit(previous.values.caja_fuerte)),
        }));
      } catch (error) {
        failure ||= error instanceof Error ? error.message : "No pudimos preparar la foto.";
      } finally {
        setPrevias((previous) => previous.filter((previa) => previa.id !== item.id));
        URL.revokeObjectURL(item.url);
      }
    }
    if (failure) setScanError(failure);
  };
  const focusScanCard = () => {
    requestAnimationFrame(() => {
      const card = scrollRef.current?.querySelector<HTMLElement>("[data-revision-evidencias]");
      card?.focus({ preventScroll: true });
      card?.scrollIntoView({ block: "center", behavior: "instant" });
    });
  };
  const toggleCompletarDespues = (checked: boolean) => {
    update((previous) => ({ ...previous, completarDespues: checked }));
    setErrors({});
    setMessage("");
  };
  const submit = () => {
    if (inFlight.current) return;
    const stamped = withCurrentRevisionTime(values);
    if (completarDespues) {
      const pendingErrors = validatePendienteForm(stamped);
      setErrors(pendingErrors);
      if (Object.keys(pendingErrors).length) {
        focusError(pendingErrors);
        return;
      }
      for (const photo of photos) void discardUpload(photo.id);
      const queued: RevisionDraft = { ...draft, values: stamped, photos: [], scan: null, escaneos: undefined, completarDespues: true, completa: null };
      detach();
      setMessage("");
      onQueued(queued, null, []);
      return;
    }
    const nextErrors = validateRevisionForm(stamped, undefined, photos.length);
    if (recognition && (!draft.scan || sinEscanear.length)) {
      const visible = Object.fromEntries(Object.entries(withoutInventoryErrors(nextErrors)).filter(([key]) => key !== "camas_ordenadas")) as RevisionFormErrors;
      setErrors(visible);
      if (photos.length && !falloEscaneo) setAvisoEspera(true);
      if (Object.keys(visible).length) focusError(visible);
      else focusScanCard();
      return;
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      focusError(nextErrors); return;
    }
    inFlight.current = true;
    const queued: RevisionDraft = { ...draft, values: stamped };
    const reconocimiento: RevisionRecognitionInput | null = recognition && draft.scan
      ? { detectados: draft.scan.detectados, at: draft.scan.at, model: draft.scan.model }
      : null;
    const shareFiles = revisionShareFiles(photos, stamped.casita);
    detach();
    setErrors({});
    setMessage("");
    inFlight.current = false;
    onQueued(queued, reconocimiento, shareFiles);
  };

  const removePhoto = (photoId: string) => {
    void discardUpload(photoId);
    update((previous) => conEscaneo({ ...previous, photos: previous.photos.filter((item) => item.id !== photoId) }));
  };

  const quantity = (field: { key: InventoryKey; label: string }, extras?: { badge?: ReactNode; hint?: ReactNode }) => (
    <div className="revision-quantity-field" key={field.key}>
      {BOOLEAN_FIELDS.has(field.key) ? <ChoiceField name={field.key} label={field.label} options={["Si", "No"]} value={values[field.key]} onChange={change} errors={errors} badge={extras?.badge} hint={extras?.hint} /> : QUANTITY_LIMITS[field.key] !== undefined ?
        <ChoiceField name={field.key} label={field.label} numeric options={Array.from({ length: QUANTITY_LIMITS[field.key]! + 1 }, (_, index) => String(index))} value={values[field.key]} onChange={change} errors={errors} badge={extras?.badge} hint={extras?.hint} /> : <>
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
    <section className="revision-form-screen" hidden={!open} aria-label={recognition ? "Nueva revisión por reconocimiento" : "Nueva revisión"} inert={!open ? true : undefined}>
      <form className="revision-form" noValidate onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <div className="revision-form-scroll" ref={scrollRef} tabIndex={-1}>
          <div className="revision-form-welcome">
            <div className="revision-form-welcome-copy">
              {recognition && <p className="revision-form-kicker">POR RECONOCIMIENTO</p>}
              {completando && <p className="revision-form-completing">Completando la revisión que marcó {completando.marcadaPor}</p>}
              <p className="revision-form-welcome-title">{values.casita ? `Casita ${String(Number(values.casita)).padStart(2, "0")}` : "Selecciona una casita"}</p>
              {revisor && <p className="revision-form-reviewer">
                <span>Revisa: {revisor}</span>
                {!mostrarRevisor && <><span aria-hidden="true">·</span><button type="button" disabled={busy} onClick={cambiarRevisor} aria-label={`Cambiar quién revisa, ahora ${revisor}`}>Cambiar</button></>}
              </p>}
            </div>
            <span className="revision-form-welcome-icon" aria-hidden="true"><House size={32} strokeWidth={1.25} /><Check size={14} /></span>
          </div>
          <div className={`revision-draft-status ${storage === "error" || !online ? "is-warning" : ""}`} role="status">
            {!online ? <WifiOff size={14} /> : storage === "saved" ? <CheckCheck size={15} /> : null}
            <span>{storage === "error" ? "No pudimos guardar el progreso en este dispositivo. Mantén la app abierta." : storage === "saving" ? "Guardando tu progreso…" : !online ? "Sin conexión. Puedes guardar; la revisión se enviará al volver la conexión." : storage === "saved" ? "Progreso guardado" : "Tu progreso se guarda mientras estás en el formulario."}</span>
          </div>
          <fieldset className="revision-form-fields" disabled={busy}>
              <FormCard icon={<House size={18} />} title="Datos de la revisión">
                <div className="revision-text-field"><label htmlFor="revision-casita">Número de casita</label><select id="revision-casita" name="casita" disabled={Boolean(completando)} value={values.casita ? String(Number(values.casita)) : ""} onChange={(e) => change("casita", e.target.value)} aria-invalid={Boolean(errors.casita)} aria-describedby={errors.casita ? "error-casita" : undefined}><option value="" disabled>Selecciona una casita</option>{Array.from({ length: 50 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select><FieldError name="casita" errors={errors} /></div>
                {mostrarRevisor && <div className="revision-text-field"><label htmlFor="revision-quien_revisa">¿Quién revisa?</label><input id="revision-quien_revisa" name="quien_revisa" list="revision-reviewers" autoComplete="name" maxLength={100} value={values.quien_revisa} onChange={(e) => change("quien_revisa", e.target.value)} aria-invalid={Boolean(errors.quien_revisa)} aria-describedby={errors.quien_revisa ? "error-quien_revisa" : undefined} /><datalist id="revision-reviewers">{reviewers.map((name) => <option key={name} value={name} />)}</datalist><FieldError name="quien_revisa" errors={errors} /></div>}
                {values.casita && !completando && <label className="revision-later-toggle" data-checked={completarDespues || undefined}>
                  <input type="checkbox" checked={completarDespues} onChange={(event) => toggleCompletarDespues(event.target.checked)} />
                  <span className="revision-later-copy">
                    <strong>Completar después</strong>
                    <small>Guarda solo la casita y tu nombre. Otra persona completa el formulario.</small>
                  </span>
                  <span className="revision-later-switch" aria-hidden="true" />
                </label>}
              </FormCard>
              {!completarDespues && <>
              <FormCard>
                <ChoiceField name="caja_fuerte" label="Caja fuerte" options={CAJA_FUERTE_FILTERS} value={values.caja_fuerte} onChange={change} errors={errors}
                  disabledOptions={recognition ? CAJA_FUERTE_NO_EVIDENCE : undefined}
                  hint={sugerida && values.caja_fuerte === sugerida ? "Sugerido según el último registro" : recognition ? "Si y No no llevan fotos. Para esas opciones usa Ingreso manual." : undefined} />
                <ChoiceField name="puertas_ventanas" label="Puertas y ventanas" options={PUERTAS_VENTANAS} value={values.puertas_ventanas} onChange={change} errors={errors} plain />
                {values.caja_fuerte === "Room Move" && <div className="revision-text-field"><label htmlFor="revision-room_move">Movimiento entre casitas<small>Ej. De casita 12 a casita 24</small></label><input id="revision-room_move" name="room_move" placeholder="Ej. De casita 12 a casita 24" maxLength={120} value={values.room_move} onChange={(e) => change("room_move", e.target.value)} aria-invalid={Boolean(errors.room_move)} aria-describedby={errors.room_move ? "error-room_move" : undefined} /><FieldError name="room_move" errors={errors} /></div>}
              </FormCard>
              {recognition ? <>
                {values.casita && <FormCard icon={<ScanSearch size={18} />} title="Reconocimiento de artículos">
                  <RecognitionScanCard photos={photos} previas={previas} limit={photoLimit} scan={scan} status={photoStatus} marks={scanMarks} progreso={revelado.progreso}
                    error={scanNotice} disabled={busy} active={open} onPick={(files) => void addScanPhotos(files)} onRemove={removePhoto}
                    onRetry={falloEscaneo ? escaneo.reintentar : undefined}>
                    <FieldError name="evidencias" errors={errors} />
                  </RecognitionScanCard>
                </FormCard>}
                {mostrarResultados && <div className="revision-recognition-results">
                  <FormCard icon={<ListChecks size={18} />} title="Artículos encontrados">
                    <RecognitionResults values={values} scan={mostrarResultados} inventario={casitaInventario} inventarioStatus={inventario.status}
                      onRetryInventario={() => void inventario.refresh()}
                      renderField={(key: InventarioKey, extras) => quantity(FORM_FIELD_BY_KEY.get(key) ?? { key, label: key }, extras)}
                      renderCamas={(extras) => quantity(CAMAS_FIELD, extras)} />
                  </FormCard>
                </div>}
                {mostrarResultados && (values.camas_ordenadas === "Si" || values.camas_ordenadas === "No") && <FormCard icon={<BedDouble size={18} />} title="Habitación">{quantity(CAMAS_FIELD)}</FormCard>}
              </> : FORM_INVENTORY_GROUPS.map((fields) => <FormCard key={fields[0].key}>{fields.map((field) => quantity(field))}</FormCard>)}
              {!recognition && photoLimit > 0 && <FormCard icon={<Camera size={18} />} title="Añade imágenes de evidencias">
                <div data-revision-evidencias="" tabIndex={-1}>
                  {photos.length === 0 && <div className="revision-evidence-empty"><ImagePlus size={26} strokeWidth={1.5} aria-hidden="true" /></div>}
                  {photos.length > 0 && <div className="revision-photo-grid">{photos.map((photo, index) => <RevisionPhotoPreview key={photo.id} photo={photo} index={index} disabled={busy} active={open} onRemove={() => removePhoto(photo.id)} />)}</div>}
                  <input ref={libraryRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple={photoLimit - photos.length > 1} hidden onChange={(e) => { void addPhotos(e.target.files); e.target.value = ""; }} />
                  <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void addPhotos(e.target.files); e.target.value = ""; }} />
                  {canAddNextEvidence && <div className="revision-photo-actions"><button className="secondary-button" type="button" onClick={() => cameraRef.current?.click()}><Camera size={17} />Tomar foto</button><button className="secondary-button" type="button" onClick={() => libraryRef.current?.click()}><ImagePlus size={17} />Elegir fotos</button></div>}
                  {preparing && <p role="status">Preparando fotos…</p>}
                  <FieldError name="evidencias" errors={errors} />
                </div>
              </FormCard>}
              <FormCard icon={<ClipboardCheck size={18} />} title="Notas de revisión">
                <div className="revision-text-field"><label htmlFor="revision-notas">Observaciones<small>Opcional. ¿Hay algún daño, faltante o detalle por atender?</small></label><textarea id="revision-notas" name="notas" rows={4} maxLength={2000} placeholder="¿Hay algún daño, faltante o detalle por atender?" value={values.notas} onChange={(e) => change("notas", e.target.value)} aria-invalid={Boolean(errors.notas)} aria-describedby={errors.notas ? "error-notas" : undefined} /><FieldError name="notas" errors={errors} /></div>
              </FormCard>
              </>}
          </fieldset>
          {message && <div className="inline-notice notice-error revision-submit-error" role="alert" tabIndex={-1}>{message}</div>}
          {Object.values(errors).some(Boolean) && <p className="sr-only" role="alert">Revisa los campos marcados antes de continuar.</p>}
          <footer className="revision-form-footer">
            <button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Salir</button>
            <button type="submit" className="primary-button" disabled={busy}><CloudCheck size={16} />{completarDespues ? "Guardar para completar después" : "Guardar revisión"}</button>
          </footer>
        </div>
      </form>
    </section>
  );
}
