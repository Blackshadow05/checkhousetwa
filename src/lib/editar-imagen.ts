const USUARIOS_EDITAR_IMAGEN = new Set([9]);

export function puedeEditarImagen(usuarioId: number | null | undefined) {
  return typeof usuarioId === "number" && USUARIOS_EDITAR_IMAGEN.has(usuarioId);
}
