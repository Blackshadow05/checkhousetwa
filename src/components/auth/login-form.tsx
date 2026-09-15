"use client";

import { useState } from "react";
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
    if (busy || !online) return;
    setBusy(true);
    setError("");
    setAviso("");
    try {
      const result = await loginUsuario(usuario, claveUsuario);
      setClaveUsuario("");
      if (result.error) {
        setError(result.error);
        if (result.useAuthenticator) {
          setEmail((actual) => actual || usuario.trim());
          setMetodo("authenticator");
          limpiarMfa();
          setAviso("Continúa con tu correo y la contraseña de Auth.");
        } else if (result.useGoogle) {
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
      setBusy(false);
    }
  }

  async function ingresarAuthenticator() {
    if (busy || !online) return;
    setBusy(true);
    setError("");
    setAviso("");
    try {
      const result = await loginConAuthenticator(email, claveAuth);
      setClaveAuth("");
      if (result.error) {
        setError(result.error);
        return;
      }
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
      setBusy(false);
    }
  }

  async function verificarCodigo() {
    if (busy || !online || !factorId || codigo.length !== 6) return;
    setBusy(true);
    setError("");
    try {
      const result = await verificarCodigoAuthenticator(factorId, codigo);
      if (result.error) {
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
      setBusy(false);
    }
  }

  async function regenerarQr() {
    if (busy || !online) return;
    setBusy(true);
    setError("");
    try {
      const result = await regenerarQrAuthenticator();
      if (result.error) {
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
      setBusy(false);
    }
  }

  async function entrarGoogle() {
    if (busy || !online) return;
    setBusy(true);
    setError("");
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
      setBusy(false);
    }
  }

  const submitDisabled = busy || !online;
  const verificarDisabled = submitDisabled || codigo.length !== 6;

  return (
    <form
      className={variant === "card" ? "pantalla-card auth-form" : "revision-edit-form auth-form"}
      onSubmit={(event) => {
        event.preventDefault();
        if (metodo === "usuario") void ingresarUsuario();
        else if (metodo === "authenticator" && paso === "credenciales") void ingresarAuthenticator();
        else if (metodo === "authenticator") void verificarCodigo();
      }}
    >
      <div className="auth-tabs" role="tablist" aria-label="Método de acceso">
        {METODOS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={metodo === item.id}
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
              autoComplete="username"
              required
              value={usuario}
              onChange={(event) => setUsuario(event.target.value)}
            />
          </label>
          <label className="revision-text-field">
            Contraseña
            <input
              type="password"
              autoComplete="current-password"
              required
              value={claveUsuario}
              onChange={(event) => setClaveUsuario(event.target.value)}
            />
          </label>
          <div className="auth-actions">
            <button className="primary-button" disabled={submitDisabled}>
              Entrar
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
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="revision-text-field">
            Contraseña de Auth
            <input
              type="password"
              autoComplete="current-password"
              required
              value={claveAuth}
              onChange={(event) => setClaveAuth(event.target.value)}
            />
          </label>
          <div className="auth-actions">
            <button className="primary-button" disabled={submitDisabled}>
              Continuar
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
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
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
              Verificar
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
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
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
              Continuar con Google
            </button>
          </div>
          <p className="auth-hint">La sesión de Google dura 8 horas y el acceso queda registrado.</p>
        </>
      ) : null}

      {aviso ? (
        <p className="auth-hint" role="status">
          {aviso}
        </p>
      ) : null}
      {error ? (
        <p className="revision-field-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
