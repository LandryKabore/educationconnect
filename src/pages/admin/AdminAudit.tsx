import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { AuditLogRow, Profile } from "@/lib/types";
import { fullName } from "@/lib/utils";
import { Card, EmptyState, Input, PageHeader } from "@/components/ui";

type AuditWithActor = AuditLogRow & {
  actor?: Profile | null;
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function briefDetails(details: Record<string, unknown>) {
  const keys = Object.keys(details);
  if (keys.length === 0) return "—";
  const text = JSON.stringify(details);
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

export default function AdminAudit() {
  const [search, setSearch] = useState("");

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["admin-audit-logs"],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;

      const actorIds = [
        ...new Set(
          ((rows ?? []) as AuditLogRow[])
            .map((r) => r.actor_id)
            .filter(Boolean) as string[],
        ),
      ];

      let actorMap = new Map<string, Profile>();
      if (actorIds.length) {
        const { data: profils } = await supabase
          .from("profils")
          .select("*")
          .in("id", actorIds);
        actorMap = new Map(((profils ?? []) as Profile[]).map((p) => [p.id, p]));
      }

      return ((rows ?? []) as AuditLogRow[]).map((r) => ({
        ...r,
        details: (r.details ?? {}) as Record<string, unknown>,
        actor: r.actor_id ? actorMap.get(r.actor_id) ?? null : null,
      })) as AuditWithActor[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter((log) => {
      const actor = fullName(log.actor?.first_name, log.actor?.last_name).toLowerCase();
      return (
        log.action.toLowerCase().includes(q) ||
        (log.entity_type ?? "").toLowerCase().includes(q) ||
        (log.entity_id ?? "").toLowerCase().includes(q) ||
        actor.includes(q)
      );
    });
  }, [logs, search]);

  return (
    <div>
      <PageHeader
        title="Journal d'audit"
        subtitle="Historique des actions super administrateur"
      />

      <div className="mb-4">
        <Input
          placeholder="Filtrer par action, entité ou acteur…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        {isLoading ? (
          <p className="text-sm text-slate-500">Chargement…</p>
        ) : filtered.length === 0 ? (
          <EmptyState message="Aucune entrée dans le journal." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="pb-2 pr-3 font-medium">Date</th>
                  <th className="pb-2 pr-3 font-medium">Acteur</th>
                  <th className="pb-2 pr-3 font-medium">Action</th>
                  <th className="pb-2 pr-3 font-medium">Entité</th>
                  <th className="pb-2 font-medium">Détails</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((log) => (
                  <tr key={log.id} className="border-b border-slate-100 align-top">
                    <td className="py-2 pr-3 whitespace-nowrap text-slate-600">
                      {formatDateTime(log.created_at)}
                    </td>
                    <td className="py-2 pr-3">
                      {log.actor
                        ? fullName(log.actor.first_name, log.actor.last_name)
                        : "—"}
                    </td>
                    <td className="py-2 pr-3 font-medium">{log.action}</td>
                    <td className="py-2 pr-3 text-slate-600">
                      {[log.entity_type, log.entity_id].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="py-2 max-w-xs truncate font-mono text-xs text-slate-500">
                      {briefDetails(log.details)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
