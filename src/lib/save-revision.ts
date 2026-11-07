import type { SupabaseClient } from "@supabase/supabase-js";
import { NOTAS_REVISIONES_TABLE, REGISTRO_EDICIONES_TABLE, REVISIONES_TABLE } from "@/lib/constants";
import { EVIDENCE_FIELDS } from "@/lib/revision-evidence";
import {
  compactEvidenceSlots,
  evidencePathsFromSlots,
  evidenceSlotsFromRow,
  revisionEvidenceEditDecision,
  validateEvidencePaths,
  validateRevisionEvidencePhotos,
  type EvidenceSlots,
} from "@/lib/revision-evidence-edit";
import { formatRevisionAuditLine, isRevisionEditField, type RevisionEditField } from "@/lib/revision-edit";
import { mapNotaRevision, sameNotaRevisionPayload, type RevisionNoteItem } from "@/lib/revision-notes";
import { INICIO_REVISION_COLUMNS } from "@/lib/revisiones-display";
import { mapInicioRevision } from "@/lib/revisiones-map";
import type { Database, InicioRevisionRow, Json, NotaRevisionCasitaInsert, RevisionCasitaInsert } from "@/types/database";

type Client = SupabaseClient<Database>;
type SaveResult = { row: InicioRevisionRow | null; error: string | null };
export type SaveNoteResult = {
  row: RevisionNoteItem | null;
  error: string | null;
  conflict?: boolean;
  ambiguous?: boolean;
};

const NOTA_REVISION_COLUMNS = "id, revision_id, nota, usuario, imagen, hora, created_at";

export async function saveRevision(client: Client, row: RevisionCasitaInsert, completa: string | null = null): Promise<SaveResult> {
  const result = await client.rpc("guardar_revision_casita", { p_revision: row as Json, p_completa: completa });
  if (!result.error && result.data) return { row: mapInicioRevision(result.data), error: null };
  if (result.error?.code === "P0001" && /revision_ya_completada/i.test(result.error.message)) {
    return { row: null, error: "Otra persona ya completó esta revisión. Puedes descartar este intento." };
  }
  return { row: null, error: "No pudimos confirmar el guardado. Conservamos tu borrador; vuelve a intentarlo." };
}

export async function saveNotaRevision(
  client: Client,
  row: NotaRevisionCasitaInsert,
): Promise<SaveNoteResult> {
  if (!row.id) {
    return {
      row: null,
      error: "No pudimos identificar este intento de nota. Vuelve a intentarlo.",
      ambiguous: false,
    };
  }
  const payload = {
    revision_id: row.revision_id,
    nota: row.nota,
    imagen: row.imagen ?? null,
    usuario: row.usuario ?? null,
  };
  const result = await client
    .from(NOTAS_REVISIONES_TABLE)
    .insert(row)
    .select(NOTA_REVISION_COLUMNS)
    .single();
  if (!result.error) return { row: mapNotaRevision(result.data), error: null };

  const lookup = await client
    .from(NOTAS_REVISIONES_TABLE)
    .select(NOTA_REVISION_COLUMNS)
    .eq("id", row.id)
    .maybeSingle();

  if (!lookup.error && lookup.data) {
    if (sameNotaRevisionPayload(lookup.data, payload)) {
      return { row: mapNotaRevision(lookup.data), error: null };
    }
    return {
      row: null,
      error: "Esa nota ya se guardó con otro contenido. Vuelve a intentarlo con un intento nuevo.",
      conflict: true,
      ambiguous: false,
    };
  }

  if (lookup.error) {
    return {
      row: null,
      error: "No pudimos confirmar la nota. Conservamos tu texto y tu foto para reintentar.",
      ambiguous: true,
    };
  }

  return {
    row: null,
    error: result.error.code === "42501"
      ? "No hay permisos para guardar esta nota."
      : "No pudimos confirmar la nota. Conservamos tu texto para reintentar.",
    ambiguous: false,
  };
}

