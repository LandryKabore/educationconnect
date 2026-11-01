import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { isSchoolFormComplete, schoolToForm } from "@/lib/schoolForm";
import { fetchSchoolSetupCounts } from "@/lib/scaleApi";
import {
  type SetupCounts,
  setupProgress,
  SCHOOL_SETUP_STEPS,
  evaluateSetupStep,
} from "@/lib/schoolSetup";

export function useSchoolSetupProgress() {
  const { schoolId } = useAuth();

  const query = useQuery({
    queryKey: ["school-setup", schoolId, "v4"],
    enabled: !!schoolId,
    queryFn: async (): Promise<SetupCounts> => {
      const sid = schoolId!;

      const [
        schoolRes,
        yearsRes,
        subjectsRes,
        classesRes,
        teachersRes,
        studentsRes,
        parentsRes,
        setupCountsRes,
      ] = await Promise.all([
        supabase
          .from("ecoles")
          .select(
            "name, code, school_type, region, city, address, phone, email",
          )
          .eq("id", sid)
          .maybeSingle(),
        supabase.from("annees_scolaires").select("id, is_current").eq("school_id", sid),
        supabase.from("matieres").select("id", { count: "exact", head: true }).eq("school_id", sid),
        supabase.from("classes").select("id", { count: "exact", head: true }).eq("school_id", sid),
        supabase
          .from("roles_utilisateurs")
          .select("id", { count: "exact", head: true })
          .eq("school_id", sid)
          .eq("role", "teacher")
          .eq("active", true),
        supabase
          .from("roles_utilisateurs")
          .select("id", { count: "exact", head: true })
          .eq("school_id", sid)
          .eq("role", "student")
          .eq("active", true),
        supabase
          .from("roles_utilisateurs")
          .select("id", { count: "exact", head: true })
          .eq("school_id", sid)
          .eq("role", "parent")
          .eq("active", true),
        fetchSchoolSetupCounts(sid),
      ]);

      const { classesWithProgramme, enrollments, assignments, timetableSlots } =
        setupCountsRes;

      const years = yearsRes.data ?? [];
      const profileComplete = schoolRes.data
        ? isSchoolFormComplete(schoolToForm(schoolRes.data))
        : false;

      return {
        profileComplete,
        years: years.length,
        currentYear: years.some((y) => y.is_current),
        subjects: subjectsRes.count ?? 0,
        classes: classesRes.count ?? 0,
        classesWithProgramme,
        teachers: teachersRes.count ?? 0,
        assignments,
        students: studentsRes.count ?? 0,
        enrollments,
        parents: parentsRes.count ?? 0,
        timetableSlots,
      };
    },
  });

  const counts = query.data;
  const progress = counts ? setupProgress(counts) : null;
  const steps = counts
    ? SCHOOL_SETUP_STEPS.map((step) => ({
        ...step,
        status: evaluateSetupStep(step.id, counts),
      }))
    : [];

  const nextStep = steps.find((s) => s.status === "todo");

  return {
    ...query,
    counts,
    progress,
    steps,
    nextStep,
  };
}
