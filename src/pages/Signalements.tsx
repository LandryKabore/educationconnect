import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { ROLE_LABELS, type AppRole } from "@/lib/types";
import { fullName } from "@/lib/utils";
import { Badge, Button, Card, EmptyState, PageHeader, Select, Textarea } from "@/components/ui";

type Status = "nouveau" | "vu" | "en_cours" | "resolu";

type Row = {
  id: string;
  created_at: string;
  role: string | null;
  route: string | null;
  app_version: string | null;
  platform: string | null;
  online: boolean | null;
  viewport: string | null;
  user_agent: string | null;
  error_messages: string[] | null;
  message: string;
  status: Status;
  admin_note: string | null;
  handled_at: string | null;
  auteur: { first_name: string | null; last_name: string | null } | null;
  ecole: { name: string | null } | null;
};

const STATUS_LABEL: Record<Status, string> = {
  nouveau: "Nouveau",
  vu: "Vu",
  en_cours: "En cours",
  resolu: "Résolu",
};
const STATUS_TONE: Record<Status, "danger" | "info" | "warning" | "success"> = {
  nouveau: "danger",
  vu: "info",
  en_cours: "warning",
  resolu: "success",
};

function when(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

/** Reports sent with « Signaler un problème ». School admins see their school, super admins see all. */
export default function Signalements() {
  const { role } = useAuth();
  const isSuper = role === "super_admin";
  const [filter, setFilter] = useState<"ouverts" | Status | "tous">("ouverts");

  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: ["signalements", "admin"],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("signalements")
        .select(
          "id, created_at, role, route, app_version, platform, online, viewport, user_agent, error_messages, message, status, admin_note, handled_at, " +
            "auteur:profils!signalements_user_id_fkey(first_name, last_name), ecole:ecoles(name)",
        )
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const shown = rows.filter((r) =>
    filter === "tous" ? true : filter === "ouverts" ? r.status !== "resolu" : r.status === filter,
  );
  const newCount = rows.filter((r) => r.status === "nouveau").length;

  return (
    <div>
      <PageHeader
        title="Signalements"
        subtitle={
          isSuper
            ? "Problèmes signalés par les utilisateurs de toutes les écoles."
            : "Problèmes signalés par les utilisateurs de votre école."
        }
        actions={
          <div className="w-full sm:w-56">
            <Select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
              <option value="ouverts">À traiter{newCount ? ` (${newCount} nouveau${newCount > 1 ? "x" : ""})` : ""}</option>
              <option value="nouveau">Nouveaux</option>
              <option value="vu">Vus</option>
              <option value="en_cours">En cours</option>
              <option value="resolu">Résolus</option>
              <option value="tous">Tous</option>
            </Select>
          </div>
        }
      />
      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : error ? (
        <p className="text-red-600">Impossible de charger les signalements.</p>
      ) : shown.length === 0 ? (
        <EmptyState message="Aucun signalement dans cette liste." />
      ) : (
        <div className="space-y-4">
          {shown.map((r) => (
            <ReportCard key={r.id} row={r} showSchool={isSuper} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReportCard({ row, showSchool }: { row: Row; showSchool: boolean }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>(row.status);
  const [note, setNote] = useState(row.admin_note ?? "");
  const [details, setDetails] = useState(false);
  const errors = Array.isArray(row.error_messages) ? row.error_messages : [];
  const dirty = status !== row.status || note.trim() !== (row.admin_note ?? "");

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("signalements")
        .update({ status, admin_note: note.trim() || null })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Signalement mis à jour");
      void qc.invalidateQueries({ queryKey: ["signalements"] });
    },
    onError: (e: Error) => toast.error(e.message || "Mise à jour impossible"),
  });

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>
        <span className="font-semibold text-slate-900 dark:text-slate-100">
          {fullName(row.auteur?.first_name, row.auteur?.last_name)}
        </span>
        <span className="text-slate-500">
          {row.role ? (ROLE_LABELS[row.role as AppRole] ?? row.role) : "rôle inconnu"}
          {showSchool && row.ecole?.name ? ` · ${row.ecole.name}` : ""} · {when(row.created_at)}
        </span>
      </div>

      <p className="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-200">{row.message}</p>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <span>Page : {row.route ?? "?"}</span>
        <span>Version : {row.app_version ?? "?"}</span>
        <span>Appareil : {row.platform ?? "?"}</span>
        <span>{row.online === null ? "Connexion inconnue" : row.online ? "En ligne" : "Hors ligne"}</span>
        {errors.length > 0 || row.user_agent ? (
          <button type="button" className="font-medium text-brand-700 underline" onClick={() => setDetails((v) => !v)}>
            {details ? "Masquer les détails" : "Détails techniques"}
          </button>
        ) : null}
      </div>

      {details ? (
        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
          {row.viewport ? <p>Écran : {row.viewport}</p> : null}
          {row.user_agent ? <p className="break-all">Navigateur : {row.user_agent}</p> : null}
          {errors.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {errors.map((m, i) => (
                <li key={i} className="break-words">
                  {String(m)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-[12rem_1fr_auto] sm:items-start">
        <Select value={status} onChange={(e) => setStatus(e.target.value as Status)}>
          {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
        <Textarea
          className="min-h-11"
          rows={2}
          maxLength={1000}
          placeholder="Note interne (visible seulement par les administrateurs)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
          {save.isPending ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
    </Card>
  );
}
