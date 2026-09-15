"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, ChevronLeft, Maximize2, Pencil, Trash2 } from "lucide-react";
import PhotoSwipe from "photoswipe";
import type { SlideData } from "photoswipe";
import "photoswipe/style.css";
import { currentUsuario, logoutUsuario } from "@/app/actions/usuarios";
import { LoginForm } from "@/components/auth/login-form";
import { createPantalla } from "@/app/actions/pantallas";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { CASITAS, ESTADOS_PANTALLA, UBICACIONES, habitaciones, ubicacionLabel, validarPantalla, type PantallaInput } from "@/lib/pantallas";
import { prepareRevisionPhoto } from "@/lib/revision-photos";
import { uploadPantalla } from "@/lib/pantallas-upload";
import { useOnline } from "@/lib/use-online";

type PantallaEstado = (typeof ESTADOS_PANTALLA)[number];
type Photo = { id: string; blob: Blob; preview: string; ubicacion: string; estado: PantallaEstado | ""; url?: string };
type ClassificationFlow = {
  photoId: string;
  step: "estado" | "habitacion";
  estado: PantallaEstado | "";
  ubicacion: string;
  isNew: boolean;
};
const ESTADO_LABELS: Record<PantallaEstado, string> = {
  defectuosa: "Defectuosa",
  "en buen estado": "En buen estado",
  "no hay pantalla": "No hay pantalla",
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
  const [origen, setOrigen] = useState(""); const [destino, setDestino] = useState("");
  const [origenRoom, setOrigenRoom] = useState(""); const [destinoRoom, setDestinoRoom] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]); const photosRef = useRef(photos);
  useEffect(() => { photosRef.current = photos; }, [photos]);
  const [busy, setBusy] = useState(false); const saving = useRef(false);
  const [error, setError] = useState(""); const [progress, setProgress] = useState("");
  const [classification, setClassification] = useState<ClassificationFlow | null>(null);
  const viewerTriggerRef = useRef<HTMLButtonElement>(null);
  const viewerRef = useRef<PhotoSwipe | null>(null);
  const openingViewerRef = useRef(false);
  const addPhotoInputRef = useRef<HTMLInputElement>(null);
  const replacePhotoInputRef = useRef<HTMLInputElement>(null);
  const replacingPhotoId = useRef<string | null>(null);
  useEffect(() => () => closePhotoViewer(viewerRef.current), []);
  useEffect(() => { let live = true; void currentUsuario().then(value => { if (live) setUser(value); }).catch(() => { if (live) setError("No se pudo comprobar la sesión."); }).finally(() => { if (live) setChecking(false); }); return () => { live = false; }; }, []);
  useEffect(() => () => { for (const photo of photosRef.current) URL.revokeObjectURL(photo.preview); }, []);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => { if (photosRef.current.length || notas || saving.current) event.preventDefault(); };
    window.addEventListener("beforeunload", handler); return () => window.removeEventListener("beforeunload", handler);
  }, [notas]);
  const input: PantallaInput = { tipo, numero_casita: casita ? Number(casita) : null, notas: notas.trim() || null,
    fotos: tipo === "reporte" ? photos.map(p => ({ url: p.url || "", ubicacion: p.ubicacion, estado: p.estado })) : [],
    origen_ubicacion: origen || null, origen_habitacion: origenRoom || null, destino_ubicacion: destino || null, destino_habitacion: destinoRoom || null };
  async function addPhoto(file?: File) {
    if (!file || busy || photos.length >= habitaciones(casita).length) return;
    setBusy(true); setError("");
    try {
      const prepared = await prepareRevisionPhoto(file);
      const photo: Photo = { ...prepared, preview: URL.createObjectURL(prepared.blob), ubicacion: "", estado: "" };
      setPhotos(old => [...old, photo]);
      setClassification({ photoId: photo.id, step: "estado", estado: "", ubicacion: "", isNew: true });
    }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo preparar la foto."); }
    finally { setBusy(false); }
  }
  async function replacePhoto(file?: File) {
    const photoId = replacingPhotoId.current;
    replacingPhotoId.current = null;
    if (!file || !photoId || busy) return;
    setBusy(true); setError("");
    try {
      const prepared = await prepareRevisionPhoto(file);
      const nextPreview = URL.createObjectURL(prepared.blob);
      const previous = photosRef.current.find(photo => photo.id === photoId);
      if (!previous) { URL.revokeObjectURL(nextPreview); return; }
      setPhotos(old => old.map(photo => photo.id === photoId ? {
        ...prepared,
        preview: nextPreview,
        ubicacion: photo.ubicacion,
        estado: photo.estado,
      } : photo));
      URL.revokeObjectURL(previous.preview);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo cambiar la foto."); }
    finally { setBusy(false); }
  }
  function removePhoto(photo: Photo) {
    URL.revokeObjectURL(photo.preview);
    setPhotos(old => old.filter(item => item.id !== photo.id));
    if (classification?.photoId === photo.id) setClassification(null);
  }
  function closeClassification() {
    if (classification?.isNew) {
      const photo = photos.find(item => item.id === classification.photoId);
      if (photo) removePhoto(photo);
    }
    setClassification(null);
  }
  function editClassification(photo: Photo) {
    setClassification({
      photoId: photo.id,
      step: "estado",
      estado: photo.estado,
      ubicacion: photo.ubicacion,
      isNew: false,
    });
  }
  function chooseEstado(estado: PantallaEstado) {
    setClassification(current => current ? { ...current, estado, step: "habitacion" } : current);
  }
  function chooseHabitacion(ubicacion: string) {
    if (!classification?.estado) return;
    const { photoId, estado } = classification;
    setPhotos(old => old.map(photo => photo.id === photoId ? {
      ...photo,
      estado,
      ubicacion,
    } : photo));
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
    if (saving.current || busy) return;
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
        uploaded.push({ url, ubicacion: photo.ubicacion, estado: photo.estado });
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
  const classificationPhoto = classification ? photos.find(photo => photo.id === classification.photoId) : undefined;
  const classificationIndex = classificationPhoto ? photos.findIndex(photo => photo.id === classificationPhoto.id) : -1;

  return <div className="pantalla-form">
    <div className="pantalla-toolbar"><button type="button" disabled={busy} onClick={onClose}>← Volver</button><h2>Nuevo registro</h2></div>
    <p role="status">{!online ? "Sin conexión. El guardado estará disponible cuando vuelvas a conectarte." : "La fecha y hora se registrarán en hora de Costa Rica."}</p>
    {checking ? <p role="status">Comprobando sesión…</p> : !user ? <LoginForm online={online} variant="card" onSuccess={(usuario) => { setUser(usuario); setError(""); }} /> : <form onSubmit={e => { e.preventDefault(); void submit(); }}>
      <div className="pantalla-toolbar"><span>Registrado por <strong>{user.nombre}</strong></span><button type="button" disabled={busy} onClick={() => { void logoutUsuario().then(() => setUser(null)).catch(() => setError("No se pudo cerrar sesión.")); }}>Salir</button></div>
      <fieldset disabled={busy}>
        <label>Tipo<select aria-label="Tipo de registro" value={tipo} onChange={e => setTipo(e.target.value as typeof tipo)}><option value="reporte">Reporte de pantalla</option><option value="movimiento">Movimiento de pantalla</option></select></label>
        {tipo === "reporte" ? <>
          <label>Casita<select aria-label="Casita" required value={casita} disabled={photos.length > 0} onChange={e => setCasita(e.target.value)}><option value="">Selecciona una casita</option>{CASITAS.map(v => <option key={v} value={v}>Casita {v}</option>)}</select></label>
          {casita && <p>{habitaciones(casita).join(" · ")}. Una foto por habitación. Las fotos se suben al guardar.</p>}
          {photos.length > 0 && <div className="pantalla-photo-list">{photos.map((photo, index) => <article className="pantalla-photo-item" key={photo.id}>
            <button className="pantalla-photo-thumb-button" type="button" aria-label={`Abrir foto ${index + 1} de ${photo.ubicacion}`} onClick={(event) => { viewerTriggerRef.current = event.currentTarget; void openPhoto(index); }}>
              {/* Local object URLs are intentional for the compressed photo preview. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="pantalla-photo-thumb" src={photo.preview} alt={`Foto ${index + 1} de ${photo.ubicacion}`} />
              <span aria-hidden="true"><Maximize2 size={13} /></span>
            </button>
            <div className="pantalla-photo-copy">
              <strong>{photo.ubicacion}</strong>
              <span>{photo.estado ? ESTADO_LABELS[photo.estado] : "Sin clasificar"}</span>
            </div>
            <div className="pantalla-photo-item-actions" aria-label={`Acciones de la foto ${index + 1}`}>
              <button type="button" title="Corregir información" aria-label={`Corregir estado o habitación de la foto ${index + 1}`} onClick={() => editClassification(photo)}><Pencil size={17} aria-hidden /></button>
              <button type="button" title="Cambiar foto" aria-label={`Cambiar foto ${index + 1}`} onClick={() => { replacingPhotoId.current = photo.id; replacePhotoInputRef.current?.click(); }}><Camera size={18} aria-hidden /></button>
              <button className="pantalla-remove-photo" type="button" title="Quitar foto" aria-label={`Quitar foto ${index + 1}`} onClick={() => removePhoto(photo)}><Trash2 size={18} aria-hidden /></button>
            </div>
          </article>)}</div>}
          <input ref={addPhotoInputRef} type="file" accept={PHOTO_ACCEPT} capture="environment" hidden onChange={e => { void addPhoto(e.target.files?.[0]); e.target.value = ""; }} />
          <input ref={replacePhotoInputRef} type="file" accept={PHOTO_ACCEPT} capture="environment" hidden onChange={e => { void replacePhoto(e.target.files?.[0]); e.target.value = ""; }} />
          {casita && photos.length < habitaciones(casita).length && <button className="pantalla-photo-input" type="button" onClick={() => addPhotoInputRef.current?.click()}><Camera size={20} aria-hidden /> {photos.length ? "Tomar otra foto" : "Tomar primera foto"}</button>}
        </> : <>{locationFields("origen")}{locationFields("destino")}</>}
        <label>Notas <span>(opcional)</span><textarea value={notas} maxLength={4000} rows={3} onChange={e => setNotas(e.target.value)} /></label>
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
          <div><span>Paso {classification.step === "estado" ? "1" : "2"} de 2</span><strong>Foto {classificationIndex + 1}</strong></div>
        </div>
        {classification.step === "estado" ? <>
          <p className="sheet-description">¿Cómo se encuentra la pantalla en esta foto?</p>
          <div className="pantalla-modal-options">
            {ESTADOS_PANTALLA.map(estado => <button className={classification.estado === estado ? "is-selected" : ""} aria-pressed={classification.estado === estado} type="button" key={estado} onClick={() => chooseEstado(estado)}>{ESTADO_LABELS[estado]}</button>)}
          </div>
        </> : <>
          <p className="sheet-description">¿A cuál habitación de la casita {casita} corresponde?</p>
          <div className="pantalla-modal-options">
            {habitaciones(casita).map(room => {
              const used = photos.some(photo => photo.id !== classification.photoId && photo.ubicacion === room);
              return <button className={classification.ubicacion === room ? "is-selected" : ""} aria-pressed={classification.ubicacion === room} disabled={used} type="button" key={room} onClick={() => chooseHabitacion(room)}>{room}{used ? <small>Ya registrada</small> : null}</button>;
            })}
          </div>
          <button className="pantalla-modal-back" type="button" onClick={() => setClassification(current => current ? { ...current, step: "estado" } : current)}><ChevronLeft size={18} aria-hidden /> Cambiar estado</button>
        </>}
      </div>}
    </BottomSheet>
  </div>;
}
