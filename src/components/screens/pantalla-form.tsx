"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { currentUsuario, loginUsuario, logoutUsuario } from "@/app/actions/usuarios";
import { createPantalla } from "@/app/actions/pantallas";
import { CASITAS, ESTADOS_PANTALLA, UBICACIONES, habitaciones, ubicacionLabel, validarPantalla, type PantallaInput } from "@/lib/pantallas";
import { prepareRevisionPhoto } from "@/lib/revision-photos";
import { uploadPantalla } from "@/lib/pantallas-upload";
import { useOnline } from "@/lib/use-online";

type Photo = { id: string; blob: Blob; preview: string; ubicacion: string; estado: string; url?: string };
export function PantallaForm({ onSaved, onClose }: { onSaved: (message: string) => void; onClose: () => void }) {
  const online = useOnline();
  const [user, setUser] = useState<{ id: number; nombre: string } | null>(null);
  const [checking, setChecking] = useState(true);
  const [username, setUsername] = useState(""); const [password, setPassword] = useState("");
  const [tipo, setTipo] = useState<"reporte" | "movimiento">("reporte");
  const [casita, setCasita] = useState(""); const [notas, setNotas] = useState("");
  const [origen, setOrigen] = useState(""); const [destino, setDestino] = useState("");
  const [origenRoom, setOrigenRoom] = useState(""); const [destinoRoom, setDestinoRoom] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]); const photosRef = useRef(photos);
  useEffect(() => { photosRef.current = photos; }, [photos]);
  const [busy, setBusy] = useState(false); const saving = useRef(false);
  const [error, setError] = useState(""); const [progress, setProgress] = useState("");
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
    try { const photo = await prepareRevisionPhoto(file); setPhotos(old => [...old, { ...photo, preview: URL.createObjectURL(photo.blob), ubicacion: habitaciones(casita).find(room => !old.some(p => p.ubicacion === room)) || "", estado: "" }]); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo preparar la foto."); }
    finally { setBusy(false); }
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
  return <div className="pantalla-form">
    <div className="pantalla-toolbar"><button type="button" disabled={busy} onClick={onClose}>← Volver</button><h2>Nuevo registro</h2></div>
    <p role="status">{!online ? "Sin conexión. El guardado estará disponible cuando vuelvas a conectarte." : "La fecha y hora se registrarán en hora de Costa Rica."}</p>
    {checking ? <p role="status">Comprobando sesión…</p> : !user ? <form className="pantalla-card" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(""); try { const result = await loginUsuario(username, password); setPassword(""); if (result.error) setError(result.error); else setUser(result.user); } catch { setError("No se pudo conectar. Inténtalo de nuevo."); } finally { setBusy(false); } }}>
      <h3>Inicia sesión para continuar</h3><p>Usa tu usuario y contraseña de Casitas.</p>
      <label>Usuario<input autoComplete="username" required value={username} onChange={e => setUsername(e.target.value)} /></label>
      <label>Contraseña<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
      <button className="pantalla-primary" disabled={busy || !online}>Entrar</button>
    </form> : <form onSubmit={e => { e.preventDefault(); void submit(); }}>
      <div className="pantalla-toolbar"><span>Registrado por <strong>{user.nombre}</strong></span><button type="button" disabled={busy} onClick={() => { void logoutUsuario().then(() => setUser(null)).catch(() => setError("No se pudo cerrar sesión.")); }}>Salir</button></div>
      <fieldset disabled={busy}>
        <label>Tipo<select aria-label="Tipo de registro" value={tipo} onChange={e => setTipo(e.target.value as typeof tipo)}><option value="reporte">Reporte de pantalla</option><option value="movimiento">Movimiento de pantalla</option></select></label>
        {tipo === "reporte" ? <>
          <label>Casita<select aria-label="Casita" required value={casita} disabled={photos.length > 0} onChange={e => setCasita(e.target.value)}><option value="">Selecciona una casita</option>{CASITAS.map(v => <option key={v} value={v}>Casita {v}</option>)}</select></label>
          {casita && <p>{habitaciones(casita).join(" · ")}. Una foto por habitación. Las fotos se suben al guardar.</p>}
          {photos.map((photo, index) => <div className="pantalla-card" key={photo.id}>
            {/* Local object URLs and original Cloudinary URLs are intentional. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="pantalla-preview" src={photo.preview} alt={`Foto ${index + 1} de ${photo.ubicacion}`} />
            <label>Habitación<select aria-label={`Habitación de foto ${index + 1}`} value={photo.ubicacion} onChange={e => setPhotos(old => old.map(p => p.id === photo.id ? { ...p, ubicacion: e.target.value } : p))}>{habitaciones(casita).map(room => <option key={room} disabled={photos.some(p => p.id !== photo.id && p.ubicacion === room)}>{room}</option>)}</select></label>
            <label>Estado<select aria-label={`Estado de foto ${index + 1}`} required value={photo.estado} onChange={e => setPhotos(old => old.map(p => p.id === photo.id ? { ...p, estado: e.target.value } : p))}><option value="">Selecciona un estado</option>{ESTADOS_PANTALLA.map(estado => <option key={estado}>{estado}</option>)}</select></label>
            <button type="button" onClick={() => { URL.revokeObjectURL(photo.preview); setPhotos(old => old.filter(p => p.id !== photo.id)); }}><Trash2 size={18} aria-hidden /> Quitar foto {index + 1}</button>
          </div>)}
          {casita && photos.length < habitaciones(casita).length && <label className="pantalla-photo-input"><Camera size={20} aria-hidden /> Agregar foto<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={e => { void addPhoto(e.target.files?.[0]); e.target.value = ""; }} /></label>}
        </> : <>{locationFields("origen")}{locationFields("destino")}</>}
        <label>Notas <span>(opcional)</span><textarea value={notas} maxLength={4000} rows={3} onChange={e => setNotas(e.target.value)} /></label>
        <button className="pantalla-primary" disabled={!online} type="submit">Guardar {tipo === "movimiento" ? "movimiento" : "reporte"}</button>
      </fieldset>
    </form>}
    {progress && <p role="status">{progress}</p>}{error && <p className="pantalla-error" role="alert">{error}</p>}
  </div>;
}
