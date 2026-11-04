import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
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
    <Card className="mt-6 max-w-2xl">
      <h3 className="font-semibold text-slate-900">Comptes des élèves du primaire</h3>
      <p className="mt-1 text-sm text-slate-600">
        Les petits élèves n'ont pas de téléphone. Avec ce réglage, les élèves des classes <strong>plus basses</strong> que
        le niveau choisi n'ont <strong>pas de connexion</strong> : c'est le parent qui suit son enfant (notes, présences,
        emploi du temps, cahier de textes). À partir du niveau choisi, l'élève a son propre compte.
      </p>
      {isLoading || !data ? (
        <p className="mt-3 text-sm text-slate-500">Chargement…</p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="min-w-[14rem]">
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
            <Button disabled={!dirty || saving} onClick={() => void save()}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>

          {data.level ? (
            <div className="mt-4 space-y-2 text-sm">
              <p>
                <Badge tone="info">Actif</Badge> Compte élève à partir de <strong>{label ?? data.level}</strong>. Les nouveaux
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
          <p className="mt-3 text-xs text-slate-400">
            Changer ce réglage ne supprime aucun compte existant.
          </p>
        </>
      )}
    </Card>
  );
}
