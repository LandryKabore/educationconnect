import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { BellRing, Plus, Rocket, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { PageBanner } from "@/components/PageBanner";
import { Modal } from "@/components/Modal";
import { Button, Input, Label, Select, Textarea } from "@/components/ui";
import { APP_VERSION } from "@/lib/appInfo";
import { compareVersions, PLATFORM_LABEL, type ReleasePlatform, type ReleaseRow } from "@/lib/releases";

const square = "rounded-md border border-slate-200 bg-white dark:border-[var(--border)] dark:bg-[var(--surface)]";
const PLATFORMS: ReleasePlatform[] = ["web", "ios", "android", "windows", "mac"];

/** Super admin: publish a version of the app; people are told and asked to update. */
export default function Versions() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["app-releases", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_releases").select("*").order("published_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ReleaseRow[];
    },
  });
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<ReleasePlatform>("web");
  const [version, setVersion] = useState("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [url, setUrl] = useState("");
  const [minVersion, setMinVersion] = useState("");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);

  const latest = (p: ReleasePlatform) =>
    rows.filter((r) => r.platform === p).sort((a, b) => compareVersions(b.version, a.version))[0];

  const start = (p: ReleasePlatform) => {
    setPlatform(p);
    setVersion(p === "web" ? APP_VERSION : "");
    setTitle("");
    setNotes("");
    setUrl("");
    setMinVersion("");
    setNotify(p === "web" || p === "ios");
    setOpen(true);
  };

  const publish = async () => {
    if (!/^\d+(\.\d+){0,3}$/.test(version.trim())) return toast.error("Numéro de version : par exemple 1.3.0");
    if (!title.trim()) return toast.error("Donnez un titre (ce que les gens verront).");
    const prev = latest(platform);
    if (prev && compareVersions(version.trim(), prev.version) <= 0) return toast.error(`La dernière version ${PLATFORM_LABEL[platform]} est déjà la ${prev.version}.`);
    setBusy(true);
    const { error } = await supabase.from("app_releases").insert({
      platform,
      version: version.trim(),
      title: title.trim(),
      notes: notes.trim(),
      download_url: url.trim() || null,
      min_version: minVersion.trim() || null,
      notify,
      published_by: user?.id ?? null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(notify ? "Version publiée — notification envoyée" : "Version publiée");
    setOpen(false);
    void qc.invalidateQueries({ queryKey: ["app-releases"] });
  };

  const remove = async (r: ReleaseRow) => {
    if (!window.confirm(`Retirer la version ${PLATFORM_LABEL[r.platform]} ${r.version} ?`)) return;
    const { error } = await supabase.from("app_releases").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    void qc.invalidateQueries({ queryKey: ["app-releases"] });
  };

  return (
    <div className="space-y-6">
      <PageBanner
        title="Versions de l’application"
        subtitle="Publiez une nouvelle version : les utilisateurs voient les nouveautés et sont invités à mettre à jour."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {PLATFORMS.map((p) => {
          const r = latest(p);
          return (
            <div key={p} className={`${square} p-4`}>
              <p className="text-xs font-bold uppercase tracking-wide text-brand-700">{PLATFORM_LABEL[p]}</p>
              <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-50">{r?.version ?? "—"}</p>
              <p className="mt-1 line-clamp-2 text-xs text-slate-500">{r?.title ?? "Aucune version publiée"}</p>
              {r?.min_version ? <p className="mt-1 text-xs font-semibold text-amber-700">Minimum : {r.min_version}</p> : null}
              <Button size="sm" variant="outline" className="mt-3 w-full rounded-md" onClick={() => start(p)}>
                <Plus className="h-4 w-4" /> Nouvelle version
              </Button>
            </div>
          );
        })}
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-brand-700">Historique</h2>
        {isLoading ? (
          <p className="text-sm text-slate-500">Chargement…</p>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.id} className={`${square} p-4`}>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="rounded bg-brand-50 px-1.5 py-0.5 text-xs font-bold text-brand-800">{PLATFORM_LABEL[r.platform]} {r.version}</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-50">{r.title}</span>
                  {r.notify ? <BellRing className="h-4 w-4 text-brand-600" aria-label="Notification envoyée" /> : null}
                  {r.min_version ? <span className="text-xs font-semibold text-amber-700">obligatoire sous {r.min_version}</span> : null}
                  <span className="ml-auto text-xs text-slate-400">{format(new Date(r.published_at), "d MMMM yyyy HH:mm", { locale: fr })}</span>
                  <button type="button" onClick={() => void remove(r)} className="text-slate-400 hover:text-red-600" aria-label="Retirer">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {r.notes ? <p className="mt-2 whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">{r.notes}</p> : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <Modal open={open} title={`Nouvelle version · ${PLATFORM_LABEL[platform]}`} onClose={() => setOpen(false)} size="lg">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="v-platform">Plateforme</Label>
              <Select id="v-platform" value={platform} onChange={(e) => setPlatform(e.target.value as ReleasePlatform)}>
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="v-version">Numéro de version</Label>
              <Input id="v-version" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.3.0" />
              {latest(platform) ? <p className="mt-1 text-xs text-slate-500">Actuelle : {latest(platform)!.version}</p> : null}
            </div>
          </div>
          <div>
            <Label htmlFor="v-title">Titre</Label>
            <Input id="v-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Ex. : Espace classe et notifications" />
          </div>
          <div>
            <Label htmlFor="v-notes">Nouveautés (une par ligne)</Label>
            <Textarea id="v-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={6} maxLength={4000} />
          </div>
          {platform !== "web" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="v-url">Lien de téléchargement</Label>
                <Input id="v-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={platform === "ios" ? "Lien App Store ou TestFlight" : "https://…"} />
              </div>
              <div>
                <Label htmlFor="v-min">Version minimum (facultatif)</Label>
                <Input id="v-min" value={minVersion} onChange={(e) => setMinVersion(e.target.value)} placeholder="Ex. : 1.1" />
                <p className="mt-1 text-xs text-slate-500">En dessous, la mise à jour est obligatoire.</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Sur le web, le site est déjà à jour : les onglets ouverts affichent « Nouvelle version — Recharger », puis les nouveautés.</p>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="accent-brand-700" />
            Envoyer une notification à tous les utilisateurs de l’application iPhone
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" className="rounded-md" onClick={() => setOpen(false)}>Annuler</Button>
            <Button className="rounded-md" onClick={() => void publish()} disabled={busy}>
              <Rocket className="h-4 w-4" /> Publier
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
