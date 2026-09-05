import { MAX_PHOTO_BYTES, type RevisionPhoto } from "@/lib/revision-form";
import { createUuid } from "@/lib/uuid";
import { revisionPhotoDimensions, revisionPhotoEncoding } from "@/lib/revision-photo-format";

export async function prepareRevisionPhoto(file: File): Promise<RevisionPhoto> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type))
    throw new Error("Elige una foto JPG, PNG, WebP o una foto de tu cámara.");
  if (file.size > 20 * 1024 * 1024)
    throw new Error("Esta foto es muy grande. Elige una de menos de 20 MB.");
  const source = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = source;
    await image.decode();
    const dimensions = revisionPhotoDimensions(image.naturalWidth, image.naturalHeight);
    const encoding = revisionPhotoEncoding(navigator.userAgent);
    const canvas = document.createElement("canvas");
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("photo-canvas");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error("photo-conversion")), encoding.type, encoding.quality);
    });
    // Unsupported encoders can silently produce PNG; never mislabel those bytes.
    if (blob.type !== encoding.type) throw new Error("photo-format");
    if (blob.size > MAX_PHOTO_BYTES) throw new Error("photo-size");
    return { id: createUuid(), name: file.name, blob };
  } catch {
    throw new Error("No pudimos preparar esta foto. Prueba con una imagen JPG o PNG.");
  } finally {
    URL.revokeObjectURL(source);
  }
}
