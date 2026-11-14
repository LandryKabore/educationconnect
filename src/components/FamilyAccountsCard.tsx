import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { GraduationCap, Users } from "lucide-react";
import { toast } from "sonner";
import { FAMILY_LEVELS, fetchFamilyOverview, setFamilyAccountsLevel } from "@/lib/scaleApi";
import { Badge, Button, Card, Label, Select } from "@/components/ui";

/** School setting: "own login from level X, family account below". Below the level the parent is the only login. */
export function FamilyAccountsCard({ schoolId }: { schoolId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["family-overview", schoolId],
    queryFn: () => fetchFamilyOverview(schoolId),
  });
  const [level, setLevel] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) setLevel(data.level ?? "");
  }, [data]);

  const dirty = data ? (data.level ?? "") !== level : false;

  const save = async () => {
    setSaving(true);
    try {
      await setFamilyAccountsLevel(schoolId, level || null);
      toast.success(level ? "Comptes famille activés pour les petites classes" : "Comptes famille désactivés");
      void qc.invalidateQueries({ queryKey: ["family-overview", schoolId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  };

  const label = FAMILY_LEVELS.find((l) => l.value === data?.level)?.label;

  return (
    <Card>
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
          <Users className="h-4 w-4" />
        </span>
        <h3 className="min-w-0 flex-1 font-bold text-slate-900 dark:text-slate-50">Comptes des élèves du primaire</h3>
        {data ? <Badge tone={data.level ? "info" : "default"}>{data.level ? "Actif" : "Inactif"}</Badge> : null}
      </div>
      <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
        Les plus petits n’ont pas de téléphone : choisissez à partir de quel niveau l’élève a son propre compte.
      </p>
      {/* what the setting does, on each side of the chosen level */}
      <ul className="mt-3 space-y-2 text-sm">
        <li className="flex items-start gap-3 rounded-md bg-slate-50 p-3 dark:bg-[var(--surface-2)]">
          <Users className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
          <span>
            <span className="block font-semibold text-slate-900 dark:text-slate-100">En dessous du niveau choisi</span>
            <span className="text-slate-600 dark:text-slate-300">
              Pas de connexion élève : le parent suit son enfant (notes, présences, emploi du temps, cahier de textes).
            </span>
          </span>
        </li>
        <li className="flex items-start gap-3 rounded-md bg-slate-50 p-3 dark:bg-[var(--surface-2)]">
          <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
          <span>
            <span className="block font-semibold text-slate-900 dark:text-slate-100">À partir du niveau choisi</span>
            <span className="text-slate-600 dark:text-slate-300">L’élève a son propre compte.</span>
          </span>
        </li>
      </ul>
      {isLoading || !data ? (
        <p className="mt-3 text-sm text-slate-500">Chargement…</p>
      ) : (
        <>
          <div className="mt-4 space-y-3">
            <div>
              <Label htmlFor="famille-niveau">L'élève a son propre compte à partir de</Label>
              <Select id="famille-niveau" value={level} onChange={(e) => setLevel(e.target.value)}>
                <option value="">Tous les élèves ont leur compte (réglage actuel)</option>
                {FAMILY_LEVELS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </Select>
            </div>
            <Button className="w-full" disabled={!dirty || saving} onClick={() => void save()}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>

          {data.level ? (
            <div className="mt-4 space-y-2 text-sm">
              <p>
                Compte élève à partir de <strong>{label ?? data.level}</strong>. Les nouveaux
                élèves des classes plus basses sont créés <strong>sans connexion</strong>.
              </p>
              <p className="text-slate-600">
                {data.managed} élève(s) en compte famille.
                {data.belowLevelWithLogin > 0
                  ? ` ${data.belowLevelWithLogin} élève(s) de ces classes ont encore un compte élève (${data.belowLevelNeverLoggedIn} ne s'y sont jamais connectés). Ils ne sont pas changés automatiquement : ouvrez leur fiche et choisissez « Passer en compte famille ».`
                  : ""}
              </p>
              {data.managedWithoutParent > 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-950">
                  <p className="font-medium">
                    {data.managedWithoutParent} élève(s) en compte famille n'ont aucun parent lié : personne ne peut les suivre.
                  </p>
                  <ul className="mt-1 list-disc pl-5">
                    {data.withoutParentSample.map((s) => (
                      <li key={s.id}>
                        <Link to={`/eleves/${s.id}`} className="underline">
                          {s.name}
                        </Link>
                        {s.className ? ` · ${s.className}` : ""}
                      </li>
                    ))}
                  </ul>
                  <Link to="/parents" className="mt-2 inline-block font-medium underline">
                    Créer les comptes parents →
                  </Link>
                </div>
              ) : null}
            </div>
          ) : null}
          <p className="mt-3 text-xs text-slate-500">
            Changer ce réglage ne supprime aucun compte existant.
          </p>
        </>
      )}
    </Card>
  );
}
