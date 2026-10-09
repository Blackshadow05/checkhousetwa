"use server";

import { getArchiveRevisiones, getInicioRevisiones, getLatestRevisionCasita, getRevisionInicioById, listRevisionEdits, listRevisionNotes } from "@/lib/db/revisiones-casitas";
import type { ArchiveQuery } from "@/lib/revisiones-archive";
import { createPrivateClient, createPrivateSession } from "@/lib/auth/session";
import { costaRicaDateTime, pendienteInsert, revisionInsert, validatePendienteForm, validateRevisionForm, withCurrentRevisionTime, type RevisionFormValues } from "@/lib/revision-form";
import { isEvidenceCloudinaryPath } from "@/lib/revision-evidence";
import { isRevisionEditField, persistRevisionFieldValue, validateRevisionField, mapRegistroEdicion, type RevisionEditField, type RevisionEditHistoryItem } from "@/lib/revision-edit";
import { mapNotaRevision, noteRevisionPage, NOTAS_REVISION_PAGE_SIZE, persistNotaRevision, persistNotaRevisionImage, validateNotaRevision, validateNotaRevisionImage, type RevisionNoteItem } from "@/lib/revision-notes";
import { saveRevision, saveNotaRevision, editRevisionCampo, type SaveNoteResult } from "@/lib/save-revision";
import { getSesionUsuario } from "@/lib/auth/session";
import { mapInicioRevision } from "@/lib/revisiones-map";
import type { InicioRevisionRow, RevisionCasitaInicio } from "@/types/database";
import { INVENTARIO_COLUMNS, mapInventarioCasita } from "@/lib/inventario-casitas";
import { parseRevisionRecognition, registroReconocimiento, type RegistroReconocimiento, type RevisionRecognitionInput } from "@/lib/revision-recognition-log";

export async function fetchInicioRevisiones() {
  return getInicioRevisiones();
}

export async function fetchCanalRevisiones(): Promise<string | null> {
  try {
    const client = await createPrivateClient();
    const { data, error } = await client.rpc("topic_revisiones_casitas");
    return error || typeof data !== "string" ? null : data;
  } catch {
    return null;
  }
}

export async function fetchArchiveRevisiones(input: ArchiveQuery) {
  return getArchiveRevisiones(input);
}

export async function createRevision(input: { id: string; values: RevisionFormValues; photos: string[]; reconocimiento?: RevisionRecognitionInput | null; pendiente?: boolean; completa?: string | null }) {
  try {
    if (!input || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id) ||
      !input.values || Object.values(input.values).some((value) => typeof value !== "string") ||
      !Array.isArray(input.photos) || input.photos.length > 3 ||
      (input.completa != null && (typeof input.completa !== "string" || !REVISION_ID.test(input.completa)))) {
      return { row: null, error: "Revisa los datos del formulario e inténtalo de nuevo." };
    }
    const values = withCurrentRevisionTime(input.values);
    if (input.pendiente === true) {
      if (input.photos.length || input.reconocimiento != null || input.completa != null) {
        return { row: null, error: "Revisa los datos del formulario e inténtalo de nuevo." };
      }
      const errors = validatePendienteForm(values);
      if (Object.keys(errors).length) return { row: null, error: "Selecciona la casita y quién revisa.", errors };
      return await saveRevision(await createPrivateClient(), pendienteInsert(input.id, values));
    }
    const errors = validateRevisionForm(values, undefined, input.photos.length);
    if (Object.keys(errors).length) return { row: null, error: "Hay campos pendientes. Revisa el formulario.", errors };
    if (input.photos.some((path) => typeof path !== "string" || !isEvidenceCloudinaryPath(path))) {
      return { row: null, error: "Una fotografía no se cargó correctamente. Vuelve a intentarlo." };
    }
    const recognition = input.reconocimiento == null ? null : parseRevisionRecognition(input.reconocimiento);
    if (input.reconocimiento != null && (!recognition || !input.photos.length)) {
      return { row: null, error: "No pudimos validar el escaneo. Vuelve a escanear las fotos antes de guardar." };
    }
    // Use the request's publishable client and session: the existing RLS policies
    // authorize this app's public insert flow. No privileged key or policy change.
    const client = await createPrivateClient();
    let registro: RegistroReconocimiento | null = null;
    if (recognition) {
      const inventory = await client.from("inventario_casitas").select(INVENTARIO_COLUMNS).eq("casita", Number(values.casita)).maybeSingle();
      if (inventory.error) return { row: null, error: "No pudimos comprobar el reconocimiento. Conservamos el borrador; vuelve a intentarlo." };
      registro = registroReconocimiento(values, recognition, inventory.data ? mapInventarioCasita(inventory.data) : null);
    }
    return await saveRevision(client, revisionInsert(input.id, values, input.photos, registro), input.completa ?? null);
  } catch {
    return { row: null, error: "No pudimos conectar para guardar. Tu borrador sigue disponible." };
  }
}

const REVISION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function fetchRevisionEdits(id: string): Promise<{
  rows: RevisionEditHistoryItem[];
  error: string | null;
}> {
  try {
    if (!REVISION_ID.test(id)) return { rows: [], error: "No encontramos esta revisión." };
    const client = await createPrivateClient();
    const result = await listRevisionEdits(client, id);
    if (result.error) return { rows: [], error: "No pudimos cargar el historial. Conservamos lo ya visto." };
    return { rows: (result.data ?? []).map(mapRegistroEdicion), error: null };
  } catch {
    return { rows: [], error: "No pudimos conectar para cargar el historial." };
  }
}

