export const APP_NAME = "Revisión de casitas";
export const APP_SHORT_NAME = "Casitas";
export const APP_DESCRIPTION =
  "Tus casitas, al día. Consulta y organiza las revisiones de tu equipo, incluso sin conexión.";
export const ANDROID_PACKAGE_NAME = "com.revisioncasitas.app";
export const REVISIONES_TABLE = "revisiones_casitas";
export const NOTAS_REVISIONES_TABLE = "notas_revisiones_casitas";
export const REGISTRO_EDICIONES_TABLE = "Registro_ediciones";
export const MENUS_TABLE = "menus";
export const MENUS_AHEAD_DAYS = 10;
export const IDB_NAME = "revision-casitas";
export const IDB_VERSION = 2;
export const CLOUDINARY_CLOUD_NAME =
  process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "dhd61lan4";
export const CLOUDINARY_UPLOAD_PRESET =
  process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || "";
export const CLOUDINARY_UPLOAD_URL = `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload`;
export const CLOUDINARY_API_UPLOAD_URL =
  `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
export const CLOUDINARY_DELETE_BY_TOKEN_URL =
  `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/delete_by_token`;
export const CLOUDINARY_UPLOAD_TIMEOUT_MS = 30_000;
