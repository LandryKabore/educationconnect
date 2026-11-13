import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  FileText,
  GraduationCap,
  NotebookPen,
} from "lucide-react";

/**
 * « Accès rapide » on the parent home.
 * Two columns below lg, one column from lg (beside the announcements).
 */
export const PARENT_QUICK_LINKS: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "notes", label: "Notes", icon: BookOpen },
  { to: "bulletin", label: "Bulletin", icon: FileText },
  { to: "presences", label: "Présences", icon: CalendarCheck },
  { to: "emploi-du-temps", label: "Emploi du temps", icon: CalendarDays },
  { to: "devoirs", label: "Devoirs", icon: ClipboardList },
  { to: "exercices", label: "Exercices", icon: NotebookPen },
  { to: "compositions", label: "Compositions", icon: GraduationCap },
];