export async function editRevisionCampo(
  client: Client,
  input: { id: string; campo: RevisionEditField; esperado: string | null; nuevo: string | null },
  editorId: number,
): Promise<SaveResult> {
  if (!isRevisionEditField(input.campo) || !Number.isInteger(editorId)) {
    return { row: null, error: "Este dato no se puede editar." };
  }
  // Registro_ediciones es un log de aplicación. El RLS actual sigue abierto; no es un rastro a prueba de manipulación.
  const result = await client.rpc("editar_campo_revision_casita", {
    p_id: input.id,
    p_editor_id: editorId,
    p_campo: input.campo,
    p_esperado: input.esperado,
    p_nuevo: input.nuevo,
  });
  if (result.error) {
    if (result.error.code === "PGRST202" || result.error.code === "42883") {
      return { row: null, error: "Falta aplicar la función SQL en Supabase. No se guardó el cambio." };
    }
    if (result.error.code === "P0001" || /dato_esperado_desactualizado/i.test(result.error.message)) {
      return { row: null, error: "Este dato cambió. Cierra y vuelve a editarlo." };
    }
    if (result.error.code === "P0002") {
      return { row: null, error: "No encontramos esta revisión." };
    }
    if (result.error.code === "42501" || /editor_no_autorizado/i.test(result.error.message)) {
      return { row: null, error: "Inicia sesión para guardar este cambio." };
    }
    if (result.error.code === "22023" || /valor_invalido|campo_no_editable/i.test(result.error.message)) {
      return { row: null, error: "Revisa el valor e inténtalo de nuevo." };
    }
    return { row: null, error: "No pudimos confirmar el cambio. Conservamos el valor anterior." };
  }
  if (!result.data) return { row: null, error: "No pudimos confirmar el cambio. Conservamos el valor anterior." };
  return { row: mapInicioRevision(result.data), error: null };
}

function costaRicaAuditTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Costa_Rica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}:${part("second")}`;
}

async function recordEvidenceEdits(
  client: Client,
  editor: string,
  row: { id: string; casita: string | null },
  previous: EvidenceSlots,
  next: EvidenceSlots,
) {
  const entries = EVIDENCE_FIELDS.flatMap((field) => {
    if (previous[field] === next[field]) return [];
    return [{
      created_at: costaRicaAuditTimestamp(),
      "Usuario que Edito": editor,
      Dato_anterior: formatRevisionAuditLine(row.id, row.casita, field, previous[field]),
      Dato_nuevo: formatRevisionAuditLine(row.id, row.casita, field, next[field]),
    }];
  });
  if (!entries.length) return;
  const result = await client.from(REGISTRO_EDICIONES_TABLE).insert(entries);
  if (result.error) {
    console.warn("[revisiones] No se pudo registrar el historial de evidencias:", result.error.message);
  }
}

export async function editRevisionEvidencias(
  client: Client,
  input: { id: string; esperado: EvidenceSlots; fotos: string[]; editor: string },
): Promise<SaveResult> {
  // evidencias no están en editar_campo_revision_casita. Solo se escriben estas
  // tres columnas ya existentes; el resto de la fila no se toca.
  if (!Array.isArray(input.fotos)) {
    return { row: null, error: "Revisa los datos e inténtalo de nuevo." };
  }
  const pathError = validateEvidencePaths(input.fotos);
  if (pathError) return { row: null, error: pathError };
  const next = compactEvidenceSlots(input.fotos);

  const actual = await client
    .from(REVISIONES_TABLE)
    .select(INICIO_REVISION_COLUMNS)
    .eq("id", input.id)
    .maybeSingle();
  if (actual.error) return { row: null, error: "No pudimos comprobar la revisión. Vuelve a intentarlo." };
  if (!actual.data) return { row: null, error: "No encontramos esta revisión." };

  const current = evidenceSlotsFromRow(actual.data);
  const expected = evidenceSlotsFromRow(input.esperado);
  const countError = validateRevisionEvidencePhotos(actual.data.caja_fuerte, evidencePathsFromSlots(next));
  if (countError) return { row: null, error: countError };

  const decision = revisionEvidenceEditDecision(current, expected, next);
  if (decision === "noop") return { row: mapInicioRevision(actual.data), error: null };
  if (decision === "stale") return { row: null, error: "Las fotos cambiaron. Cierra y vuelve a editarlas." };

  const payload = {
    evidencia_01: next.evidencia_01,
    evidencia_02: next.evidencia_02,
    evidencia_03: next.evidencia_03,
  };
  let query = client.from(REVISIONES_TABLE).update(payload).eq("id", input.id);
  for (const field of EVIDENCE_FIELDS) {
    const raw = actual.data[field];
    query = raw == null ? query.is(field, null) : query.eq(field, raw);
  }
  const result = await query.select(INICIO_REVISION_COLUMNS).maybeSingle();
  if (result.error) {
    return { row: null, error: "No pudimos confirmar el cambio. Conservamos las fotos anteriores." };
  }
  if (!result.data) return { row: null, error: "Las fotos cambiaron. Cierra y vuelve a editarlas." };

  await recordEvidenceEdits(client, input.editor, result.data, current, next);
  return { row: mapInicioRevision(result.data), error: null };
}
