"use server";

import { getArchiveRevisiones, getInicioRevisiones } from "@/lib/db/revisiones-casitas";
import type { ArchiveQuery } from "@/lib/revisiones-archive";
import { createClient } from "@/lib/supabase/server";
import { revisionInsert, validateRevisionForm, withCurrentRevisionTime, type RevisionFormValues } from "@/lib/revision-form";
import { isEvidenceCloudinaryPath } from "@/lib/revision-evidence";
import { saveRevision } from "@/lib/save-revision";

export async function fetchInicioRevisiones() {
  return getInicioRevisiones();
}

export async function fetchArchiveRevisiones(input: ArchiveQuery) {
  return getArchiveRevisiones(input);
}

export async function createRevision(input: { id: string; values: RevisionFormValues; photos: string[] }) {
  try {
    if (!input || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id) ||
      !input.values || Object.values(input.values).some((value) => typeof value !== "string") ||
      !Array.isArray(input.photos) || input.photos.length > 3) {
      return { row: null, error: "Revisa los datos del formulario e inténtalo de nuevo." };
    }
    const values = withCurrentRevisionTime(input.values);
    const errors = validateRevisionForm(values, undefined, input.photos.length);
    if (Object.keys(errors).length) return { row: null, error: "Hay campos pendientes. Revisa el formulario.", errors };
    if (input.photos.some((path) => typeof path !== "string" || !isEvidenceCloudinaryPath(path))) {
      return { row: null, error: "Una fotografía no se cargó correctamente. Vuelve a intentarlo." };
    }
    // Use the request's publishable client and session: the existing RLS policies
    // authorize this app's public insert flow. No privileged key or policy change.
    const client = await createClient();
    return await saveRevision(client, revisionInsert(input.id, values, input.photos));
  } catch {
    return { row: null, error: "No pudimos conectar para guardar. Tu borrador sigue disponible." };
  }
}
