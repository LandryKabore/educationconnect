import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { subjectSwatch } from "@/lib/subjectColors";
import { timeToMinutes } from "@/lib/timetableConflicts";
import { cn, fullName, joinOne, joinProfile } from "@/lib/utils";
import { EmptyState } from "@/components/ui";

type AssignmentRow = {
  id: string;
  teacher_id: string;
  subject_id: string;
  matieres: { name: string } | null;
  profils: { first_name: string; last_name: string } | null;
};

type SlotRow = {
  teacher_id: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room: string | null;
  matieres: { name: string } | null;
};

type TeacherCard = {
  teacherId: string;
  firstName: string;
  lastName: string;
  subjects: string[];
  minutesPerWeek: number;
  next: { day: number; start: string; end: string; subject: string | null; room: string | null } | null;
};

const DAYS: Record<number, string> = {
  1: "Lundi",
  2: "Mardi",
  3: "Mercredi",
  4: "Jeudi",
  5: "Vendredi",
  6: "Samedi",
  7: "Dimanche",
};

function dbDay(d = new Date()) {
  return d.getDay() === 0 ? 7 : d.getDay();
}

/** "07:00" → "7 h", "09:30" → "9 h 30" */
function clockFr(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

function hoursLabel(minutes: number) {
  if (minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

function roomLabel(room: string | null) {
  const r = room?.trim();
  if (!r) return null;
  return /^salle/i.test(r) ? r : `Salle ${r}`;
}

/** Next lesson of this teacher with the class, from now (wraps to next week). */
function nextSlot(slots: SlotRow[]): TeacherCard["next"] {
  if (slots.length === 0) return null;
  const now = new Date();
  const today = dbDay(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let best: { score: number; slot: SlotRow } | null = null;
  for (const s of slots) {
    let offset = (s.day_of_week - today + 7) % 7;
    if (offset === 0 && timeToMinutes(s.start_time) <= nowMin) offset = 7;
    const score = offset * 1440 + timeToMinutes(s.start_time);
    if (!best || score < best.score) best = { score, slot: s };
  }
  const s = best!.slot;
  return {
    day: s.day_of_week,
    start: s.start_time.slice(0, 5),
    end: s.end_time.slice(0, 5),
    subject: s.matieres?.name ?? null,
    room: s.room,
  };
}

export default function MesProfs() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["mes-profs", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: enrollment, error: enrError } = await supabase
        .from("inscriptions")
        .select("class_section_id, classes(name)")
        .eq("student_id", user!.id)
        .eq("status", "active")
        .maybeSingle();
      if (enrError) throw enrError;
      if (!enrollment) {
        return { className: null as string | null, teachers: [] as TeacherCard[] };
      }

      const row = enrollment as { class_section_id: string; classes: unknown };
      const className = joinOne<{ name: string }>(row.classes)?.name ?? null;

      const [{ data: assignments, error }, { data: slotsData }] = await Promise.all([
        supabase
          .from("affectations_enseignement")
          .select(
            "id, teacher_id, subject_id, matieres(name), profils:profils!affectations_enseignement_teacher_id_fkey(first_name, last_name)",
          )
          .eq("class_section_id", row.class_section_id),
        supabase
          .from("creneaux_edt")
          .select("teacher_id, day_of_week, start_time, end_time, room, matieres(name)")
          .eq("class_section_id", row.class_section_id),
      ]);
      if (error) throw error;

      const slots = (slotsData ?? []) as unknown as SlotRow[];
      const byTeacher = new Map<string, TeacherCard>();
      for (const raw of assignments ?? []) {
        const a = raw as unknown as AssignmentRow;
        const profile = joinProfile(a.profils);
        const subject = a.matieres?.name?.trim();
        const existing = byTeacher.get(a.teacher_id);
        if (existing) {
          if (subject && !existing.subjects.includes(subject)) existing.subjects.push(subject);
          continue;
        }
        const mine = slots.filter((s) => s.teacher_id === a.teacher_id);
        byTeacher.set(a.teacher_id, {
          teacherId: a.teacher_id,
          firstName: profile?.first_name ?? "",
          lastName: profile?.last_name ?? "",
          subjects: subject ? [subject] : [],
          minutesPerWeek: mine.reduce((sum, s) => sum + (timeToMinutes(s.end_time) - timeToMinutes(s.start_time)), 0),
          next: nextSlot(mine),
        });
      }

      const teachers = [...byTeacher.values()].sort((a, b) =>
        fullName(a.firstName, a.lastName).localeCompare(fullName(b.firstName, b.lastName), "fr"),
      );
      for (const t of teachers) t.subjects.sort((x, y) => x.localeCompare(y, "fr"));
      return { className, teachers };
    },
  });

  const teachers = data?.teachers ?? [];
  const className = data?.className;
  const totalMinutes = teachers.reduce((s, t) => s + t.minutesPerWeek, 0);

  // a student thinks "my maths teacher": list by subject, not by surname
  const rows = [...teachers].sort((a, b) =>
    (a.subjects[0] ?? "~").localeCompare(b.subjects[0] ?? "~", "fr"),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 lg:text-3xl">Mes profs</h1>
        <p className="mt-1 text-sm text-slate-500">
          {[
            className,
            teachers.length ? `${teachers.length} enseignant${teachers.length > 1 ? "s" : ""}` : null,
            totalMinutes > 0 ? `${hoursLabel(totalMinutes)} de cours par semaine` : null,
          ]
            .filter(Boolean)
            .join(" · ") || "Les enseignants de ta classe"}
        </p>
      </header>

      {isLoading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Chargement">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-md bg-slate-100" />
          ))}
        </div>
      ) : !className ? (
        <EmptyState message="Vous n’êtes inscrit dans aucune classe pour le moment." />
      ) : teachers.length === 0 ? (
        <EmptyState message="Aucun enseignant n’est encore affecté à votre classe." />
      ) : (
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-white/10">
          <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_5rem_6rem] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-2.5 text-xs font-semibold text-slate-500 md:grid dark:border-white/10">
            <span>Matière</span>
            <span>Enseignant</span>
            <span>Prochain cours</span>
            <span className="text-right">Par semaine</span>
            <span />
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-white/5">
            {rows.map((t) => (
              <TeacherRow key={t.teacherId} teacher={t} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function TeacherRow({ teacher: t }: { teacher: TeacherCard }) {
  const name = fullName(t.firstName, t.lastName) || "Enseignant";
  const subject = t.subjects[0] ?? "Matière non précisée";
  const room = roomLabel(t.next?.room ?? null);
  const isToday = t.next?.day === dbDay();
  const hours = hoursLabel(t.minutesPerWeek);

  return (
    <li className="grid grid-cols-1 gap-1 px-5 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_5rem_6rem] md:items-center md:gap-4 md:py-3.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", subjectSwatch(subject).dot)} aria-hidden />
        <span className="truncate font-semibold text-slate-900">{subject}</span>
        {t.subjects.length > 1 ? (
          <span className="shrink-0 text-xs text-slate-500">+ {t.subjects.slice(1).join(", ")}</span>
        ) : null}
      </div>

      <p className="truncate pl-5 text-sm text-slate-700 md:pl-0 dark:text-slate-300">{name}</p>

      <p className="pl-5 text-sm md:pl-0">
        {t.next ? (
          <>
            <span className={isToday ? "font-semibold text-emerald-700 dark:text-emerald-400" : "text-slate-700 dark:text-slate-300"}>
              {isToday ? "Aujourd’hui" : DAYS[t.next.day]} à {clockFr(t.next.start)}
            </span>
            {room ? <span className="text-slate-400"> · {room}</span> : null}
          </>
        ) : (
          <span className="text-slate-400">Pas encore à l’emploi du temps</span>
        )}
      </p>

      <p className="pl-5 text-sm tabular-nums text-slate-500 md:pl-0 md:text-right">
        {hours ?? "—"}
        <span className="md:hidden"> par semaine</span>
      </p>

      <div className="pl-5 pt-1 md:pl-0 md:pt-0 md:text-right">
        <Link
          to={`/messages?avec=${encodeURIComponent(t.teacherId)}&retour=${encodeURIComponent("/mes-profs")}`}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-500/10"
          aria-label={`Écrire à ${name}`}
        >
          <MessageSquare className="h-4 w-4" />
          Écrire
        </Link>
      </div>
    </li>
  );
}
