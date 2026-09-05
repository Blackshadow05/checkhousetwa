import { CLOUDINARY_UPLOAD_URL } from "@/lib/constants";

const IMAGE_EXTENSION = /\.(jpe?g|png|webp|gif|avif|bmp)$/i;

function isTransformSegment(part: string) {
  if (!part || IMAGE_EXTENSION.test(part)) return false;
  if (part.includes(",")) return true;
  if (/^v\d+$/.test(part)) return true;
  return /^[a-z]{1,4}_/i.test(part);
}

function encodePublicId(path: string) {
  return path
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      try {
        return encodeURIComponent(decodeURIComponent(segment));
      } catch {
        return encodeURIComponent(segment);
      }
    })
    .join("/");
}

function ensureExtension(path: string) {
  const clean = path.split("?")[0] ?? path;
  return IMAGE_EXTENSION.test(clean) ? path : `${path}.jpg`;
}

function stripTransforms(url: string) {
  const marker = "/image/upload/";
  const index = url.indexOf(marker);
  if (index === -1) return url;
  const prefix = url.slice(0, index + marker.length);
  const rest = url.slice(index + marker.length);
  return prefix + rest.split("/").filter((part) => !isTransformSegment(part)).join("/");
}

function applyTransforms(url: string, transforms: string) {
  if (!transforms) return url;
  const marker = "/image/upload/";
  const index = url.indexOf(marker);
  if (index === -1) return url;
  return `${url.slice(0, index + marker.length)}${transforms}/${url.slice(index + marker.length)}`;
}

export function cloudinaryUrl(
  path: string,
  transforms = "w_1200,c_limit,q_auto,f_auto",
) {
  if (!path.trim()) return "";
  const source = path.startsWith("http")
    ? path
    : `${CLOUDINARY_UPLOAD_URL}/${ensureExtension(encodePublicId(path))}`;
  return applyTransforms(stripTransforms(source), transforms);
}

export function cloudinaryPreviewUrl(path: string) {
  return cloudinaryUrl(path, "w_1200,c_limit,q_auto,f_auto");
}

export function cloudinaryViewerUrl(path: string) {
  return cloudinaryUrl(path, "w_1800,c_limit,q_auto:best,f_auto");
}