export async function fetchRevisionNotes(id: string, offset = 0): Promise<{
  rows: RevisionNoteItem[];
  hasMore: boolean;
  error: string | null;
}> {
  try {
    if (!REVISION_ID.test(id)) {
      return { rows: [], hasMore: false, error: "No encontramos esta revisión." };
    }
    const start = Math.max(0, Math.min(Math.trunc(offset) || 0, 100_000));
    const client = await createPrivateClient();
    const result = await listRevisionNotes(
      client,
      id,
      start,
      NOTAS_REVISION_PAGE_SIZE + 1,
    );
    if (result.error) {
      return {
        rows: [],
        hasMore: false,
        error: "No pudimos cargar las notas. Conservamos lo ya visto.",
      };
    }
    const page = noteRevisionPage(result.data ?? []);
    return {
      rows: page.rows.map(mapNotaRevision),
      hasMore: page.hasMore,
      error: null,
    };
  } catch {
    return {
      rows: [],
      hasMore: false,
      error: "No pudimos conectar para cargar las notas.",
    };
  }
}

export async function createRevisionNote(input: {
  id: string;
  revisionId: string;
  nota: string;
  imagen: string | null;
}): Promise<SaveNoteResult> {
  try {
    if (
      !input ||
      !REVISION_ID.test(input.id) ||
      !REVISION_ID.test(input.revisionId) ||
      typeof input.nota !== "string" ||
      (input.imagen !== null && typeof input.imagen !== "string")
    ) {
      return { row: null, error: "Revisa los datos e inténtalo de nuevo.", ambiguous: false };
    }
    const notaError = validateNotaRevision(input.nota);
    if (notaError) return { row: null, error: notaError, ambiguous: false };
    const imagenError = validateNotaRevisionImage(input.imagen);
    if (imagenError) return { row: null, error: imagenError, ambiguous: false };
    const autor = await getSesionUsuario();
    if (!autor) return { row: null, error: "Inicia sesión para agregar una nota.", ambiguous: false };
    const client = await createPrivateClient();
    return await saveNotaRevision(client, {
      id: input.id,
      revision_id: input.revisionId,
      nota: persistNotaRevision(input.nota),
      usuario: autor.nombre,
      imagen: persistNotaRevisionImage(input.imagen),
      hora: costaRicaDateTime(),
    });
  } catch {
    return {
      row: null,
      error: "No pudimos confirmar la nota. Conservamos tu texto y tu foto; reintenta.",
      ambiguous: true,
    };
  }
}

export async function fetchLatestRevisionCasita(
  casita: string,
): Promise<{ row: InicioRevisionRow | null; error: string | null }> {
  try {
    if (!/^\d{1,4}$/.test(casita)) {
      return { row: null, error: "No encontramos esta casita." };
    }
    const client = await createPrivateClient();
    const result = await getLatestRevisionCasita(client, casita);
    if (result.error) {
      return { row: null, error: "No pudimos cargar la última revisión. Vuelve a intentarlo." };
    }
    if (!result.data) return { row: null, error: null };
    return { row: mapInicioRevision(result.data), error: null };
  } catch {
    return { row: null, error: "No pudimos conectar para abrir la revisión." };
  }
}

export async function fetchRevisionEditor(id: string): Promise<{
  row: RevisionCasitaInicio | null;
  user: { id: number; nombre: string } | null;
  error: string | null;
}> {
  try {
    if (!REVISION_ID.test(id)) return { row: null, user: null, error: "No encontramos esta revisión." };
    const session = await createPrivateSession();
    if (!session) return { row: null, user: null, error: null };
    const user = { id: session.usuario.id, nombre: session.usuario.nombre };
    const result = await getRevisionInicioById(session.client, id);
    if (result.error) return { row: null, user, error: "No pudimos cargar la revisión. Vuelve a intentarlo." };
    if (!result.data) return { row: null, user, error: "No encontramos esta revisión." };
    return { row: result.data, user, error: null };
  } catch {
    return { row: null, user: null, error: "No pudimos conectar para abrir el editor." };
  }
}

export async function editRevisionField(input: {
  id: string;
  campo: string;
  esperado: string | null;
  nuevo: string | null;
}): Promise<{ row: InicioRevisionRow | null; error: string | null; needsLogin?: boolean }> {
  try {
    if (!input || !REVISION_ID.test(input.id) || !isRevisionEditField(input.campo) ||
      (input.esperado !== null && typeof input.esperado !== "string") ||
      (input.nuevo !== null && typeof input.nuevo !== "string")) {
      return { row: null, error: "Revisa los datos e inténtalo de nuevo." };
    }
    const session = await createPrivateSession();
    if (!session) return { row: null, error: "Inicia sesión para guardar este cambio.", needsLogin: true };
    const campo: RevisionEditField = input.campo;
    const fieldError = validateRevisionField(campo, input.nuevo);
    if (fieldError) return { row: null, error: fieldError };
    return await editRevisionCampo(session.client, {
      id: input.id,
      campo,
      esperado: input.esperado,
      nuevo: persistRevisionFieldValue(campo, input.nuevo),
    }, session.usuario.id);
  } catch {
    return { row: null, error: "No pudimos conectar para guardar el cambio." };
  }
}
