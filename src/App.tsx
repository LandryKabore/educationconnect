import { lazy, Suspense } from "react";
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/contexts/AuthContext";

// Route-level code splitting: ~48 pages were previously bundled eagerly, so
// a student loaded the same ~2 MB JS chunk as a super_admin. Each persona
// now only downloads the pages it can actually reach.
const Connexion = lazy(() => import("@/pages/Connexion"));
const PremiereConnexion = lazy(() => import("@/pages/PremiereConnexion"));
const CompleterProfil = lazy(() => import("@/pages/CompleterProfil"));
const Profil = lazy(() => import("@/pages/Profil"));
const Telecharger = lazy(() => import("@/pages/Telecharger"));
const EcolesList = lazy(() => import("@/pages/admin/EcolesList"));
const EcoleDetail = lazy(() => import("@/pages/admin/EcoleDetail"));
const AdminDashboard = lazy(() => import("@/pages/admin/AdminDashboard"));
const AdminUsers = lazy(() => import("@/pages/admin/AdminUsers"));
const AdminInvites = lazy(() => import("@/pages/admin/AdminInvites"));
const AdminSettings = lazy(() => import("@/pages/admin/AdminSettings"));
const AdminReports = lazy(() => import("@/pages/admin/AdminReports"));
const AdminAudit = lazy(() => import("@/pages/admin/AdminAudit"));
const AdminBilling = lazy(() => import("@/pages/admin/AdminBilling"));
const AdminSuperAdmins = lazy(() => import("@/pages/admin/AdminSuperAdmins"));
const EcoleOverview = lazy(() => import("@/pages/ecole/EcoleOverview"));
const ConfigurationEcole = lazy(() => import("@/pages/ecole/ConfigurationEcole"));
const ParametresEcole = lazy(() => import("@/pages/ecole/ParametresEcole"));
const Annees = lazy(() => import("@/pages/ecole/Annees"));
const Classes = lazy(() => import("@/pages/ecole/Classes"));
const ProgrammeClasses = lazy(() => import("@/pages/ecole/ProgrammeClasses"));
const Matieres = lazy(() => import("@/pages/ecole/Matieres"));
const Eleves = lazy(() => import("@/pages/ecole/Eleves"));
const EleveDetail = lazy(() => import("@/pages/ecole/EleveDetail"));
const Enseignants = lazy(() => import("@/pages/ecole/Enseignants"));
const Parents = lazy(() => import("@/pages/ecole/Parents"));
const EmploisDuTemps = lazy(() => import("@/pages/ecole/EmploisDuTemps"));
const Bulletins = lazy(() => import("@/pages/ecole/Bulletins"));
const PresencesEcole = lazy(() => import("@/pages/ecole/PresencesEcole"));
const ExamensEcole = lazy(() => import("@/pages/ecole/ExamensEcole"));
const CompositionsEcole = lazy(() => import("@/pages/ecole/CompositionsEcole"));
const SaisieEnseignant = lazy(() => import("@/pages/ecole/SaisieEnseignant"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const ClassDetail = lazy(() => import("@/pages/enseignant/ClassDetail"));
const Presences = lazy(() => import("@/pages/enseignant/Presences"));
const Notes = lazy(() => import("@/pages/enseignant/Notes"));
const MesDevoirsProf = lazy(() => import("@/pages/enseignant/MesDevoirsProf"));
const MesClasses = lazy(() => import("@/pages/enseignant/MesClasses"));
const MesEleves = lazy(() => import("@/pages/enseignant/MesEleves"));
const MesPresencesProf = lazy(() => import("@/pages/enseignant/MesPresencesProf"));
const Messages = lazy(() => import("@/pages/Messages"));
const MesNotes = lazy(() => import("@/pages/eleve/MesNotes"));
const MesExercicesPage = lazy(() =>
  import("@/pages/eleve/MesDevoirs").then((m) => ({
    default: m.MesExercicesPage,
  })),
);
const MesExamensPage = lazy(() =>
  import("@/pages/eleve/MesDevoirs").then((m) => ({
    default: m.MesExamensPage,
  })),
);
const MesPresences = lazy(() => import("@/pages/eleve/MesPresences"));
const MesCompositions = lazy(() => import("@/pages/eleve/MesCompositions"));
const MesProfs = lazy(() => import("@/pages/eleve/MesProfs"));
const MonEmploiDuTempsPage = lazy(() => import("@/pages/MonEmploiDuTempsPage"));
const MonBulletin = lazy(() => import("@/pages/eleve/MonBulletin"));
const Enfants = lazy(() => import("@/pages/parent/Enfants"));
const EnfantNotes = lazy(() => import("@/pages/parent/EnfantNotes"));
const EnfantPresences = lazy(() => import("@/pages/parent/EnfantPresences"));

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center text-slate-500">
      Chargement…
    </div>
  );
}

