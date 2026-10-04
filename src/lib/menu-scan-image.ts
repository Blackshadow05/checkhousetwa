import { revisionPhotoDimensions } from "@/lib/revision-photo-format";

const MENU_IMAGE_MAX_SIDE = 1800;
const MENU_IMAGE_QUALITY = 0.82;

export async function prepararImagenMenu(file: File): Promise<Blob> {
  const source = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = source;
    await image.decode();
    const { width, height } = revisionPhotoDimensions(image.naturalWidth, image.naturalHeight, MENU_IMAGE_MAX_SIDE);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("menu-canvas");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", MENU_IMAGE_QUALITY));
    if (!blob || blob.type !== "image/jpeg") throw new Error("menu-encode");
    return blob;
  } finally {
    URL.revokeObjectURL(source);
  }
}
