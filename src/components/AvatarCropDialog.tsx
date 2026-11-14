import { useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui";

/** Side of the square crop window, in CSS pixels. */
const VIEW = 288;
/** Side of the exported square image. */
const OUT = 768;
const MAX_ZOOM = 4;

type Props = {
  /** The picked image; null keeps the dialog closed. */
  file: File | null;
  onCancel: () => void;
  /** The cropped square, as a JPEG file ready for the usual upload. */
  onConfirm: (file: File) => void;
};

/**
 * Square crop before a profile photo is uploaded: drag to move, slider / wheel / buttons to zoom.
 * The circle shows how the photo will look in round avatars; the whole square is kept.
 */
export function AvatarCropDialog({ file, onCancel, onConfirm }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const drag = useRef<{ id: number; sx: number; sy: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setSrc(url);
    setNatural(null);
    setZoom(1);
    setFailed(false);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // scale at which the image just covers the square
  const base = natural ? Math.max(VIEW / natural.w, VIEW / natural.h) : 1;
  const scale = base * zoom;
  const dw = natural ? natural.w * scale : VIEW;
  const dh = natural ? natural.h * scale : VIEW;

  const clamp = (x: number, y: number, w = dw, h = dh) => ({
    x: Math.min(0, Math.max(VIEW - w, x)),
    y: Math.min(0, Math.max(VIEW - h, y)),
  });

  const setZoomAround = (next: number, cx = VIEW / 2, cy = VIEW / 2) => {
    if (!natural) return;
    const z = Math.min(MAX_ZOOM, Math.max(1, next));
    const ratio = z / zoom;
    const nw = natural.w * base * z;
    const nh = natural.h * base * z;
    setPos(clamp(cx - (cx - pos.x) * ratio, cy - (cy - pos.y) * ratio, nw, nh));
    setZoom(z);
  };

  const confirm = () => {
    const img = imgRef.current;
    if (!img || !natural || !file) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingQuality = "high";
    const side = VIEW / scale;
    ctx.drawImage(img, -pos.x / scale, -pos.y / scale, side, side, 0, 0, OUT, OUT);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const name = file.name.replace(/\.[^.]+$/, "") || "avatar";
        onConfirm(new File([blob], `${name}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92,
    );
  };

  return (
    <Modal open={!!file} title="Recadrer la photo" onClose={onCancel} className="max-w-sm rounded-lg">
      <div className="flex flex-col items-center">
        <div
          className="relative touch-none select-none overflow-hidden rounded-md bg-slate-900"
          style={{ width: VIEW, height: VIEW, cursor: natural ? "grab" : "default" }}
          onPointerDown={(e) => {
            if (!natural) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d || d.id !== e.pointerId) return;
            setPos(clamp(d.ox + e.clientX - d.sx, d.oy + e.clientY - d.sy));
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onWheel={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setZoomAround(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08), e.clientX - r.left, e.clientY - r.top);
          }}
        >
          {src ? (
            <img
              ref={imgRef}
              src={src}
              alt=""
              draggable={false}
              onLoad={(e) => {
                const w = e.currentTarget.naturalWidth;
                const h = e.currentTarget.naturalHeight;
                const b = Math.max(VIEW / w, VIEW / h);
                setNatural({ w, h });
                // start centered
                setPos({ x: (VIEW - w * b) / 2, y: (VIEW - h * b) / 2 });
              }}
              onError={() => setFailed(true)}
              className="pointer-events-none absolute left-0 top-0 max-w-none"
              style={{ width: dw, height: dh, transform: `translate(${pos.x}px, ${pos.y}px)` }}
            />
          ) : null}
          {/* round guide: what round avatars will show */}
          {natural ? (
            <div
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{ boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.45)", border: "2px solid rgba(255,255,255,0.85)" }}
            />
          ) : null}
          {failed ? (
            <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white">
              Impossible d’ouvrir cette image. Essaie une photo JPG ou PNG.
            </p>
          ) : null}
        </div>

        <div className="mt-4 flex w-full items-center gap-3" style={{ maxWidth: VIEW }}>
          <button
            type="button"
            aria-label="Dézoomer"
            onClick={() => setZoomAround(zoom - 0.25)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
          >
            <Minus className="h-4 w-4" />
          </button>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoomAround(Number(e.target.value))}
            aria-label="Zoom"
            className="flex-1 accent-brand-700"
          />
          <button
            type="button"
            aria-label="Zoomer"
            onClick={() => setZoomAround(zoom + 0.25)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">Fais glisser la photo pour la placer.</p>

        <div className="mt-5 flex w-full justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Annuler
          </Button>
          <Button type="button" onClick={confirm} disabled={!natural || failed}>
            Enregistrer
          </Button>
        </div>
      </div>
    </Modal>
  );
}
