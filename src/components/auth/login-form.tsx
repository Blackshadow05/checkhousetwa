"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { preserveKeyboardFocus } from "@/lib/keyboard-focus";
import {
  cancelarAuthenticator,
  iniciarLoginGoogle,
  loginConAuthenticator,
  loginUsuario,
  regenerarQrAuthenticator,
  verificarCodigoAuthenticator,
} from "@/app/actions/usuarios";

type SesionUsuario = { id: number; nombre: string };
type Metodo = "usuario" | "authenticator" | "google";
type Paso = "credenciales" | "codigo" | "enroll";

const METODOS: { id: Metodo; etiqueta: string }[] = [
  { id: "usuario", etiqueta: "Usuario" },
  { id: "authenticator", etiqueta: "Authenticator" },
  { id: "google", etiqueta: "Google" },
];

function PasswordField({ label, name, value, busy, onChange }: {
  label: string;
  name: string;
  value: string;
  busy: boolean;
  onChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  return (
    <div className="revision-text-field">
      <label htmlFor={id}>{label}</label>
      <div className="auth-password">
        <input id={id} name={name} type={visible ? "text" : "password"}
          data-login-password autoComplete="current-password" enterKeyHint="go"
          required readOnly={busy} value={value} onChange={(event) => onChange(event.target.value)} />
        <button type="button" className="auth-password-toggle" aria-controls={id}
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-pressed={visible} disabled={busy} onClick={() => setVisible(!visible)}>
          {visible ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}

export function LoginForm({
  online,
  variant,
  onSuccess,
}: {
  online: boolean;
  variant: "card" | "sheet";
  onSuccess: (user: SesionUsuario) => void;
}) {
  const [metodo, setMetodo] = useState<Metodo>("usuario");
  const [paso, setPaso] = useState<Paso>("credenciales");
  const [usuario, setUsuario] = useState("");
  const [claveUsuario, setClaveUsuario] = useState("");
  const [email, setEmail] = useState("");
  const [claveAuth, setClaveAuth] = useState("");
  const [factorId, setFactorId] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [codigo, setCodigo] = useState("");
  const [aviso, setAviso] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const pending = useRef(false);
  const messageId = useId();

  function beginRequest(message: string) {
    if (pending.current || !online) return false;
    pending.current = true;
    setBusy(true);
    setBusyMessage(message);
    setError("");
    const focused = document.activeElement;
    // Only dismiss after activation/validation, never before the tap's click.
    if (focused instanceof HTMLInputElement && form.current?.contains(focused)) focused.blur();
    return true;
  }

  function finishRequest() {
    pending.current = false;
    setBusy(false);
  }

  function nextPassword(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    form.current?.querySelector<HTMLInputElement>("[data-login-password]")?.focus();
  }

  function limpiarMfa() {
    setPaso("credenciales");
    setFactorId("");
    setQrCode("");
    setSecret("");
    setCodigo("");
  }

  function cambiarMetodo(next: Metodo) {
    if (busy || next === metodo) return;
    if (metodo === "authenticator" && paso !== "credenciales") {
      void cancelarAuthenticator().catch(() => null);
    }
    setError("");
    setAviso("");
    limpiarMfa();
    setClaveUsuario("");
    setClaveAuth("");
    setMetodo(next);
  }

  function cancelarMfa() {
    void cancelarAuthenticator().catch(() => null);
    setError("");
    setAviso("");
    limpiarMfa();
  }

  function actualizarCodigo(valor: string) {
    setCodigo(valor.replace(/\D/g, "").slice(0, 6));
  }

  async function ingresarUsuario() {
    if (!beginRequest("Iniciando sesión…")) return;
    setAviso("");
    try {
      const result = await loginUsuario(usuario, claveUsuario);
      if (result.error) {
        setError(result.error);
        if (result.useAuthenticator) {
          setClaveUsuario("");
          setEmail((actual) => actual || usuario.trim());
          setMetodo("authenticator");
          limpiarMfa();
          setAviso("Continúa con tu correo y la contraseña de Auth.");
        } else if (result.useGoogle) {
          setClaveUsuario("");
          setMetodo("google");
          limpiarMfa();
        }
        return;
      }
      if (result.user) {
        onSuccess(result.user);
        return;
      }
      setError("No se pudo iniciar sesión. Inténtalo de nuevo.");
    } catch {
      setError("No se pudo conectar. Inténtalo de nuevo.");
    } finally {
      finishRequest();
    }
  }

  async function ingresarAuthenticator() {
    if (!beginRequest("Comprobando tus datos…")) return;
    setAviso("");
    try {
      const result = await loginConAuthenticator(email, claveAuth);
      if (result.error) {
        setError(result.error);
        return;
      }
      setClaveAuth("");
      if ("step" in result && result.step === "challenge") {
        setFactorId(result.factorId);
        setCodigo("");
        setPaso("codigo");
        return;
      }
      if ("step" in result && result.step === "enroll") {
        setFactorId(result.factorId);
        setQrCode(result.qrCode);
        setSecret(result.secret || "");
        setCodigo("");
        setPaso("enroll");
        return;
      }
      if (result.user) {
        onSuccess(result.user);
        return;
      }
      setError("No se pudo iniciar sesión. Inténtalo de nuevo.");
    } catch {
      setError("No se pudo conectar. Inténtalo de nuevo.");
    } finally {
      finishRequest();
    }
  }

  async function verificarCodigo() {
    if (!factorId || codigo.length !== 6 || !beginRequest("Verificando código…")) return;
    try {
      const result = await verificarCodigoAuthenticator(factorId, codigo);
      if (result.error) {
        if (result.restartAuthenticator) limpiarMfa();
        setError(result.error);
        return;
      }
      if (result.user) {
        onSuccess(result.user);
        return;
      }
      setError("No se pudo verificar el código. Inténtalo de nuevo.");
    } catch {
      setError("No se pudo conectar. Inténtalo de nuevo.");
    } finally {
      finishRequest();
    }
  }

  async function regenerarQr() {
    if (!beginRequest("Generando un nuevo código QR…")) return;
    try {
      const result = await regenerarQrAuthenticator();
      if (result.error) {
        if (result.restartAuthenticator) limpiarMfa();
        setError(result.error);
        return;
      }
      if ("step" in result && result.step === "enroll") {
        setFactorId(result.factorId);
        setQrCode(result.qrCode);
        setSecret(result.secret || "");
        setCodigo("");
        setPaso("enroll");
        return;
      }
      if ("step" in result && result.step === "challenge") {
        setFactorId(result.factorId);
        setCodigo("");
        setPaso("codigo");
        return;
      }
      setError("No se pudo generar un QR nuevo.");
    } catch {
      setError("No se pudo conectar. Inténtalo de nuevo.");
    } finally {
      finishRequest();
    }
  }

  async function entrarGoogle() {
    if (!beginRequest("Abriendo Google…")) return;
    try {
      const result = await iniciarLoginGoogle();
      if (!result.url) {
        setError(result.error || "No se pudo abrir Google");
        return;
      }
      window.location.assign(result.url);
    } catch {
      setError("No se pudo conectar. Inténtalo de nuevo.");
    } finally {
      finishRequest();
    }
  }

  const submitDisabled = busy || !online;
  const verificarDisabled = submitDisabled || codigo.length !== 6;

  return (
    <form
      ref={form}
      onMouseDown={preserveKeyboardFocus}
      aria-label="Iniciar sesión"
      aria-describedby={error ? messageId : undefined}
      className={variant === "card" ? "pantalla-card auth-form" : "revision-edit-form auth-form"}
      onSubmit={(event) => {
        event.preventDefault();
        if (metodo === "usuario") void ingresarUsuario();
        else if (metodo === "authenticator" && paso === "credenciales") void ingresarAuthenticator();
        else if (metodo === "authenticator") void verificarCodigo();
      }}
    >
      <div className="auth-tabs" role="group" aria-label="Método de acceso">
        {METODOS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={metodo === item.id}
            className="auth-tab"
            disabled={busy}
            onClick={() => cambiarMetodo(item.id)}
          >
            {item.etiqueta}
          </button>
        ))}
      </div>

      {metodo === "usuario" ? (
        <>
          <p className="auth-hint">Usa tu usuario y contraseña de Casitas.</p>
          <label className="revision-text-field">
            Usuario
            <input
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              onKeyDown={nextPassword}
              readOnly={busy}
              required
              value={usuario}
              onChange={(event) => setUsuario(event.target.value)}
            />
          </label>
          <PasswordField label="Contraseña" name="password" value={claveUsuario} busy={busy} onChange={setClaveUsuario} />
          <div className="auth-actions">
            <button className="primary-button" disabled={submitDisabled}>
              {busy ? "Entrando…" : "Entrar"}
            </button>
          </div>
        </>
      ) : null}

      {metodo === "authenticator" && paso === "credenciales" ? (
        <>
          <p className="auth-hint">Entra con tu correo y la contraseña de Auth. Luego pediremos el código de Google Authenticator.</p>
          <label className="revision-text-field">
            Correo
            <input
              name="email"
              type="email"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              onKeyDown={nextPassword}
              readOnly={busy}
              inputMode="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <PasswordField key="auth-password" label="Contraseña de Auth" name="auth-password" value={claveAuth} busy={busy} onChange={setClaveAuth} />
          <div className="auth-actions">
            <button className="primary-button" disabled={submitDisabled}>
              {busy ? "Comprobando…" : "Continuar"}
            </button>
          </div>
        </>
      ) : null}

      {metodo === "authenticator" && paso === "codigo" ? (
        <>
          <p className="auth-hint">Escribe el código de 6 dígitos de tu Google Authenticator.</p>
          <label className="revision-text-field">
            Código
            <input
              name="code"
              enterKeyHint="go"
              readOnly={busy}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={codigo}
              onChange={(event) => actualizarCodigo(event.target.value)}
            />
          </label>
          <div className="auth-actions">
            <button type="button" className="secondary-button" disabled={busy} onClick={cancelarMfa}>
              Cancelar
            </button>
            <button className="primary-button" disabled={verificarDisabled}>
              {busy ? "Verificando…" : "Verificar"}
            </button>
          </div>
        </>
      ) : null}

      {metodo === "authenticator" && paso === "enroll" ? (
        <>
          <p className="auth-hint">Escanea el código QR con Google Authenticator y confírmalo con el código de 6 dígitos.</p>
          {qrCode ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img className="auth-qr" src={qrCode} alt="Código QR de Google Authenticator" />
          ) : null}
          {secret ? <p className="auth-secret">{secret}</p> : null}
          <label className="revision-text-field">
            Código
            <input
              name="code"
              enterKeyHint="go"
              readOnly={busy}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={codigo}
              onChange={(event) => actualizarCodigo(event.target.value)}
            />
          </label>
          <div className="auth-actions">
            <button type="button" className="secondary-button" disabled={busy} onClick={cancelarMfa}>
              Cancelar
            </button>
            <button type="button" className="secondary-button" disabled={submitDisabled} onClick={() => void regenerarQr()}>
              Generar un QR nuevo
            </button>
            <button className="primary-button" disabled={verificarDisabled}>
              Verificar y entrar
            </button>
          </div>
        </>
      ) : null}

      {metodo === "google" ? (
        <>
          <p className="auth-hint">Usa la cuenta de Google que el administrador autorizó para tu usuario.</p>
          <div className="auth-actions">
            <button type="button" className="primary-button" disabled={submitDisabled} onClick={() => void entrarGoogle()}>
              {busy ? "Abriendo Google…" : "Continuar con Google"}
            </button>
          </div>
          <p className="auth-hint">La sesión de Google dura 8 horas y el acceso queda registrado.</p>
        </>
      ) : null}

      <div className="auth-status" role="status" aria-live="polite" aria-atomic="true">
        {!online ? "Sin conexión. Conéctate a internet para iniciar sesión; tus datos se conservan aquí." : busy ? busyMessage : ""}
      </div>
      {aviso ? (
        <p className="auth-hint" role="status">
          {aviso}
        </p>
      ) : null}
      {error ? (
        <p id={messageId} className="revision-field-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
