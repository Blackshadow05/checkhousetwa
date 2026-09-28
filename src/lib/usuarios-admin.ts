export class UsuarioAdminError extends Error {}

export const ROLES_ADMIN = ["user", "admin", "SuperAdmin", "inactivo"] as const;
export type RolAdmin = (typeof ROLES_ADMIN)[number];

export const METODOS_ADMIN = ["usuario", "correo", "google"] as const;
export type MetodoAdmin = (typeof METODOS_ADMIN)[number];

export const ROL_LABELS: Record<string, string> = {
  user: "Usuario",
  admin: "Administrador",
  SuperAdmin: "Super administrador",
  inactivo: "Inactivo",
};

export const METODO_LABELS: Record<MetodoAdmin, string> = {
  usuario: "Usuario y contraseña",
  correo: "Correo y contraseña",
  google: "Google",
};

export const METODO_CORTOS: Record<MetodoAdmin, string> = {
  usuario: "Usuario",
  correo: "Correo",
  google: "Google",
};

export const METODO_HINTS: Record<MetodoAdmin, string> = {
  usuario: "Entra con su usuario y contraseña.",
  correo: "Entra con correo y contraseña, y configura Google Authenticator al entrar.",
  google: "Entra con la cuenta de Google de ese correo.",
};

export const ADMIN_ROLES = ["admin", "SuperAdmin"] as const;

export type AdminUsuario = {
  id: number;
  nombre: string;
  rol: string;
  metodo: MetodoAdmin;
  email: string | null;
  authUserId: string | null;
  totpEnrolled: boolean;
  ultimoLogin: string | null;
};

export type AdminUsuarioInput = {
  id: number | null;
  nombre: string;
  rol: string;
  metodo: MetodoAdmin;
  email: string;
  password: string;
};

export function esRolAdmin(rol: string | null | undefined): boolean {
  return rol === "admin" || rol === "SuperAdmin";
}

export function metodoAdminDe(row: {
  metodo_login: string | null;
  auth_user_id: string | null;
  totp_enrolled: boolean;
}): MetodoAdmin {
  if (row.metodo_login === "google") return "google";
  if (row.auth_user_id || row.totp_enrolled) return "correo";
  return "usuario";
}

export function rolLabel(rol: string): string {
  return ROL_LABELS[rol] ?? rol;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validarUsuarioAdmin(input: AdminUsuarioInput, nuevo: boolean): string | null {
  const nombre = input.nombre.trim();
  if (nombre.length < 2 || nombre.length > 60) return "Escribe un nombre de 2 a 60 caracteres.";
  if (!ROLES_ADMIN.includes(input.rol as RolAdmin)) return "Selecciona un rol válido.";
  if (input.metodo !== "usuario") {
    const email = input.email.trim();
    if (!email) return "Escribe el correo del usuario.";
    if (email.length > 254 || !EMAIL_RE.test(email)) return "El correo no es válido.";
  }
  if (input.password.length > 200) return "La contraseña es demasiado larga.";
  if (input.password && input.password.length < 6) return "La contraseña debe tener al menos 6 caracteres.";
  if (nuevo && input.metodo !== "google" && input.password.length < 6) return "Escribe una contraseña de al menos 6 caracteres.";
  return null;
}
