import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import type { ClassSection, Profile, Subject } from "@/lib/types";
import { fullName } from "@/lib/utils";
import { SetupGuideBar } from "@/components/SetupGuideBar";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Select,
} from "@/components/ui";

interface CreateResult {
  username: string;
  tempPassword: string;
}

export default function Enseignants() {
  const { schoolId } = useAuth();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showForm, setShowForm] = useState(false);
  const [showAssign, setShowAssign] = useState(
    () => searchParams.get("assign") === "1",
  );
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [creating, setCreating] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [result, setResult] = useState<CreateResult | null>(null);
  const [teacherId, setTeacherId] = useState("");
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");

  useEffect(() => {
    if (searchParams.get("assign") === "1") {
      setShowAssign(true);
      setShowForm(false);
    }
  }, [searchParams]);

  const openAssign = () => {
    setShowAssign(true);
    setShowForm(false);
    const next = new URLSearchParams(searchParams);
    next.set("assign", "1");
    setSearchParams(next, { replace: true });
  };

  const closeAssign = () => {
    setShowAssign(false);
    const next = new URLSearchParams(searchParams);
    next.delete("assign");
    setSearchParams(next, { replace: true });
  };

  const { data: teachers = [], isLoading } = useQuery({
    queryKey: ["enseignants", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data: roles, error } = await supabase
        .from("roles_utilisateurs")
        .select("user_id, profils(*)")
        .eq("school_id", schoolId!)
        .eq("role", "teacher")
        .eq("active", true);
      if (error) throw error;
      return (roles ?? []).map((r) => (r as unknown as { profils: Profile }).profils);
    },
  });

  const { data: classes = [] } = useQuery({
    queryKey: ["classes", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data } = await supabase
        .from("classes")
        .select("*")
        .eq("school_id", schoolId!)
        .order("name");
      return (data ?? []) as ClassSection[];
    },
  });

  const { data: subjects = [] } = useQuery({
    queryKey: ["matieres", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data } = await supabase
        .from("matieres")
        .select("*")
        .eq("school_id", schoolId!)
        .order("name");
      return (data ?? []) as Subject[];
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["affectations", schoolId],
    enabled: !!schoolId && classes.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("affectations_enseignement")
        .select(
          "id, teacher_id, class_section_id, subject_id, classes(name), matieres(name), profils:profils!affectations_enseignement_teacher_id_fkey(first_name, last_name)",
        )
        .in(
          "class_section_id",
          classes.map((c) => c.id),
        );
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        teacher_id: string;
        class_section_id: string;
        subject_id: string;
        classes: { name: string } | null;
        matieres: { name: string } | null;
        profils: { first_name: string; last_name: string } | null;
      }[];
    },
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId) return;
    setCreating(true);
    setResult(null);

    const { data, error } = await supabase.functions.invoke("creer-utilisateur", {
      body: {
        role: "teacher",
        schoolId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      },
    });

    if (error) {
      toast.error("La création a échoué — mode démo activé");
      const demoUser = `ens.${lastName.toLowerCase().slice(0, 5)}`;
      setResult({ username: demoUser, tempPassword: "demo1234" });
      toast.message("Identifiants de démonstration générés localement");
    } else {
      const res = data as {
        username?: string;
        tempPassword?: string;
        userId?: string;
        error?: string;
      };
      if (res.error) {
        toast.error(res.error);
        setCreating(false);
        return;
      }
      setResult({
        username: res.username ?? "—",
        tempPassword: res.tempPassword ?? "—",
      });
      if (res.userId) setTeacherId(res.userId);
      toast.success("Enseignant créé — vous pouvez l’affecter ci-dessous");
      setShowAssign(true);
      void qc.invalidateQueries({ queryKey: ["enseignants", schoolId] });
      void qc.invalidateQueries({ queryKey: ["school-setup", schoolId] });
    }

    setCreating(false);
    setFirstName("");
    setLastName("");
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherId || !classId || !subjectId) {
      toast.error("Choisissez enseignant, classe et matière");
      return;
    }
    setAssigning(true);
    const { error } = await supabase.from("affectations_enseignement").insert({
      teacher_id: teacherId,
      class_section_id: classId,
      subject_id: subjectId,
    });
    if (error) {
      setAssigning(false);
      toast.error(error.message.includes("duplicate") ? "Affectation déjà existante" : "Erreur");
      return;
    }

    await supabase.from("programme_classe").upsert(
      {
        class_section_id: classId,
        subject_id: subjectId,
        coefficient: 1,
      },
      { onConflict: "class_section_id,subject_id", ignoreDuplicates: true },
    );

    setAssigning(false);
    toast.success("Affectation enregistrée");
    setClassId("");
    setSubjectId("");
    void qc.invalidateQueries({ queryKey: ["affectations", schoolId] });
    void qc.invalidateQueries({ queryKey: ["school-setup", schoolId] });
    void qc.invalidateQueries({ queryKey: ["programme-classe", classId] });
  };

  const removeAssignment = async (id: string) => {
    const { error } = await supabase.from("affectations_enseignement").delete().eq("id", id);
    if (error) toast.error("Suppression impossible");
    else {
      toast.success("Affectation retirée");
      void qc.invalidateQueries({ queryKey: ["affectations", schoolId] });
      void qc.invalidateQueries({ queryKey: ["school-setup", schoolId] });
    }
  };

  return (
    <div>
      <SetupGuideBar />
      <PageHeader
        title="Enseignants"
        subtitle="Créez les comptes puis affectez-les aux classes et matières"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={showAssign ? "primary" : "outline"}
              onClick={() => (showAssign ? closeAssign() : openAssign())}
            >
              {showAssign ? "Fermer affectation" : "Affecter"}
            </Button>
            <Button
              type="button"
              variant={showForm ? "outline" : "primary"}
              onClick={() => {
                setShowForm(!showForm);
                if (!showForm) closeAssign();
              }}
            >
              {showForm ? "Fermer" : "Nouvel enseignant"}
            </Button>
          </div>
        }
      />

      {showForm ? (
        <Card className="mb-6 max-w-lg">
          <form onSubmit={(e) => void handleCreate(e)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Prénom</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
              </div>
              <div>
                <Label>Nom</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={creating}>
                {creating ? "Création…" : "Créer"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                Annuler
              </Button>
            </div>
          </form>

          {result ? (
            <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm">
              <p className="font-medium text-brand-800">Identifiants créés</p>
              <p className="mt-2">
                Identifiant : <Badge>{result.username}</Badge>
              </p>
              <p className="mt-1">
                Mot de passe temporaire : <Badge tone="warning">{result.tempPassword}</Badge>
              </p>
            </div>
          ) : null}
        </Card>
      ) : null}

      {showAssign ? (
        <Card className="mb-6 max-w-lg">
          <h3 className="mb-4 font-semibold">Affecter un enseignant</h3>
          <form onSubmit={(e) => void handleAssign(e)} className="space-y-4">
            <div>
              <Label>Enseignant</Label>
              <Select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} required>
                <option value="">Choisir…</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {fullName(t.first_name, t.last_name)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Classe</Label>
              <Select value={classId} onChange={(e) => setClassId(e.target.value)} required>
                <option value="">Choisir…</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Matière</Label>
              <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} required>
                <option value="">Choisir…</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" disabled={assigning}>
              {assigning ? "Enregistrement…" : "Enregistrer l’affectation"}
            </Button>
          </form>
        </Card>
      ) : null}

      {assignments.length > 0 ? (
        <div className="mb-8">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Affectations ({assignments.length})
          </h3>
          <div className="space-y-2">
            {assignments.map((a) => (
              <Card key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {a.profils
                      ? fullName(a.profils.first_name, a.profils.last_name)
                      : "Enseignant"}
                  </p>
                  <p className="text-sm text-slate-500">
                    {a.classes?.name ?? "—"} · {a.matieres?.name ?? "—"}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => void removeAssignment(a.id)}>
                  Retirer
                </Button>
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : teachers.length === 0 ? (
        <EmptyState message="Aucun enseignant." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {teachers.map((t) => {
            const count = assignments.filter((a) => a.teacher_id === t.id).length;
            return (
              <Card key={t.id}>
                <h3 className="font-semibold">{fullName(t.first_name, t.last_name)}</h3>
                {t.phone ? <p className="text-sm text-slate-500">{t.phone}</p> : null}
                <p className="mt-1 text-xs text-slate-400">
                  {count > 0 ? `${count} affectation(s)` : "Pas encore affecté"}
                </p>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
