"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, ChevronLeft, ImagePlus, Maximize2, Pencil, Trash2 } from "lucide-react";
import PhotoSwipe from "photoswipe";
import type { SlideData } from "photoswipe";
import "photoswipe/style.css";
import { currentUsuario, logoutUsuario } from "@/app/actions/usuarios";
import { LoginForm } from "@/components/auth/login-form";
import { createPantalla } from "@/app/actions/pantallas";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { CASITAS, ESTADOS_PANTALLA, ESTADO_PANTALLA_LABELS, UBICACIONES, actualizarNotasPantallas, estadoPorPuntos, habitaciones, ubicacionLabel, validarPantalla, type PantallaEstado, type PantallaInput } from "@/lib/pantallas";
import { analyzePantalla } from "@/lib/pantalla-analyzer";
import type { PantallaDetection } from "@/lib/pantalla-detection";
import { triagePuntosConJev } from "@/lib/pantalla-jev";
import styles from "./pantalla-form.module.css";
import { prepareRevisionPhoto } from "@/lib/revision-photos";
import { uploadPantalla } from "@/lib/pantallas-upload";
import { useOnline } from "@/lib/use-online";

type Photo = { id: string; blob: Blob; preview: string; ubicacion: string; estado: PantallaEstado | ""; puntos: number | null; detection?: PantallaDetection; analysisError?: string; aiNotice?: string; url?: string };
type ClassificationFlow = {
  photo: Photo;
  step: "estado" | "habitacion";
  estado: PantallaEstado | "";
  ubicacion: string;
  puntos: string;
  replaceId?: string;
  isDraft: boolean;
};
const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif";
const FALLBACK_PHOTO_SIZE = { width: 1600, height: 1200 };

function loadPhotoSize(src: string) {
  return new Promise<{ src: string; width: number; height: number }>((resolve) => {
    const image = new Image();
    image.onload = () => resolve({
      src,
      width: image.naturalWidth || FALLBACK_PHOTO_SIZE.width,
      height: image.naturalHeight || FALLBACK_PHOTO_SIZE.height,
    });
    image.onerror = () => resolve({ src, ...FALLBACK_PHOTO_SIZE });
    image.src = src;
  });
}

function safeArea(side: "top" | "right" | "bottom" | "left") {
  const probe = document.createElement("div");
  probe.style.cssText = `position:absolute;visibility:hidden;padding-${side}:env(safe-area-inset-${side},0px)`;
  document.body.append(probe);
  const styles = getComputedStyle(probe);
  const value = Number.parseFloat({
    top: styles.paddingTop,
    right: styles.paddingRight,
    bottom: styles.paddingBottom,
    left: styles.paddingLeft,
  }[side]) || 0;
  probe.remove();
  return value;
}

function detectionSummary(detection?: PantallaDetection) {
  const points = detection?.points ?? [];
  const seguros = points.filter(point => point.confidence === "seguro").length;
  const dudosos = points.length - seguros;
  const conteo = `Se detectaron ${seguros} ${seguros === 1 ? "punto" : "puntos"}.`;
  if (!dudosos) return `${conteo} Revisa las marcas y corrige el número si hace falta.`;
  return `${conteo} ${dudosos === 1 ? "La marca ámbar es dudosa y no se contó" : `Las ${dudosos} marcas ámbar son dudosas y no se contaron`}; corrige el número si hace falta.`;
}

function closePhotoViewer(viewer: PhotoSwipe | null) {
  if (!viewer || viewer.isDestroying) return;
  if (viewer.opener.isOpen) viewer.close();
  else viewer.on("openingAnimationEnd", () => viewer.close());
}

