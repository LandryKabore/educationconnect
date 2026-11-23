import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, EyeOff, Flag, MessagesSquare, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { PageBanner } from "@/components/PageBanner";
import { Button } from "@/components/ui";
import { ClassSpace } from "@/components/espace/ClassSpace";
import { cn } from "@/lib/utils";
import { relativeFr } from "@/lib/portalHomeFormat";
import { fetchSpaceReports, fetchSpaceSchoolClasses, moderate, type SpaceReport } from "@/lib/espaceClasse";

const square = "rounded-md border border-slate-200 bg-white dark:border-[var(--border)] dark:bg-[var(--surface)]";
const TARGET: Record<SpaceReport["targetType"], string> = { post: "Message", reply: "Réponse", group_message: "Message de groupe" };

/** Administration: the students' class spaces — reports to handle, and each class to read. */
export default function EspaceClasseEcole() {
  const { user, schoolId } = useAuth();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const classId = params.get("classe");
  const [open, setOpen] = useState(true);

  const { data: classes = [] } = useQuery({
    queryKey: ["espace-classe", "school", schoolId],
    enabled: !!schoolId,
    queryFn: () => fetchSpaceSchoolClasses(schoolId!),
  });
  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["espace-classe", "reports", schoolId, open],
    enabled: !!schoolId,
    queryFn: () => fetchSpaceReports(schoolId!, open),
    refetchInterval: 60_000,
  });

  const handle = async (r: SpaceReport, hide: boolean) => {
    try {
      await moderate(r.targetType, r.targetId, hide);
      toast.success(hide ? "Message masqué" : "Message gardé");
      void qc.invalidateQueries({ queryKey: ["espace-classe"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action impossible");
    }
  };

  if (classId) {
    const c = classes.find((x) => x.classId === classId);
    return (
      <div className="space-y-5">
        <button type="button" onClick={() => setParams({})} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700">
          <ArrowLeft className="h-4 w-4" /> Toutes les classes
        </button>
        <PageBanner title={`Espace classe · ${c?.name ?? "Classe"}`} subtitle="Lecture et modération : masquez un message déplacé, rétablissez-le si besoin." />
        <ClassSpace classId={classId} userId={user!.id} subjects={[]} compositions={[]} moderator />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageBanner
        title="Espace classe"
        subtitle="Les élèves du secondaire s’entraident par classe. Vous seuls lisez tout et modérez."
        stats={[
          { label: "Signalements ouverts", value: String(classes.reduce((n, c) => n + c.openReports, 0)) },
          { label: "Messages cette semaine", value: String(classes.reduce((n, c) => n + c.postsWeek, 0)) },
        ]}
      />

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-brand-700"><Flag className="h-4 w-4" /> Signalements</h2>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant={open ? "primary" : "outline"} className="rounded-md" onClick={() => setOpen(true)}>À traiter</Button>
            <Button size="sm" variant={!open ? "primary" : "outline"} className="rounded-md" onClick={() => setOpen(false)}>Tous</Button>
          </div>
        </div>
        {isLoading ? (
          <p className="text-sm text-slate-500">Chargement…</p>
        ) : reports.length === 0 ? (
          <div className={cn(square, "flex items-center gap-3 p-5 text-sm text-slate-600 dark:text-slate-300")}>
            <CheckCircle2 className="h-5 w-5 text-emerald-600" /> Aucun signalement {open ? "à traiter" : ""}.
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((r) => (
              <div key={`${r.targetType}-${r.targetId}`} className={cn(square, "p-4")}>
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                  <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-700">{r.count} signalement{r.count > 1 ? "s" : ""}</span>
                  <span className="text-slate-600 dark:text-slate-300">{TARGET[r.targetType]} · {r.className}</span>
                  {r.hidden ? <span className="inline-flex items-center gap-1 text-amber-700"><EyeOff className="h-3.5 w-3.5" /> Masqué</span> : null}
                  {r.handled ? <span className="text-emerald-700">Traité</span> : null}
                  <span className="ml-auto font-normal text-slate-400">{relativeFr(r.firstAt)}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100">{r.text ?? "(supprimé)"}</p>
                <p className="mt-1 text-xs text-slate-500">Écrit par {r.authorName ?? "—"}{r.reasons.length ? ` · Motifs : ${r.reasons.join(" ; ")}` : ""}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {!r.handled || !r.hidden ? (
                    <Button size="sm" variant="danger" className="rounded-md" onClick={() => void handle(r, true)}>
                      <EyeOff className="h-4 w-4" /> Masquer
                    </Button>
                  ) : null}
                  {!r.handled || r.hidden ? (
                    <Button size="sm" variant="outline" className="rounded-md" onClick={() => void handle(r, false)}>
                      <ShieldCheck className="h-4 w-4" /> {r.hidden ? "Rétablir" : "Garder"}
                    </Button>
                  ) : null}
                  {r.postId || r.groupId ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="rounded-md"
                      onClick={() => setParams(r.postId ? { classe: r.classId, sujet: r.postId } : { classe: r.classId, groupe: r.groupId! })}
                    >
                      Voir dans la classe
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-brand-700"><Users className="h-4 w-4" /> Classes du secondaire</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => (
            <button key={c.classId} type="button" onClick={() => setParams({ classe: c.classId })} className={cn(square, "p-4 text-left transition hover:border-brand-300")}>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 dark:text-slate-50">{c.name}</h3>
                {c.openReports ? <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-red-600"><Flag className="h-3.5 w-3.5" /> {c.openReports}</span> : null}
              </div>
              <p className="mt-2 flex items-center gap-4 text-sm text-slate-500">
                <span className="inline-flex items-center gap-1"><MessagesSquare className="h-4 w-4" /> {c.posts}</span>
                <span className="inline-flex items-center gap-1"><Users className="h-4 w-4" /> {c.groups} groupe{c.groups > 1 ? "s" : ""}</span>
                <span>{c.postsWeek} cette semaine</span>
              </p>
            </button>
          ))}
          {classes.length === 0 ? <p className="text-sm text-slate-500">Aucune classe du secondaire cette année.</p> : null}
        </div>
      </section>
    </div>
  );
}
