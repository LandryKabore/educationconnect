import { useRef, useState } from "react";
import { Camera, Loader2, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { compressImage } from "@/lib/compressImage";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui";

type Props = {
  userId: string;
  avatarUrl: string | null | undefined;
  name?: string;
  /** Invalidate these query keys after upload */
  invalidateKeys?: unknown[][];
  editable?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  onChanged?: () => void;
};

const SIZE_CLASS = {
  sm: "h-10 w-10 text-sm",
  md: "h-16 w-16 text-lg",
  lg: "h-24 w-24 text-2xl",
} as const;

function initials(name?: string) {
  if (!name?.trim()) return "";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function ProfileAvatar({
  userId,
  avatarUrl,
  name,
  invalidateKeys = [],
  editable = false,
  size = "md",
  className,
  onChanged,
}: Props) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const displayUrl = preview || avatarUrl || null;
  const label = initials(name);

  const refresh = () => {
    for (const key of invalidateKeys) {
      void qc.invalidateQueries({ queryKey: key });
    }
    onChanged?.();
  };

  const onPick = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choisissez une image (JPG, PNG, etc.)");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      toast.error("Image trop lourde (max 12 Mo avant compression)");
      return;
    }

    setBusy(true);
    try {
      const { blob, contentType, extension } = await compressImage(file, {
        maxEdge: 512,
        quality: 0.72,
      });

      const path = `${userId}/avatar.${extension}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, blob, {
          upsert: true,
          contentType,
          cacheControl: "3600",
        });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = `${pub.publicUrl}?v=${Date.now()}`;

      const { error: updErr } = await supabase
        .from("profils")
        .update({ avatar_url: url })
        .eq("id", userId);
      if (updErr) throw updErr;

      setPreview(url);
      toast.success("Photo enregistrée");
      refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Upload de la photo impossible",
      );
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onRemove = async () => {
    setBusy(true);
    try {
      await supabase.storage.from("avatars").remove([
        `${userId}/avatar.jpg`,
        `${userId}/avatar.webp`,
      ]);
      const { error } = await supabase
        .from("profils")
        .update({ avatar_url: null })
        .eq("id", userId);
      if (error) throw error;
      setPreview(null);
      toast.success("Photo supprimée");
      refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Suppression impossible",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        className={cn(
          "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 text-slate-500",
          SIZE_CLASS[size],
        )}
      >
        {displayUrl ? (
          <img
            src={displayUrl}
            alt={name ? `Photo de ${name}` : "Photo de profil"}
            className="h-full w-full object-cover"
          />
        ) : label ? (
          <span className="font-semibold text-brand-800">{label}</span>
        ) : (
          <User className="h-1/2 w-1/2" />
        )}
        {busy ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Loader2 className="h-5 w-5 animate-spin text-white" />
          </div>
        ) : null}
      </div>

      {editable ? (
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/*"
            className="hidden"
            onChange={(e) => void onPick(e.target.files?.[0] ?? null)}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <Camera className="h-4 w-4" />
            {displayUrl ? "Changer la photo" : "Ajouter une photo"}
          </Button>
          {displayUrl ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void onRemove()}
            >
              <Trash2 className="h-4 w-4" />
              Retirer
            </Button>
          ) : null}
          <p className="w-full text-xs text-slate-400">
            Compressée automatiquement (~512 px, JPEG/WebP).
          </p>
        </div>
      ) : null}
    </div>
  );
}
