import {
  CLOUDINARY_API_UPLOAD_URL,
  CLOUDINARY_DELETE_BY_TOKEN_URL,
  CLOUDINARY_UPLOAD_PRESET,
  CLOUDINARY_UPLOAD_TIMEOUT_MS,
} from "@/lib/constants";
import {
  EVIDENCE_FIELDS,
  evidenceStoragePath,
  type EvidenceField,
} from "@/lib/revision-evidence";
import { revisionPhotoExtension } from "@/lib/revision-photo-format";
import type { RevisionPhoto } from "@/lib/revision-form";

export type CloudinaryUploadResult = {
  path: string;
  deleteToken: string | null;
};

type UploadState = {
  file: Blob;
  controller: AbortController;
  promise: Promise<CloudinaryUploadResult | null>;
};

const uploadStates = new Map<string, UploadState>();
let warnedMissingDeleteToken = false;

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError"
    || (error instanceof Error && error.name === "AbortError");
}

function uploadPreset() {
  if (!CLOUDINARY_UPLOAD_PRESET) {
    throw new Error("Falta el upload preset de Cloudinary. Revisa VITE_CLOUDINARY_UPLOAD_PRESET o NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET.");
  }
  return CLOUDINARY_UPLOAD_PRESET;
}

async function postImageToCloudinary(
  file: Blob,
  field: EvidenceField,
  signal: AbortSignal,
): Promise<CloudinaryUploadResult> {
  const { folderPath, publicId, path } = evidenceStoragePath(field);
  const extension = revisionPhotoExtension(file.type);
  const body = new FormData();
  body.append("file", file, `${publicId}.${extension}`);
  body.append("upload_preset", uploadPreset());
  body.append("folder", folderPath);
  body.append("public_id", publicId);
  const response = await fetch(CLOUDINARY_API_UPLOAD_URL, { method: "POST", body, signal });
  if (!response.ok) throw new Error(`cloudinary-${response.status}`);
  const payload = await response.json() as { delete_token?: unknown };
  const deleteToken = typeof payload.delete_token === "string" && payload.delete_token
    ? payload.delete_token
    : null;
  if (!deleteToken && !warnedMissingDeleteToken) {
    warnedMissingDeleteToken = true;
    console.warn("[Cloudinary] El upload preset no devolvió delete_token. Activa Return delete token para borrar fotos descartadas.");
  }
  return { path, deleteToken };
}

async function uploadOnce(file: Blob, field: EvidenceField, external?: AbortSignal) {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), CLOUDINARY_UPLOAD_TIMEOUT_MS);
  const onExternalAbort = () => timeout.abort();
  external?.addEventListener("abort", onExternalAbort);
  if (external?.aborted) timeout.abort();
  try {
    return await postImageToCloudinary(file, field, timeout.signal);
  } finally {
    clearTimeout(timer);
    external?.removeEventListener("abort", onExternalAbort);
  }
}

export async function uploadImageToCloudinary(
  file: Blob,
  field: EvidenceField,
  signal?: AbortSignal,
) {
  try {
    return await uploadOnce(file, field, signal);
  } catch (error) {
    if (signal?.aborted) throw error;
    return await uploadOnce(file, field, signal);
  }
}

export async function deleteUploadedImage(result: CloudinaryUploadResult | null | undefined) {
  if (!result?.deleteToken) return;
  try {
    const response = await fetch(CLOUDINARY_DELETE_BY_TOKEN_URL, {
      method: "POST",
      body: new URLSearchParams({ token: result.deleteToken }),
    });
    if (!response.ok) throw new Error(`cloudinary-delete-${response.status}`);
  } catch (error) {
    console.warn("[Cloudinary] No se pudo borrar la foto descartada:", error);
  }
}

export async function discardUpload(photoId: string) {
  const state = uploadStates.get(photoId);
  if (!state) return;
  uploadStates.delete(photoId);
  state.controller.abort();
  const result = await state.promise.catch(() => null);
  if (result) await deleteUploadedImage(result);
}

export function startBackgroundUpload(photoId: string, file: Blob, field: EvidenceField) {
  const existing = uploadStates.get(photoId);
  if (existing && existing.file === file) return;
  void discardUpload(photoId);
  const controller = new AbortController();
  const state: UploadState = { file, controller, promise: Promise.resolve(null) };
  state.promise = uploadImageToCloudinary(file, field, controller.signal).catch((error) => {
    if (!isAbortError(error)) {
      console.warn(`[Cloudinary] Subida en segundo plano falló para ${field}, se reintenta al guardar:`, error);
    }
    return null;
  });
  uploadStates.set(photoId, state);
}

export function ensureBackgroundUploads(photos: readonly RevisionPhoto[]) {
  for (const [index, photo] of photos.entries()) {
    const field = EVIDENCE_FIELDS[index];
    if (field) startBackgroundUpload(photo.id, photo.blob, field);
  }
}

export function releaseUploads(photoIds: readonly string[]) {
  for (const id of photoIds) uploadStates.delete(id);
}

export async function resolveEvidenciaUrls(photos: readonly RevisionPhoto[]) {
  const urls: string[] = [];
  await Promise.all(photos.map(async (photo, index) => {
    const field = EVIDENCE_FIELDS[index];
    if (!field) return;
    const file = photo.blob;
    const state = uploadStates.get(photo.id);
    if (state && state.file === file) {
      const result = await state.promise;
      if (result) {
        urls[index] = result.path;
        return;
      }
    }
    const result = await uploadImageToCloudinary(file, field);
    uploadStates.set(photo.id, { file, controller: new AbortController(), promise: Promise.resolve(result) });
    urls[index] = result.path;
  }));
  return urls;
}