export function PantallaForm({ onSaved, onClose }: { onSaved: (message: string) => void; onClose: () => void }) {
  const online = useOnline();
  const [user, setUser] = useState<{ id: number; nombre: string } | null>(null);
  const [checking, setChecking] = useState(true);
  const [tipo, setTipo] = useState<"reporte" | "movimiento">("reporte");
  const [casita, setCasita] = useState(""); const [notas, setNotas] = useState("");
  const [movementNotes, setMovementNotes] = useState("");
  const [origen, setOrigen] = useState(""); const [destino, setDestino] = useState("");
  const [origenRoom, setOrigenRoom] = useState(""); const [destinoRoom, setDestinoRoom] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]); const photosRef = useRef(photos);
  useEffect(() => { photosRef.current = photos; }, [photos]);
  const [busy, setBusy] = useState(false); const saving = useRef(false);
  const [error, setError] = useState(""); const [progress, setProgress] = useState("");
  const [classification, setClassification] = useState<ClassificationFlow | null>(null);
  const draftPreview = useRef<string | null>(null);
  const analysisController = useRef<AbortController | null>(null);
  const preparing = useRef(false);
  const viewerTriggerRef = useRef<HTMLButtonElement>(null);
  const viewerRef = useRef<PhotoSwipe | null>(null);
  const openingViewerRef = useRef(false);
  const addPhotoInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const replacePhotoInputRef = useRef<HTMLInputElement>(null);
  const replacingPhotoId = useRef<string | null>(null);
  useEffect(() => () => closePhotoViewer(viewerRef.current), []);
  useEffect(() => { let live = true; void currentUsuario().then(value => { if (live) setUser(value); }).catch(() => { if (live) setError("No se pudo comprobar la sesión."); }).finally(() => { if (live) setChecking(false); }); return () => { live = false; }; }, []);
  useEffect(() => () => { for (const photo of photosRef.current) URL.revokeObjectURL(photo.preview); }, []);
  useEffect(() => () => {
    analysisController.current?.abort();
    if (draftPreview.current) URL.revokeObjectURL(draftPreview.current);
  }, []);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => { if (photosRef.current.length || notas || movementNotes || preparing.current || draftPreview.current || saving.current) event.preventDefault(); };
    window.addEventListener("beforeunload", handler); return () => window.removeEventListener("beforeunload", handler);
  }, [notas, movementNotes]);
  const input: PantallaInput = { tipo, numero_casita: casita ? Number(casita) : null, notas: (tipo === "reporte" ? notas : movementNotes).trim() || null,
    fotos: tipo === "reporte" ? photos.map(p => ({ url: p.url || "", ubicacion: p.ubicacion, estado: p.estado, puntos: p.puntos })) : [],
    origen_ubicacion: origen || null, origen_habitacion: origenRoom || null, destino_ubicacion: destino || null, destino_habitacion: destinoRoom || null };
  function updatePhotos(next: Photo[]) {
    const previous = photosRef.current;
    setNotas(current => actualizarNotasPantallas(current, previous, next));
    photosRef.current = next;
    setPhotos(next);
  }
  async function readPhoto(file?: File, previous?: Photo) {
    if (!file || preparing.current || busy || classification || (!previous && photos.length >= habitaciones(casita).length)) return;
    preparing.current = true;
    const controller = new AbortController();
    analysisController.current = controller;
    setBusy(true); setError(""); setProgress("Preparando foto…");
    try {
      const prepared = await prepareRevisionPhoto(file);
      controller.signal.throwIfAborted();
      const photo: Photo = { ...prepared, preview: URL.createObjectURL(prepared.blob), ubicacion: previous?.ubicacion || "", estado: "", puntos: null };
      draftPreview.current = photo.preview;
      setProgress("Buscando puntos blancos en la pantalla…");
      try {
        // Analyze before upload compression can erase faint spots or create artifacts.
        photo.detection = await analyzePantalla(file, controller.signal);
        const dudosos = photo.detection.points.filter(point => point.confidence === "dudoso");
        photo.puntos = photo.detection.points.length - dudosos.length;
        if (photo.detection.noScreen) {
          photo.estado = "no hay pantalla";
          photo.puntos = null;
          photo.analysisError = "No encontramos una pantalla en la foto. Si sí hay una, cambia el estado o tómala de frente con toda la pantalla visible.";
        } else if (photo.detection.screenFound) photo.estado = estadoPorPuntos(photo.puntos);
        else photo.analysisError = "No pudimos delimitar la pantalla. Revisa las marcas y selecciona el estado, o toma una foto más cercana.";
        if (dudosos.length && online && !photo.detection.noScreen) {
          setProgress("La IA está valorando los puntos dudosos…");
          try {
            const triage = await triagePuntosConJev(dudosos, controller.signal);
            if (triage.confirmed.length + triage.uncertain.length) {
              const confirmed = new Set(triage.confirmed.map(point => `${point.x}:${point.y}`));
              photo.detection = { ...photo.detection, points: photo.detection.points.map(point => confirmed.has(`${point.x}:${point.y}`) ? { ...point, confidence: "seguro" as const } : point) };
              photo.puntos = (photo.puntos ?? 0) + triage.confirmed.length;
              const descartados = triage.uncertain.length;
              if (descartados > 0) photo.aiNotice = descartados === 1 ? "La IA descartó 1 punto dudoso por su forma o brillo." : `La IA descartó ${descartados} puntos dudosos por su forma o brillo.`;
              if (photo.detection.screenFound) photo.estado = estadoPorPuntos(photo.puntos);
            }
          } catch (e) {
            controller.signal.throwIfAborted();
            photo.aiNotice = e instanceof Error ? e.message : "La revisión con IA no estuvo disponible. Se conserva el conteo local.";
          }
        }
      } catch (e) {
        controller.signal.throwIfAborted();
        photo.analysisError = e instanceof Error ? e.message : "No pudimos analizar la foto. Clasifícala manualmente.";
      }
      controller.signal.throwIfAborted();
      setClassification({ photo, step: "habitacion", estado: photo.estado, ubicacion: photo.ubicacion, puntos: photo.puntos === null ? "" : String(photo.puntos), replaceId: previous?.id, isDraft: true });
    } catch (e) {
      if (draftPreview.current) { URL.revokeObjectURL(draftPreview.current); draftPreview.current = null; }
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "No se pudo preparar la foto.");
    } finally {
      preparing.current = false;
      if (!controller.signal.aborted) { setBusy(false); setProgress(""); }
    }
  }
  function replacePhoto(file?: File) {
    const previous = photosRef.current.find(photo => photo.id === replacingPhotoId.current);
    replacingPhotoId.current = null;
    if (previous) void readPhoto(file, previous);
  }
  function removePhoto(photo: Photo) {
    URL.revokeObjectURL(photo.preview);
    updatePhotos(photosRef.current.filter(item => item.id !== photo.id));
  }
  function closeClassification() {
    if (draftPreview.current) { URL.revokeObjectURL(draftPreview.current); draftPreview.current = null; }
    setClassification(null);
  }
  function editClassification(photo: Photo) {
    setClassification({
      photo,
      step: "estado",
      estado: photo.estado,
      ubicacion: photo.ubicacion,
      puntos: photo.puntos === null ? "" : String(photo.puntos),
      isDraft: false,
    });
  }
  function chooseHabitacion(ubicacion: string) {
    setClassification(current => current ? { ...current, ubicacion, step: "estado" } : current);
  }
  function confirmClassification() {
    if (!classification?.estado || !classification.ubicacion) return;
    const { photo, estado, ubicacion, puntos, replaceId, isDraft } = classification;
    const count = puntos === "" ? null : Number(puntos);
    if (count !== null && (!Number.isSafeInteger(count) || count < 0 || count > 999)) return;
    const updated = { ...photo, estado, ubicacion, puntos: count };
    const previousId = isDraft ? replaceId : photo.id;
    if (photosRef.current.some(item => item.id !== previousId && item.ubicacion === ubicacion)) return;
    const previous = photosRef.current.find(item => item.id === previousId);
    updatePhotos(previous ? photosRef.current.map(item => item.id === previousId ? updated : item) : [...photosRef.current, updated]);
    if (isDraft && previous) URL.revokeObjectURL(previous.preview);
    draftPreview.current = null;
    setClassification(null);
  }
  async function openPhoto(index: number) {
    const currentPhotos = photosRef.current;
    if (!currentPhotos[index] || viewerRef.current || openingViewerRef.current) return;
    openingViewerRef.current = true;
    try {
      const dataSource: SlideData[] = await Promise.all(currentPhotos.map(async (photo, photoIndex) => {
        const sized = await loadPhotoSize(photo.preview);
        return {
          src: sized.src,
          width: sized.width,
          height: sized.height,
          alt: `Foto ${photoIndex + 1} de ${photo.ubicacion}`,
        };
      }));
      const viewer = new PhotoSwipe({
        dataSource,
        index,
        padding: {
          top: 60 + safeArea("top"),
          right: safeArea("right"),
          bottom: 40 + safeArea("bottom"),
          left: safeArea("left"),
        },
        mainClass: "evidence-pswp",
        bgOpacity: 1,
        showHideAnimationType: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "none" : "fade",
        wheelToZoom: true,
        closeTitle: "Cerrar imagen",
        zoomTitle: "Ampliar o reducir imagen",
        arrowPrevTitle: "Foto anterior",
        arrowNextTitle: "Foto siguiente",
        indexIndicatorSep: " de ",
        errorMsg: "No se pudo cargar la foto.",
      });
      viewerRef.current = viewer;
      viewer.on("loadComplete", ({ content }) => {
        const image = content.element;
        if (!(image instanceof HTMLImageElement) || !image.naturalWidth) return;
        if (content.data.width === image.naturalWidth && content.data.height === image.naturalHeight) return;
        content.data.width = image.naturalWidth;
        content.data.height = image.naturalHeight;
        viewer.refreshSlideContent(content.index);
      });
      viewer.on("destroy", () => {
        viewerRef.current = null;
        viewerTriggerRef.current?.focus({ preventScroll: true });
      });
      viewer.init();
      viewer.element?.setAttribute("aria-modal", "true");
      viewer.element?.setAttribute("aria-label", `Fotos del reporte de pantallas de casita ${casita}`);
    } finally {
      openingViewerRef.current = false;
    }
  }
  async function submit() {
    if (saving.current || busy || classification) return;
    const invalid = validarPantalla(input); if (invalid) { setError(invalid); return; }
    if (!online) { setError("Conéctate a internet para guardar. Puedes seguir completando el formulario."); return; }
    saving.current = true; setBusy(true); setError("");
    try {
      const session = await currentUsuario();
      if (!session) { setUser(null); throw new Error("Tu sesión venció. Inicia sesión para continuar; conservamos el formulario."); }
      const uploaded = [];
      if (tipo === "reporte") for (const [index, photo] of photos.entries()) {
        setProgress(`Subiendo foto ${index + 1} de ${photos.length}…`);
        const url = photo.url || await uploadPantalla(photo.blob, casita, index + 1);
        setPhotos(old => old.map(p => p.id === photo.id ? { ...p, url } : p));
        uploaded.push({ url, ubicacion: photo.ubicacion, estado: photo.estado, puntos: photo.puntos });
      }
      setProgress("Guardando registro…");
      const result = await createPantalla({ ...input, fotos: uploaded });
      if (!result.saved) throw new Error(result.error || "No se pudo guardar.");
      onSaved(result.warning || (tipo === "movimiento" ? "Movimiento guardado." : "Reporte guardado."));
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo confirmar el guardado. Consulta el historial antes de reintentar."); }
    finally { saving.current = false; setBusy(false); setProgress(""); }
  }
  function locationFields(side: "origen" | "destino") {
    const value = side === "origen" ? origen : destino; const room = side === "origen" ? origenRoom : destinoRoom;
    return <div className="pantalla-card"><h3>{side === "origen" ? "Origen" : "Destino"}</h3>
      <label>Ubicación<select aria-label={`Ubicación de ${side}`} required value={value} onChange={e => { if (side === "origen") { setOrigen(e.target.value); setOrigenRoom(""); } else { setDestino(e.target.value); setDestinoRoom(""); } }}><option value="">Selecciona una ubicación</option>{UBICACIONES.map(v => <option key={v} value={v}>{ubicacionLabel(v)}</option>)}</select></label>
      {CASITAS.includes(value) && <label>Habitación<select aria-label={`Habitación de ${side}`} required value={room} onChange={e => side === "origen" ? setOrigenRoom(e.target.value) : setDestinoRoom(e.target.value)}><option value="">Selecciona una habitación</option>{habitaciones(value).map(r => <option key={r}>{r}</option>)}</select></label>}
    </div>;
  }
  const classificationPhoto = classification?.photo;
  const validCount = !classification || classification.puntos === "" || (/^\d{1,3}$/.test(classification.puntos));

  return <div className="pantalla-form">
    <div className="pantalla-toolbar"><button type="button" disabled={busy} onClick={onClose}>← Volver</button><h2>Nuevo registro</h2></div>
    {!online && <p role="status">Sin conexión. El guardado estará disponible cuando vuelvas a conectarte.</p>}
    {checking ? <p role="status">Comprobando sesión…</p> : !user ? <LoginForm online={online} variant="card" onSuccess={(usuario) => { setUser(usuario); setError(""); }} /> : <form onSubmit={e => { e.preventDefault(); void submit(); }}>
      <div className="pantalla-toolbar"><span>Registrado por <strong>{user.nombre}</strong></span><button type="button" disabled={busy} onClick={() => { void logoutUsuario().then(() => { setUser(null); window.dispatchEvent(new Event("casitas:logout")); }).catch(() => setError("No se pudo cerrar sesión.")); }}>Salir</button></div>
      <fieldset disabled={busy}>
        <label>Tipo<select aria-label="Tipo de registro" value={tipo} onChange={e => setTipo(e.target.value as typeof tipo)}><option value="reporte">Reporte de pantalla</option><option value="movimiento">Movimiento de pantalla</option></select></label>
        {tipo === "reporte" ? <>
          <label>Casita<select aria-label="Casita" required value={casita} disabled={photos.length > 0} onChange={e => setCasita(e.target.value)}><option value="">Selecciona una casita</option>{CASITAS.map(v => <option key={v} value={v}>Casita {v}</option>)}</select></label>
          {casita && <p>{habitaciones(casita).join(" · ")}. Una foto por habitación.</p>}
          {photos.length > 0 && <div className="pantalla-photo-list">{photos.map((photo, index) => <article className="pantalla-photo-item" key={photo.id}>
            <button className="pantalla-photo-thumb-button" type="button" aria-label={`Abrir foto ${index + 1} de ${photo.ubicacion}`} onClick={(event) => { viewerTriggerRef.current = event.currentTarget; void openPhoto(index); }}>
              {/* Local object URLs are intentional for the compressed photo preview. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="pantalla-photo-thumb" src={photo.preview} alt={`Foto ${index + 1} de ${photo.ubicacion}`} />
              <span aria-hidden="true"><Maximize2 size={13} /></span>
            </button>
            <div className="pantalla-photo-copy">
              <strong>{photo.ubicacion}</strong>
              <span>{photo.estado ? ESTADO_PANTALLA_LABELS[photo.estado] : "Sin clasificar"}</span>
              {photo.puntos !== null && photo.estado !== "no hay pantalla" && <span>{photo.puntos} {photo.puntos === 1 ? "punto" : "puntos"}</span>}
            </div>
            <div className="pantalla-photo-item-actions" aria-label={`Acciones de la foto ${index + 1}`}>
              <button type="button" title="Corregir información" aria-label={`Corregir estado o habitación de la foto ${index + 1}`} onClick={() => editClassification(photo)}><Pencil size={17} aria-hidden /></button>
              <button type="button" title="Cambiar foto" aria-label={`Cambiar foto ${index + 1}`} onClick={() => { replacingPhotoId.current = photo.id; replacePhotoInputRef.current?.click(); }}><Camera size={18} aria-hidden /></button>
              <button className="pantalla-remove-photo" type="button" title="Quitar foto" aria-label={`Quitar foto ${index + 1}`} onClick={() => removePhoto(photo)}><Trash2 size={18} aria-hidden /></button>
            </div>
          </article>)}</div>}
          <input ref={addPhotoInputRef} aria-label="Tomar foto de pantalla" type="file" accept={PHOTO_ACCEPT} capture="environment" hidden onChange={e => { void readPhoto(e.target.files?.[0]); e.target.value = ""; }} />
          <input ref={galleryInputRef} aria-label="Seleccionar foto de pantalla" type="file" accept={PHOTO_ACCEPT} hidden onChange={e => { void readPhoto(e.target.files?.[0]); e.target.value = ""; }} />
          <input ref={replacePhotoInputRef} aria-label="Cambiar foto de pantalla" type="file" accept={PHOTO_ACCEPT} hidden onChange={e => { replacePhoto(e.target.files?.[0]); e.target.value = ""; }} />
          {casita && photos.length < habitaciones(casita).length && <>
            <p className="pantalla-status">Fotografía la pantalla completa, oscura y de frente. Evita luces reflejadas y menús encendidos.</p>
            <div className={styles.photoActions}>
              <button className="pantalla-photo-input" type="button" onClick={() => addPhotoInputRef.current?.click()}><Camera size={20} aria-hidden /> Tomar foto</button>
              <button className="pantalla-photo-input" type="button" onClick={() => galleryInputRef.current?.click()}><ImagePlus size={20} aria-hidden /> Elegir foto</button>
            </div>
          </>}
        </> : <>{locationFields("origen")}{locationFields("destino")}</>}
        <label>Notas <span>(opcional)</span><textarea aria-label="Notas" value={tipo === "reporte" ? notas : movementNotes} maxLength={4000} rows={3} onChange={e => tipo === "reporte" ? setNotas(e.target.value) : setMovementNotes(e.target.value)} /></label>
        {tipo === "reporte" && <p className="pantalla-status">El resumen incluye solo las pantallas con daño. Puedes editar estas notas.</p>}
        <button className="pantalla-primary" disabled={!online} type="submit">Guardar {tipo === "movimiento" ? "movimiento" : "reporte"}</button>
      </fieldset>
    </form>}
    {progress && <p role="status">{progress}</p>}{error && <p className="pantalla-error" role="alert">{error}</p>}
    <BottomSheet
      open={Boolean(classification && classificationPhoto)}
      onClose={closeClassification}
      title={classification?.step === "habitacion" ? "Selecciona la habitación" : "Estado de la pantalla"}
    >
      {classification && classificationPhoto && <div className="pantalla-classification">
        <div className="pantalla-classification-context">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={classificationPhoto.preview} alt="" />
          <div><span>Paso {classification.step === "habitacion" ? "1" : "2"} de 2</span><strong>{classification.ubicacion || `Casita ${casita}`}</strong></div>
        </div>
        {classification.step === "estado" ? <>
          <div className={styles.preview}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={classificationPhoto.preview} alt={`Pantalla de ${classification.ubicacion}, con ${classificationPhoto.detection?.points.length ?? 0} marcas automáticas`} />
            {classificationPhoto.detection?.points.map((point, index) => <span key={index} className={`${styles.marker}${point.confidence === "dudoso" ? ` ${styles.dudoso}` : ""}`} style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} aria-hidden>{index + 1}</span>)}
          </div>
          {classificationPhoto.analysisError ? <p className="pantalla-notice" role="status">{classificationPhoto.analysisError}</p> : <p className="sheet-description" role="status">{detectionSummary(classificationPhoto.detection)}</p>}
          {classificationPhoto.aiNotice ? <p className="pantalla-notice" role="status">{classificationPhoto.aiNotice}</p> : null}
          <label>Puntos blancos<input aria-label="Puntos blancos" type="number" inputMode="numeric" min={0} max={999} step={1} value={classification.puntos} placeholder="Sin contar" onChange={e => {
            const value = e.target.value;
            setClassification(current => current ? { ...current, puntos: value, estado: /^\d{1,3}$/.test(value) ? estadoPorPuntos(Number(value)) : "" } : current);
          }} /></label>
          {!validCount && <p role="alert">Escribe un número entero entre 0 y 999.</p>}
          <p className="pantalla-status">0: buen estado · 1–8: moderado · 9 o más: grave. Puedes cambiar el estado sugerido.</p>
          <div className={`pantalla-modal-options ${styles.statusOptions}`} role="group" aria-label="Estado de la pantalla">
            {ESTADOS_PANTALLA.map(estado => <button className={classification.estado === estado ? "is-selected" : ""} aria-pressed={classification.estado === estado} type="button" key={estado} onClick={() => setClassification(current => current ? { ...current, estado } : current)}>{ESTADO_PANTALLA_LABELS[estado]}</button>)}
          </div>
          <button className="pantalla-modal-back" type="button" onClick={() => setClassification(current => current ? { ...current, step: "habitacion" } : current)}><ChevronLeft size={18} aria-hidden /> Cambiar habitación</button>
          <button className="pantalla-primary" type="button" disabled={!classification.estado || !validCount} onClick={confirmClassification}>Usar resultado</button>
        </> : <>
          <p className="sheet-description">¿A cuál habitación de la casita {casita} corresponde?</p>
          <div className="pantalla-modal-options">
            {habitaciones(casita).map(room => {
              const used = photos.some(photo => photo.id !== (classification.replaceId || classification.photo.id) && photo.ubicacion === room);
              return <button className={classification.ubicacion === room ? "is-selected" : ""} aria-pressed={classification.ubicacion === room} disabled={used} type="button" key={room} onClick={() => chooseHabitacion(room)}>{room}{used ? <small>Ya registrada</small> : null}</button>;
            })}
          </div>
        </>}
      </div>}
    </BottomSheet>
  </div>;
}
