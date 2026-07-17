/** Client-side image compression for avatars (canvas JPEG/WebP). */

export type CompressImageOptions = {
  /** Longest side in px */
  maxEdge?: number;
  /** JPEG/WebP quality 0–1 */
  quality?: number;
  /** Prefer WebP when the browser supports it */
  preferWebp?: boolean;
};

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image illisible"));
    };
    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error("Compression impossible"));
        else resolve(blob);
      },
      type,
      quality,
    );
  });
}

/**
 * Resize + compress an image for profile photos.
 * Typical output: ~512px max edge, JPEG/WebP under ~100–150 KB.
 */
export async function compressImage(
  file: File,
  options: CompressImageOptions = {},
): Promise<{ blob: Blob; contentType: string; extension: "jpg" | "webp" }> {
  const maxEdge = options.maxEdge ?? 512;
  const quality = options.quality ?? 0.72;
  const preferWebp = options.preferWebp ?? true;

  const img = await loadImage(file);
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const supportsWebp =
    preferWebp &&
    canvas.toDataURL("image/webp").startsWith("data:image/webp");

  let type = supportsWebp ? "image/webp" : "image/jpeg";
  let extension: "jpg" | "webp" = supportsWebp ? "webp" : "jpg";
  let blob = await canvasToBlob(canvas, type, quality);

  // If still large, step quality down
  let q = quality;
  while (blob.size > 180_000 && q > 0.45) {
    q -= 0.08;
    blob = await canvasToBlob(canvas, type, q);
  }

  // Fallback to JPEG if WebP somehow huge
  if (blob.size > 220_000 && type === "image/webp") {
    type = "image/jpeg";
    extension = "jpg";
    blob = await canvasToBlob(canvas, type, 0.68);
  }

  return { blob, contentType: type, extension };
}
