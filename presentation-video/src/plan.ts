import narration from "../script/narration.json";
import timings from "./timings.json";

export const FPS = 30;

export type Scene = {
  id: string;
  kind: "title" | "problem" | "chapter" | "screen" | "sync" | "outro";
  text: string;
  title?: string;
  subtitle?: string;
  bullets?: string[];
  number?: string;
  portal?: string;
};

/** Clips shown during each screen scene, with the label shown on screen. */
export const SCENE_CLIPS: Record<string, { clip: string; label: string; path: string }[]> = {
  connexion: [{ clip: "connexion", label: "Une connexion, le même compte partout", path: "/connexion" }],
  "admin-accueil": [{ clip: "admin-accueil", label: "Toute l’école sur un écran", path: "/ecole" }],
  "admin-structure": [
    { clip: "admin-periodes", label: "Trimestres et clôture", path: "/periodes" },
    { clip: "admin-classes", label: "Les classes", path: "/classes" },
    { clip: "admin-programmes", label: "Programmes et coefficients", path: "/programmes" },
  ],
  "admin-personnes": [
    { clip: "admin-eleves", label: "2 000 élèves, retrouvés en une seconde", path: "/eleves" },
    { clip: "admin-eleve-fiche", label: "La fiche d’un élève, en direct", path: "/eleves/…" },
  ],
  "admin-vie": [
    { clip: "admin-edt", label: "Emplois du temps", path: "/emplois-du-temps" },
    { clip: "admin-compositions", label: "Compositions", path: "/compositions-ecole" },
    { clip: "admin-presences", label: "Absences de toute l’école", path: "/presences-ecole" },
  ],
  "admin-bulletins": [
    { clip: "admin-bulletins", label: "Bulletins avec code QR", path: "/bulletins" },
  ],
  "prof-accueil": [{ clip: "prof-accueil", label: "L’essentiel de la journée", path: "/tableau-de-bord" }],
  "prof-appel": [
    { clip: "prof-presences", label: "Les appels du jour", path: "/presences" },
    { clip: "prof-appel", label: "L’appel en quelques secondes", path: "/classes/…/presences" },
  ],
  "prof-cahier": [{ clip: "prof-cahier", label: "Cahier de textes", path: "/cahier-de-textes" }],
  "prof-notes": [
    { clip: "prof-notes", label: "Saisie des notes", path: "/classes/…/notes" },
    { clip: "prof-devoirs", label: "Examens et évaluations", path: "/devoirs" },
    { clip: "prof-edt", label: "Son emploi du temps", path: "/mon-emploi-du-temps" },
  ],
  "eleve-accueil": [{ clip: "eleve-accueil", label: "Sa journée en un coup d’œil", path: "/tableau-de-bord" }],
  "eleve-notes": [{ clip: "eleve-notes", label: "Mes notes", path: "/mes-notes" }],
  "eleve-travail": [
    { clip: "eleve-exercices", label: "Exercices de maison", path: "/mes-exercices" },
    { clip: "eleve-examens", label: "Examens", path: "/mes-examens" },
    { clip: "eleve-compositions", label: "Compositions", path: "/mes-compositions" },
  ],
  "eleve-presences": [
    { clip: "eleve-presences", label: "Le calendrier des présences", path: "/mes-presences" },
    { clip: "eleve-edt", label: "L’emploi du temps, en direct", path: "/mon-emploi-du-temps" },
  ],
  "eleve-bulletin": [{ clip: "eleve-bulletin", label: "Mon bulletin", path: "/mon-bulletin" }],
  "eleve-echanges": [
    { clip: "eleve-messages", label: "Écrire à un professeur", path: "/messages" },
    { clip: "eleve-annonces", label: "Les annonces de l’école", path: "/annonces" },
    { clip: "eleve-profil", label: "Son profil et sa photo", path: "/profil" },
  ],
  "admin-annonces": [{ clip: "admin-annonces", label: "Annonces à toute l’école", path: "/annonces" }],
  "prof-messages": [{ clip: "prof-messages", label: "Messagerie", path: "/messages" }],
  "parent-travail": [
    { clip: "parent-cahier", label: "Le cahier de textes", path: "/enfants/…/cahier" },
    { clip: "parent-examens", label: "Les examens à venir", path: "/enfants/…/devoirs" },
    { clip: "parent-compositions", label: "Les compositions", path: "/enfants/…/compositions" },
  ],
  "parent-accueil": [{ clip: "parent-accueil", label: "Deux enfants, une seule connexion", path: "/tableau-de-bord" }],
  "parent-suivi": [
    { clip: "parent-notes", label: "Les mêmes notes", path: "/enfants/…/notes" },
    { clip: "parent-presences", label: "Les mêmes présences", path: "/enfants/…/presences" },
    { clip: "parent-bulletin", label: "Le même bulletin", path: "/enfants/…/bulletin" },
  ],
  "parent-messages": [
    { clip: "parent-messages", label: "Écrire à l’école", path: "/messages" },
    { clip: "parent-annonces", label: "Les annonces", path: "/annonces" },
  ],
  appareils: [{ clip: "telecharger", label: "Navigateur, Windows, Mac — bientôt Android et iPhone", path: "/telecharger" }],
};

/** Silence after the voice, per kind of scene (seconds). */
const PAD: Record<Scene["kind"], number> = {
  title: 2.5,
  problem: 2.5,
  chapter: 3.0,
  screen: 5.5,
  sync: 3.0,
  outro: 5.0,
};
/** Short breath before the voice starts. */
export const LEAD = 0.6;

const secondsById = new Map((timings as { id: string; seconds: number }[]).map((t) => [t.id, t.seconds]));

export const SCENES = (narration as Scene[]).map((s) => {
  const voice = secondsById.get(s.id) ?? 6;
  const seconds = LEAD + voice + PAD[s.kind];
  return { ...s, voice, frames: Math.round(seconds * FPS) };
});

export const TOTAL_FRAMES = SCENES.reduce((n, s) => n + s.frames, 0);

export const PORTAL_TINT: Record<string, string> = {
  Administration: "#fbbf24",
  Enseignant: "#a78bfa",
  Élève: "#34d399",
  Parent: "#fb7185",
  Connexion: "#5eead4",
  Applications: "#5eead4",
};
