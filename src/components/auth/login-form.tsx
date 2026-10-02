"use client";

import { useId, useRef, useState, type ComponentType, type KeyboardEvent } from "react";
import {
  CircleAlert,
  CircleCheck,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UserRound,
  WifiOff,
} from "lucide-react";
import { GoogleIcon } from "@/components/ui/google-icon";
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

const METODOS: { id: Metodo; etiqueta: string; Icon: ComponentType<{ size?: number }> }[] = [
  { id: "usuario", etiqueta: "Usuario", Icon: UserRound },
  { id: "authenticator", etiqueta: "Authenticator", Icon: ShieldCheck },
  { id: "google", etiqueta: "Google", Icon: GoogleIcon },
];

function SubmitLabel({ busy, done, busyText, text }: { busy: boolean; done: boolean; busyText: string; text: string }) {
  if (done) return <><CircleCheck size={19} aria-hidden="true" />Listo</>;
  if (busy) return <><LoaderCircle size={19} className="auth-spinner" aria-hidden="true" />{busyText}</>;
  return <>{text}</>;
}

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
      <div className="auth-input auth-password">
        <LockKeyhole size={18} className="auth-input-icon" aria-hidden="true" />
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
  const [done, setDone] = useState(false);
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

  function completar(user: SesionUsuario) {
    setDone(true);
    onSuccess(user);
  }

  function finishRequest() {
    pending.current = false;
    setBusy(false);
  }

  function nextPassword(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    form.current?.querySelector<HTMLInputElement>("[data-login-password]")?.focus({ preventScroll: variant === "sheet" });
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
        completar(result.user);
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
        completar(result.user);
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
        completar(result.user);
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
      className={`${variant === "card" ? "pantalla-card" : "revision-edit-form"} auth-form login-form`}
      onSubmit={(event) => {
        event.preventDefault();
        if (metodo === "usuario") void ingresarUsuario();
        else if (metodo === "authenticator" && paso === "credenciales") void ingresarAuthenticator();
        else if (metodo === "authenticator") void verificarCodigo();
      }}
    >
      <div className="auth-tabs" role="group" aria-label="Método de acceso">
        {METODOS.map(({ id, etiqueta, Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={metodo === id}
            className="auth-tab"
            disabled={busy || done}
            onClick={() => cambiarMetodo(id)}
          >
            <Icon size={18} />
            <span>{etiqueta}</span>
          </button>
        ))}
      </div>

      <div key={`${metodo}-${paso}`} className="auth-panel">
        {metodo === "usuario" ? (
          <>
            <label className="revision-text-field">
              Usuario
              <span className="auth-input">
                <UserRound size={18} className="auth-input-icon" aria-hidden="true" />
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
              </span>
            </label>
            <PasswordField label="Contraseña" name="password" value={claveUsuario} busy={busy} onChange={setClaveUsuario} />
            <button className="primary-button auth-submit" disabled={submitDisabled || done}>
              <SubmitLabel busy={busy} done={done} busyText="Entrando…" text="Entrar" />
            </button>
          </>
        ) : null}

        {metodo === "authenticator" && paso === "credenciales" ? (
          <>
            <p className="auth-hint">Luego te pediremos el código de Google Authenticator.</p>
            <label className="revision-text-field">
              Correo
              <span className="auth-input">
                <Mail size={18} className="auth-input-icon" aria-hidden="true" />
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
              </span>
            </label>
            <PasswordField key="auth-password" label="Contraseña de Auth" name="auth-password" value={claveAuth} busy={busy} onChange={setClaveAuth} />
            <button className="primary-button auth-submit" disabled={submitDisabled || done}>
              <SubmitLabel busy={busy} done={done} busyText="Comprobando…" text="Continuar" />
            </button>
          </>
        ) : null}

        {metodo === "authenticator" && paso === "codigo" ? (
          <>
            <div className="auth-step-icon" aria-hidden="true"><ShieldCheck size={26} /></div>
            <p className="auth-hint auth-center">Código de 6 dígitos de Google Authenticator</p>
            <label className="revision-text-field">
              <span className="sr-only">Código</span>
              <input
                className="auth-code"
                name="code"
                enterKeyHint="go"
                readOnly={busy}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                placeholder="000000"
                value={codigo}
                onChange={(event) => actualizarCodigo(event.target.value)}
              />
            </label>
            <div className="auth-actions">
              <button type="button" className="secondary-button" disabled={busy || done} onClick={cancelarMfa}>
                Cancelar
              </button>
              <button className="primary-button" disabled={verificarDisabled || done}>
                <SubmitLabel busy={busy} done={done} busyText="Verificando…" text="Verificar" />
              </button>
            </div>
          </>
        ) : null}

        {metodo === "authenticator" && paso === "enroll" ? (
          <>
            <p className="auth-hint auth-center">Escanea el QR con Google Authenticator</p>
            {qrCode ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img className="auth-qr" src={qrCode} alt="Código QR de Google Authenticator" />
            ) : null}
            {secret ? <p className="auth-secret">{secret}</p> : null}
            <label className="revision-text-field">
              <span className="sr-only">Código</span>
              <input
                className="auth-code"
                name="code"
                enterKeyHint="go"
                readOnly={busy}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                placeholder="000000"
                value={codigo}
                onChange={(event) => actualizarCodigo(event.target.value)}
              />
            </label>
            <button className="primary-button auth-submit" disabled={verificarDisabled || done}>
              <SubmitLabel busy={busy} done={done} busyText="Verificando…" text="Verificar y entrar" />
            </button>
            <div className="auth-actions">
              <button type="button" className="secondary-button" disabled={busy || done} onClick={cancelarMfa}>
                Cancelar
              </button>
              <button type="button" className="secondary-button" disabled={submitDisabled || done} onClick={() => void regenerarQr()}>
                Nuevo QR
              </button>
            </div>
          </>
        ) : null}

        {metodo === "google" ? (
          <>
            <div className="auth-google-mark" aria-hidden="true"><GoogleIcon size={30} /></div>
            <p className="auth-hint auth-center">Usa la cuenta autorizada por el administrador</p>
            <button type="button" className="auth-google-button" disabled={submitDisabled} onClick={() => void entrarGoogle()}>
              {busy ? <LoaderCircle size={19} className="auth-spinner" aria-hidden="true" /> : <GoogleIcon size={19} />}
              {busy ? "Abriendo Google…" : "Continuar con Google"}
            </button>
          </>
        ) : null}
      </div>

      {!online ? (
        <p className="auth-notice" role="status">
          <WifiOff size={16} aria-hidden="true" />
          Sin conexión
        </p>
      ) : null}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {busy ? busyMessage : done ? "Sesión iniciada" : ""}
      </div>
      {aviso ? (
        <p className="auth-hint" role="status">
          {aviso}
        </p>
      ) : null}
      {error ? (
        <p id={messageId} className="auth-error" role="alert">
          <CircleAlert size={17} aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </form>
  );
}