function HomeRedirect() {
  const { homePath, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Chargement…
      </div>
    );
  }
  return <Navigate to={homePath} replace />;
}

function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
      <Route path="/connexion" element={<Connexion />} />
      <Route
        path="/premiere-connexion"
        element={
          <RequireAuth>
            <PremiereConnexion />
          </RequireAuth>
        }
      />
      <Route
        path="/completer-profil"
        element={
          <RequireAuth>
            <CompleterProfil />
          </RequireAuth>
        }
      />
      <Route path="/telecharger" element={<Telecharger />} />

      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<HomeRedirect />} />
        <Route path="/profil" element={<Profil />} />

        <Route
          path="/admin"
          element={
            <RequireAuth roles={["super_admin"]}>
              <AdminDashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/ecoles"
          element={
            <RequireAuth roles={["super_admin"]}>
              <EcolesList />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/ecoles/:id"
          element={
            <RequireAuth roles={["super_admin"]}>
              <EcoleDetail />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/utilisateurs"
          element={
            <RequireAuth roles={["super_admin"]}>
              <AdminUsers />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/invitations"
          element={
            <RequireAuth roles={["super_admin"]}>
              <AdminInvites />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/parametres"
          element={
            <RequireAuth roles={["super_admin"]}>
              <AdminSettings />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/rapports"
          element={
            <RequireAuth roles={["super_admin"]}>
              <AdminReports />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/audit"
          element={
            <RequireAuth roles={["super_admin"]}>
              <AdminAudit />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/abonnements"
          element={
            <RequireAuth roles={["super_admin"]}>
              <AdminBilling />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/super-admins"
          element={
            <RequireAuth roles={["super_admin"]}>
              <AdminSuperAdmins />
            </RequireAuth>
          }
        />

        <Route
          path="/ecole"
          element={
            <RequireAuth roles={["school_admin"]}>
              <EcoleOverview />
            </RequireAuth>
          }
        />
        <Route
          path="/ecole/configuration"
          element={
            <RequireAuth roles={["school_admin"]}>
              <ConfigurationEcole />
            </RequireAuth>
          }
        />
        <Route
          path="/ecole/parametres"
          element={
            <RequireAuth roles={["school_admin"]}>
              <ParametresEcole />
            </RequireAuth>
          }
        />
        <Route
          path="/annees"
          element={
            <RequireAuth roles={["school_admin"]}>
              <Annees />
            </RequireAuth>
          }
        />
        <Route
          path="/classes"
          element={
            <RequireAuth roles={["school_admin"]}>
              <Classes />
            </RequireAuth>
          }
        />
        <Route
          path="/programmes"
          element={
            <RequireAuth roles={["school_admin"]}>
              <ProgrammeClasses />
            </RequireAuth>
          }
        />
        <Route
          path="/matieres"
          element={
            <RequireAuth roles={["school_admin"]}>
              <Matieres />
            </RequireAuth>
          }
        />
        <Route
          path="/eleves"
          element={
            <RequireAuth roles={["school_admin"]}>
              <Eleves />
            </RequireAuth>
          }
        />
        <Route
          path="/eleves/:id"
          element={
            <RequireAuth roles={["school_admin"]}>
              <EleveDetail />
            </RequireAuth>
          }
        />
        <Route
          path="/enseignants"
          element={
            <RequireAuth roles={["school_admin"]}>
              <Enseignants />
            </RequireAuth>
          }
        />
        <Route
          path="/parents"
          element={
            <RequireAuth roles={["school_admin"]}>
              <Parents />
            </RequireAuth>
          }
        />
        <Route
          path="/emplois-du-temps"
          element={
            <RequireAuth roles={["school_admin"]}>
              <EmploisDuTemps />
            </RequireAuth>
          }
        />
        <Route
          path="/bulletins"
          element={
            <RequireAuth roles={["school_admin"]}>
              <Bulletins />
            </RequireAuth>
          }
        />
        <Route
          path="/presences-ecole"
          element={
            <RequireAuth roles={["school_admin"]}>
              <PresencesEcole />
            </RequireAuth>
          }
        />
        <Route
          path="/devoirs-ecole"
          element={
            <RequireAuth roles={["school_admin"]}>
              <ExamensEcole />
            </RequireAuth>
          }
        />
        <Route
          path="/examens-ecole"
          element={<Navigate to="/devoirs-ecole" replace />}
        />
        <Route
          path="/compositions-ecole"
          element={
            <RequireAuth roles={["school_admin"]}>
              <CompositionsEcole />
            </RequireAuth>
          }
        />
        <Route
          path="/saisie-enseignant"
          element={
            <RequireAuth roles={["school_admin"]}>
              <SaisieEnseignant />
            </RequireAuth>
          }
        />

        <Route
          path="/tableau-de-bord"
          element={
            <RequireAuth roles={["teacher", "student", "parent"]}>
              <Dashboard />
            </RequireAuth>
          }
        />

        <Route
          path="/classes/:id"
          element={
            <RequireAuth roles={["teacher", "school_admin"]}>
              <ClassDetail />
            </RequireAuth>
          }
        />
        <Route
          path="/classes/:id/presences"
          element={
            <RequireAuth roles={["teacher", "school_admin"]}>
              <Presences />
            </RequireAuth>
          }
        />
        <Route
          path="/classes/:id/notes"
          element={
            <RequireAuth roles={["teacher", "school_admin"]}>
              <Notes />
            </RequireAuth>
          }
        />

        <Route
          path="/exercices-maison"
          element={<Navigate to="/devoirs" replace />}
        />
        <Route
          path="/examens"
          element={<Navigate to="/devoirs" replace />}
        />
        <Route
          path="/devoirs"
          element={
            <RequireAuth roles={["teacher"]}>
              <MesDevoirsProf />
            </RequireAuth>
          }
        />
        <Route
          path="/mes-classes"
          element={
            <RequireAuth roles={["teacher"]}>
              <MesClasses />
            </RequireAuth>
          }
        />
        <Route
          path="/mes-eleves"
          element={
            <RequireAuth roles={["teacher"]}>
              <MesEleves />
            </RequireAuth>
          }
        />
        <Route
          path="/presences"
          element={
            <RequireAuth roles={["teacher"]}>
              <MesPresencesProf />
            </RequireAuth>
          }
        />
        <Route
          path="/mon-emploi-du-temps"
          element={
            <RequireAuth roles={["student", "teacher"]}>
              <MonEmploiDuTempsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/messages"
          element={
            <RequireAuth
              roles={["teacher", "student", "parent", "school_admin"]}
            >
              <Messages view="messages" />
            </RequireAuth>
          }
        />
        <Route
          path="/annonces"
          element={
            <RequireAuth
              roles={["teacher", "student", "parent", "school_admin"]}
            >
              <Messages view="annonces" />
            </RequireAuth>
          }
        />

        <Route
          path="/mes-notes"
          element={
            <RequireAuth roles={["student"]}>
              <MesNotes />
            </RequireAuth>
          }
        />
        <Route
          path="/mes-exercices"
          element={
            <RequireAuth roles={["student"]}>
              <MesExercicesPage />
            </RequireAuth>
          }
        />
        <Route
          path="/mes-devoirs"
          element={
            <RequireAuth roles={["student"]}>
              <MesExamensPage />
            </RequireAuth>
          }
        />
        <Route
          path="/mes-examens"
          element={<Navigate to="/mes-devoirs" replace />}
        />
        <Route
          path="/mes-compositions"
          element={
            <RequireAuth roles={["student"]}>
              <MesCompositions />
            </RequireAuth>
          }
        />
        <Route
          path="/mes-profs"
          element={
            <RequireAuth roles={["student"]}>
              <MesProfs />
            </RequireAuth>
          }
        />
        <Route
          path="/mes-presences"
          element={
            <RequireAuth roles={["student"]}>
              <MesPresences />
            </RequireAuth>
          }
        />
        <Route
          path="/mon-bulletin"
          element={
            <RequireAuth roles={["student"]}>
              <MonBulletin />
            </RequireAuth>
          }
        />

        <Route
          path="/enfants"
          element={
            <RequireAuth roles={["parent"]}>
              <Enfants />
            </RequireAuth>
          }
        />
        <Route
          path="/enfants/:id/notes"
          element={
            <RequireAuth roles={["parent"]}>
              <EnfantNotes />
            </RequireAuth>
          }
        />
        <Route
          path="/enfants/:id/presences"
          element={
            <RequireAuth roles={["parent"]}>
              <EnfantPresences />
            </RequireAuth>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  // Electron (file://) needs HashRouter; web uses BrowserRouter
  const isDesktopFile =
    typeof window !== "undefined" && window.location.protocol === "file:";
  const basename = import.meta.env.BASE_URL.replace(/\/$/, "") || undefined;

  if (isDesktopFile) {
    return (
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    );
  }

  return (
    <BrowserRouter basename={basename}>
      <AppRoutes />
    </BrowserRouter>
  );
}
