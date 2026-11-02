import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { fullName } from "@/lib/utils";
import { Modal } from "@/components/Modal";
import { Badge, Button, Card, EmptyState, Input, Label, Textarea } from "@/components/ui";

type Doc = {
  code: string;
  period_label: string;
  year_label: string | null;
  issued_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
  verified_count: number;
  eleve: { first_name: string | null; last_name: string | null } | null;
};

/** List of bulletins issued with a QR code. Lets an administrator cancel one issued by mistake. */
export function DocumentsRegister() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<Doc | null>(null);
  const [reason, setReason] = useState("");

  const term = search.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["documents-emis", term],
    queryFn: async (): Promise<Doc[]> => {
      let q = supabase
        .from("documents_emis")
        .select(
          "code, period_label, year_label, issued_at, revoked_at, revoked_reason, verified_count, " +
            "eleve:profils!documents_emis_student_id_fkey(first_name, last_name)",
        )
        .eq("doc_type", "bulletin")
        .order("issued_at", { ascending: false })
        .limit(50);
      if (term) q = q.ilike("code", `%${term}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Doc[];
    },
  });

  const revoke = useMutation({
    mutationFn: async () => {
      if (!target) return;
      const { error } = await supabase.rpc("ef_revoke_document", {
        p_code: target.code,
        p_reason: reason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Bulletin annulé : la vérification dira qu’il n’est plus valable");
      setTarget(null);
      setReason("");
      void qc.invalidateQueries({ queryKey: ["documents-emis"] });
    },
    onError: (e: Error) => toast.error(e.message || "Annulation impossible"),
  });

  return (
    <Card className="mt-8">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Bulletins émis (QR code)</h2>
      <p className="mt-1 text-sm text-slate-500">
        Chaque bulletin téléchargé reçoit un code. Annulez un bulletin émis par erreur : la page de vérification
        indiquera alors qu’il n’est plus valable.
      </p>
      <div className="mt-3 max-w-xs">
        <Label htmlFor="doc-code">Chercher par code</Label>
        <Input id="doc-code" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="EF-ABCDE-FGH23" />
      </div>
      {isLoading ? (
        <p className="mt-4 text-slate-500">Chargement…</p>
      ) : docs.length === 0 ? (
        <div className="mt-4">
          <EmptyState message="Aucun bulletin émis pour le moment." />
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2 pr-3">Code</th>
                <th className="py-2 pr-3">Élève</th>
                <th className="py-2 pr-3">Période</th>
                <th className="py-2 pr-3">Émis le</th>
                <th className="py-2 pr-3">Vérifié</th>
                <th className="py-2 pr-3">État</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.code} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="py-2 pr-3 font-mono text-xs">{d.code}</td>
                  <td className="py-2 pr-3">{fullName(d.eleve?.first_name, d.eleve?.last_name)}</td>
                  <td className="py-2 pr-3">
                    {d.period_label}
                    {d.year_label ? ` · ${d.year_label}` : ""}
                  </td>
                  <td className="py-2 pr-3">
                    {new Date(d.issued_at).toLocaleDateString("fr-FR", { dateStyle: "short" })}
                  </td>
                  <td className="py-2 pr-3">{d.verified_count} fois</td>
                  <td className="py-2 pr-3">
                    {d.revoked_at ? <Badge tone="danger">Annulé</Badge> : <Badge tone="success">Valable</Badge>}
                  </td>
                  <td className="py-2 text-right">
                    {d.revoked_at ? null : (
                      <Button size="sm" variant="outline" onClick={() => setTarget(d)}>
                        Annuler
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={!!target}
        title="Annuler ce bulletin ?"
        onClose={() => setTarget(null)}
        closeDisabled={revoke.isPending}
      >
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
          Code <span className="font-mono">{target?.code}</span>. Cette action ne supprime pas le PDF déjà
          imprimé, elle indique seulement qu’il n’est plus valable.
        </p>
        <Label htmlFor="revoke-reason">Raison (obligatoire)</Label>
        <Textarea
          id="revoke-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={300}
          placeholder="Ex. : bulletin émis pour le mauvais élève"
        />
        <div className="mt-4 flex gap-2">
          <Button
            variant="danger"
            onClick={() => revoke.mutate()}
            disabled={revoke.isPending || reason.trim().length < 5}
          >
            {revoke.isPending ? "Annulation…" : "Annuler le bulletin"}
          </Button>
          <Button variant="ghost" onClick={() => setTarget(null)} disabled={revoke.isPending}>
            Fermer
          </Button>
        </div>
      </Modal>
    </Card>
  );
}
