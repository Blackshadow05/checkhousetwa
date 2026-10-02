"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowRight, ChevronRight, Eye, EyeOff, KeyRound, Plus, RefreshCw, Trash2, Users } from "lucide-react";
import {
  adminActualizarUsuario,
  adminCrearUsuario,
  adminEliminarUsuario,
  adminEstadoAuthenticator,
  adminListarUsuarios,
  adminResetearAuthenticator,
} from "@/app/actions/usuarios-admin";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useOnline } from "@/lib/use-online";
import {
  METODO_CORTOS,
  METODO_HINTS,
  METODO_LABELS,
  METODOS_ADMIN,
  ROLES_ADMIN,
  rolLabel,
  validarUsuarioAdmin,
  type AdminUsuario,
  type MetodoAdmin,
} from "@/lib/usuarios-admin";
import type { UsuarioShell } from "@/types/database";

type FactorEstado = "activo" | "pendiente" | "sin-auth" | "cargando" | null;

function fechaCorta(value: string | null): string {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString("es-CR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Costa_Rica" });
  } catch {
    return "";
  }
}

function PasswordInput({
  label,
  value,
  placeholder,
  busy,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  busy: boolean;
  onChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  return (
    <div className="revision-text-field">
      <label htmlFor={id}>{label}</label>
      <div className="auth-password">
        <input
          id={id}
          name="password"
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          readOnly={busy}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className="auth-password-toggle"
          aria-controls={id}
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-pressed={visible}
          disabled={busy}
          onClick={() => setVisible(!visible)}
        >
          {visible ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}

export function AdminUsuariosScreen({
  visible,
  path,
  navigate,
  session,
}: {
  visible: boolean;
  path: string;
  navigate: (path: string) => void;
  session: UsuarioShell;
}) {
  const online = useOnline();
  const [usuarios, setUsuarios] = useState<AdminUsuario[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<AdminUsuario | null>(null);
  const [confirmar, setConfirmar] = useState<"eliminar" | "resetear" | null>(null);
  const [factorEstado, setFactorEstado] = useState<FactorEstado>(null);
  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState("user");
  const [metodo, setMetodo] = useState<MetodoAdmin>("usuario");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const fetching = useRef(false);
  const saving = useRef(false);
  const wasVisible = useRef(false);

  const cargar = useCallback(async () => {
    if (fetching.current || !navigator.onLine) return;
    fetching.current = true;
    setLoading(true);
    try {
      const result = await adminListarUsuarios();
      if (result.error) setError(result.error);
      else {
        setUsuarios(result.usuarios);
        setError("");
      }
    } catch {
      setError("No se pudo conectar. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
      fetching.current = false;
    }
  }, []);

  useEffect(() => {
    if (!visible) {
      wasVisible.current = false;
      return;
    }
    if (wasVisible.current) return;
    wasVisible.current = true;
    void cargar();
  }, [visible, cargar]);

  const visibles = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return (usuarios ?? []).filter((usuario) => {
      if (!term) return true;
      return `${usuario.nombre} ${usuario.email ?? ""} ${rolLabel(usuario.rol)}`.toLocaleLowerCase().includes(term);
    });
  }, [usuarios, search]);

  const esYo = editando?.id === session.id;
  const puedeCambiarAcceso = !esYo || session.rol === "SuperAdmin";
  const abierto = visible && (creando ? path === "/admin-usuarios/nuevo" : editando ? path === "/admin-usuarios/editar" : false);

  function limpiarForm() {
    setNombre("");
    setRol("user");
    setMetodo("usuario");
    setEmail("");
    setPassword("");
    setFormError("");
    setFactorEstado(null);
    setConfirmar(null);
  }

  function abrirNuevo() {
    limpiarForm();
    setEditando(null);
    setCreando(true);
    setNotice("");
    navigate("/admin-usuarios/nuevo");
  }

  function cargarFactor(usuario: AdminUsuario) {
    setFactorEstado("cargando");
    void adminEstadoAuthenticator(usuario.id)
      .then((result) => setFactorEstado(result.error ? null : result.estado))
      .catch(() => setFactorEstado(null));
  }

  function abrirEditar(usuario: AdminUsuario) {
    limpiarForm();
    setCreando(false);
    setEditando(usuario);
    setNombre(usuario.nombre);
    setRol(usuario.rol);
    setMetodo(usuario.metodo);
    setEmail(usuario.email ?? "");
    if (usuario.metodo !== "usuario") cargarFactor(usuario);
    setNotice("");
    navigate("/admin-usuarios/editar");
  }

  function cerrarForm() {
    setCreando(false);
    setEditando(null);
    setConfirmar(null);
    setFormError("");
    if (window.location.pathname.replace(/\/$/, "") !== "/admin-usuarios") navigate("/admin-usuarios");
  }

  function cambiarMetodo(next: MetodoAdmin) {
    if (busy || next === metodo) return;
    setMetodo(next);
    if (next === "google") setPassword("");
    setFormError("");
  }

  function reemplazarEnLista(usuario: AdminUsuario) {
    setUsuarios((prev) => {
      if (!prev) return [usuario];
      const existe = prev.some((item) => item.id === usuario.id);
      return existe ? prev.map((item) => (item.id === usuario.id ? usuario : item)) : [...prev, usuario].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    });
  }

  async function guardar() {
    if (saving.current || busy) return;
    if (!online) {
      setFormError("Sin conexión. Inténtalo cuando vuelvas a estar en línea.");
      return;
    }
    const input = { id: editando?.id ?? null, nombre, rol, metodo, email, password };
    const invalid = validarUsuarioAdmin(input, editando === null);
    if (invalid) {
      setFormError(invalid);
      return;
    }
    saving.current = true;
    setBusy(true);
    setFormError("");
    try {
      const result = editando ? await adminActualizarUsuario(input) : await adminCrearUsuario(input);
      if (result.error || !result.usuario) {
        setFormError(result.error || "No se pudo guardar.");
        return;
      }
      if ("sesionCerrada" in result && result.sesionCerrada) {
        window.location.reload();
        return;
      }
      reemplazarEnLista(result.usuario);
      setNotice(editando ? "Usuario actualizado." : "Usuario creado.");
      setError("");
      setCreando(false);
      setEditando(null);
      setConfirmar(null);
      navigate("/admin-usuarios");
    } catch {
      setFormError("No se pudo guardar. Inténtalo de nuevo.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  async function confirmarAccion() {
    if (saving.current || busy || !confirmar || !editando) return;
    if (!online) {
      setFormError("Sin conexión. Inténtalo cuando vuelvas a estar en línea.");
      return;
    }
    const accion = confirmar;
    saving.current = true;
    setBusy(true);
    setFormError("");
    try {
      if (accion === "eliminar") {
        const result = await adminEliminarUsuario(editando.id);
        if (result.error) {
          setFormError(result.error);
          setConfirmar(null);
          return;
        }
        setUsuarios((prev) => prev?.filter((item) => item.id !== editando.id) ?? prev);
        setNotice("Usuario eliminado.");
        setEditando(null);
        setConfirmar(null);
        navigate("/admin-usuarios");
      } else {
        const result = await adminResetearAuthenticator(editando.id);
        if (result.error) {
          setFormError(result.error);
          setConfirmar(null);
          return;
        }
        setFactorEstado("pendiente");
        setNotice("Token resetado. Configurará uno nuevo al entrar.");
        setConfirmar(null);
      }
      setError("");
    } catch {
      setFormError("No se pudo completar la acción. Inténtalo de nuevo.");
      setConfirmar(null);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  const estadoTexto = loading ? "Actualizando…" : !online ? "Sin conexión" : usuarios ? `${usuarios.length} usuarios` : "Cargando…";

  return (
    <div>
      <button type="button" onClick={() => navigate("/otros")}>← Otros</button>
      <div className="pantalla-toolbar">
        <h1>Admin Usuarios</h1>
        <button type="button" aria-label="Actualizar usuarios" disabled={loading || !online} onClick={() => void cargar()}>
          <RefreshCw size={20} aria-hidden />
        </button>
      </div>
      <label>
        Buscar
        <input type="search" placeholder="Nombre o correo" value={search} onChange={(event) => setSearch(event.target.value)} />
      </label>
      <button type="button" className="pantalla-primary" onClick={abrirNuevo}>
        <Plus size={20} aria-hidden /> Nuevo usuario
      </button>
      <p role="status" className="pantalla-status">
        {estadoTexto}
      </p>
      {notice && <p role="status" className="pantalla-notice">{notice}</p>}
      {error && <p role="alert" className="pantalla-error">{error}</p>}
      {loading && !usuarios && <div className="pantalla-skeleton" aria-label="Cargando usuarios" />}
      {usuarios && !visibles.length && (
        <div className="pantalla-card">
          <h3>{search ? "Sin resultados" : "Todavía no hay usuarios"}</h3>
        </div>
      )}
      {visibles.map((usuario) => (
        <button type="button" className="admin-user-card" key={usuario.id} onClick={() => abrirEditar(usuario)}>
          <span className="admin-user-head">
            <strong>{usuario.nombre}</strong>
            <span className={`admin-chip admin-chip-${usuario.rol}`}>{rolLabel(usuario.rol)}</span>
          </span>
          <span className="admin-user-meta">
            {METODO_LABELS[usuario.metodo]}
            {usuario.email ? ` · ${usuario.email}` : ""}
          </span>
          {usuario.ultimoLogin && <span className="admin-user-meta">Último acceso {fechaCorta(usuario.ultimoLogin)}</span>}
          <ChevronRight className="admin-user-arrow" size={18} aria-hidden />
        </button>
      ))}

      <BottomSheet open={abierto} onClose={cerrarForm} title={creando ? "Nuevo usuario" : "Editar usuario"}>
        {confirmar ? (
          <div className="admin-confirm">
            <h3>
              {confirmar === "eliminar" ? `¿Eliminar a ${editando?.nombre}?` : `¿Resetear el token de ${editando?.nombre}?`}
            </h3>
            <p className="pantalla-status">
              {confirmar === "eliminar"
                ? "Perderá el acceso a la app."
                : "Borra su Authenticator actual; configurará uno nuevo al entrar."}
            </p>
            <div className="auth-actions">
              <button type="button" className="secondary-button" disabled={busy} onClick={() => setConfirmar(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className={confirmar === "eliminar" ? "admin-danger-solid" : "primary-button"}
                disabled={busy}
                onClick={() => void confirmarAccion()}
              >
                {busy ? "Procesando…" : confirmar === "eliminar" ? "Eliminar" : "Resetear"}
              </button>
            </div>
            {formError && <p className="pantalla-error" role="alert">{formError}</p>}
          </div>
        ) : (
          <form
            className="auth-form admin-form"
            onSubmit={(event) => {
              event.preventDefault();
              void guardar();
            }}
          >
            {esYo && (
              <p className="auth-hint">
                {puedeCambiarAcceso
                  ? "Si cambias tu método o tu correo, puede que tengas que volver a iniciar sesión."
                  : "Solo puedes cambiar tu nombre y contraseña."}
              </p>
            )}
            <label className="revision-text-field">
              Nombre
              <input
                name="nombre"
                autoComplete="name"
                enterKeyHint="next"
                readOnly={busy}
                required
                value={nombre}
                onChange={(event) => setNombre(event.target.value)}
              />
            </label>
            <div className="revision-text-field">
              <span>Método</span>
              <div className="auth-tabs" role="group" aria-label="Método de ingreso">
                {METODOS_ADMIN.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="auth-tab"
                    aria-pressed={metodo === item}
                    disabled={busy || !puedeCambiarAcceso}
                    onClick={() => cambiarMetodo(item)}
                  >
                    {METODO_CORTOS[item]}
                  </button>
                ))}
              </div>
              <p className="auth-hint">{METODO_HINTS[metodo]}</p>
            </div>
            {metodo !== "usuario" && (
              <label className="revision-text-field">
                Correo
                <input
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="next"
                  readOnly={busy || !puedeCambiarAcceso}
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
            )}
            {metodo !== "google" && (
              <PasswordInput
                label={metodo === "usuario" ? "Contraseña" : "Contraseña de Auth"}
                value={password}
                placeholder={editando ? "Dejar en blanco para mantener" : ""}
                busy={busy}
                onChange={setPassword}
              />
            )}
            <label className="revision-text-field">
              Rol
              <select name="rol" disabled={busy || esYo} value={rol} onChange={(event) => setRol(event.target.value)}>
                {ROLES_ADMIN.map((item) => (
                  <option key={item} value={item}>
                    {rolLabel(item)}
                  </option>
                ))}
              </select>
            </label>
            <div className="auth-actions">
              <button type="button" className="secondary-button" disabled={busy} onClick={cerrarForm}>
                Cancelar
              </button>
              <button className="primary-button" disabled={busy || !online}>
                {busy ? "Guardando…" : "Guardar"}
              </button>
            </div>
            {formError && <p className="pantalla-error" role="alert">{formError}</p>}
            {editando && (
              <div className="admin-actions">
                {editando.metodo !== "usuario" && (
                  <div className="admin-section">
                    <div className="admin-section-head">
                      <strong>Authenticator</strong>
                      <span className="pantalla-status">
                        {factorEstado === "activo"
                          ? "Activo"
                          : factorEstado === "pendiente"
                            ? "Pendiente de configurar"
                            : factorEstado === "cargando"
                              ? "Comprobando…"
                              : factorEstado === "sin-auth"
                                ? "Aún no ha entrado"
                                : ""}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={busy || factorEstado === "sin-auth"}
                      onClick={() => {
                        setFormError("");
                        setConfirmar("resetear");
                      }}
                    >
                      <KeyRound size={18} aria-hidden /> Resetear token
                    </button>
                  </div>
                )}
                {!esYo && (
                  <button
                    type="button"
                    className="admin-danger"
                    disabled={busy}
                    onClick={() => {
                      setFormError("");
                      setConfirmar("eliminar");
                    }}
                  >
                    <Trash2 size={18} aria-hidden /> Eliminar usuario
                  </button>
                )}
              </div>
            )}
          </form>
        )}
      </BottomSheet>
    </div>
  );
}

export function AdminUsuariosFeature({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" className="pantalla-feature" onClick={onOpen}>
      <span className="pantalla-feature-icon">
        <Users size={27} aria-hidden />
      </span>
      <span>
        <strong>Admin Usuarios</strong>
        <small>Cuentas y formas de ingreso</small>
      </span>
      <ArrowRight size={21} aria-hidden />
    </button>
  );
}
