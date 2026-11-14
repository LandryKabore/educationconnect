import { lazy, Suspense } from "react";
import {
  createBrowserRouter,
  createHashRouter,
  Navigate,
  Route,
  RouterProvider,
  Routes,
} from "react-router-dom";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import Connexion from "@/pages/Connexion";
import PremiereConnexion from "@/pages/PremiereConnexion";
import CompleterProfil from "@/pages/CompleterProfil";
import Profil from "@/pages/Profil";
import Telecharger from "@/pages/Telecharger";
import EcolesList from "@/pages/admin/EcolesList";
import EcoleDetail from "@/pages/admin/EcoleDetail";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminUsers from "@/pages/admin/AdminUsers";
import AdminInvites from "@/pages/admin/AdminInvites";
import AdminSettings from "@/pages/admin/AdminSettings";
import AdminReports from "@/pages/admin/AdminReports";
import Signalements from "@/pages/Signalements";
import AdminAudit from "@/pages/admin/AdminAudit";
import AdminBilling from "@/pages/admin/AdminBilling";
import AdminSuperAdmins from "@/pages/admin/AdminSuperAdmins";
import EcoleOverview from "@/pages/ecole/EcoleOverview";
import ConfigurationEcole from "@/pages/ecole/ConfigurationEcole";
import ParametresEcole from "@/pages/ecole/ParametresEcole";
import Annees from "@/pages/ecole/Annees";
import Periodes from "@/pages/ecole/Periodes";
import Classes from "@/pages/ecole/Classes";
import ProgrammeClasses from "@/pages/ecole/ProgrammeClasses";
import Matieres from "@/pages/ecole/Matieres";
import Eleves from "@/pages/ecole/Eleves";
import EleveDetail from "@/pages/ecole/EleveDetail";
import Enseignants from "@/pages/ecole/Enseignants";
import Parents from "@/pages/ecole/Parents";
import EmploisDuTemps from "@/pages/ecole/EmploisDuTemps";
// loaded on demand: pulls in the PDF / ZIP tools, and keeps the main bundle under the PWA cache limit
const VerifierDocument = lazy(() => import("@/pages/VerifierDocument"));
const Bulletins = lazy(() => import("@/pages/ecole/Bulletins"));
const PresencesEcole = lazy(() => import("@/pages/ecole/PresencesEcole"));
// nov3: cahier de textes (#31) and annual statistics (#32), loaded on demand
const CahierTextes = lazy(() => import("@/pages/enseignant/CahierTextes"));
const CahierEcole = lazy(() => import("@/pages/ecole/CahierEcole"));
const Statistiques = lazy(() => import("@/pages/ecole/Statistiques"));
const MonCahier = lazy(() => import("@/pages/eleve/MonCahier"));
const EnfantCahier = lazy(() => import("@/pages/parent/EnfantCahier"));
import ExamensEcole from "@/pages/ecole/ExamensEcole";
import CompositionsEcole from "@/pages/ecole/CompositionsEcole";
import SaisieEnseignant from "@/pages/ecole/SaisieEnseignant";
import Dashboard from "@/pages/Dashboard";
import ClassDetail from "@/pages/enseignant/ClassDetail";
const Presences = lazy(() => import("@/pages/enseignant/Presences"));
import Notes from "@/pages/enseignant/Notes";
import NotesSaisie from "@/pages/enseignant/NotesSaisie";
import MesDevoirsProf from "@/pages/enseignant/MesDevoirsProf";
import MesClasses from "@/pages/enseignant/MesClasses";
import MesEleves from "@/pages/enseignant/MesEleves";
import MesPresencesProf from "@/pages/enseignant/MesPresencesProf";
import { MessagesRoute } from "@/pages/eleve/MesMessages";
import { AnnoncesRoute } from "@/pages/eleve/MesAnnonces";
import MesNotes from "@/pages/eleve/MesNotes";
import {
  MesExamensPage,
  MesExercicesPage,
} from "@/pages/eleve/MesDevoirs";
const MesPresences = lazy(() => import("@/pages/eleve/MesPresences"));
import MesCompositions from "@/pages/eleve/MesCompositions";
import MesProfs from "@/pages/eleve/MesProfs";
import MonEmploiDuTempsPage from "@/pages/MonEmploiDuTempsPage";
import MonBulletin from "@/pages/eleve/MonBulletin";
import Enfants from "@/pages/parent/Enfants";
import EnfantNotes from "@/pages/parent/EnfantNotes";
const EnfantPresences = lazy(() => import("@/pages/parent/EnfantPresences"));
import EnfantBulletin from "@/pages/parent/EnfantBulletin";
import EnfantEmploiDuTemps from "@/pages/parent/EnfantEmploiDuTemps";
import {
  EnfantExamensPage,
  EnfantExercicesPage,
} from "@/pages/parent/EnfantDevoirs";
import EnfantCompositions from "@/pages/parent/EnfantCompositions";
import MotDePasseOublie from "@/pages/MotDePasseOublie";
import ReinitialiserMotDePasse from "@/pages/ReinitialiserMotDePasse";
import { useAuth } from "@/contexts/AuthContext";

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
    <Routes>
      <Route path="/connexion" element={<Connexion />} />
      <Route path="/mot-de-passe-oublie" element={<MotDePasseOublie />} />
      <Route
        path="/reinitialiser-mot-de-passe"
        element={<ReinitialiserMotDePasse />}
      />
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
      {/* public: opened by the QR code on bulletins, no login */}
      <Route
        path="/verifier"
        element={
          <Suspense fallback={null}>
            <VerifierDocument />
          </Suspense>
        }
      />

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
          path="/signalements"
          element={
            <RequireAuth roles={["school_admin", "super_admin"]}>
              <Signalements />
            </RequireAuth>
          }
        />
        <Route
          path="/periodes"
          element={
            <RequireAuth roles={["school_admin"]}>
              <Periodes />
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
              <Suspense fallback={<p className="text-slate-500">Chargement…</p>}>
                <Bulletins />
              </Suspense>
            </RequireAuth>
          }
        />
        <Route
          path="/cahier-ecole"
          element={
            <RequireAuth roles={["school_admin"]}>
              <Suspense fallback={<p className="text-slate-500">Chargement…</p>}>
                <CahierEcole />
              </Suspense>
            </RequireAuth>
          }
        />
        <Route
          path="/statistiques"
          element={
            <RequireAuth roles={["school_admin"]}>
              <Suspense fallback={<p className="text-slate-500">Chargement…</p>}>
                <Statistiques />
              </Suspense>
            </RequireAuth>
          }
        />
        <Route
          path="/cahier-de-textes"
          element={
            <RequireAuth roles={["teacher"]}>
              <Suspense fallback={<p className="text-slate-500">Chargement…</p>}>
                <CahierTextes />
              </Suspense>
            </RequireAuth>
          }
        />
        <Route
          path="/mon-cahier"
          element={
            <RequireAuth roles={["student"]}>
              <Suspense fallback={<p className="text-slate-500">Chargement…</p>}>
                <MonCahier />
              </Suspense>
            </RequireAuth>
          }
        />
        <Route
          path="/enfants/:id/cahier"
          element={
            <RequireAuth roles={["parent"]}>
              <Suspense fallback={<p className="text-slate-500">Chargement…</p>}>
                <EnfantCahier />
              </Suspense>
            </RequireAuth>
          }
        />
        <Route
          path="/presences-ecole"
          element={
            <RequireAuth roles={["school_admin"]}>
              <Suspense fallback={<p className="text-slate-500">Chargement…</p>}>
                <PresencesEcole />
              </Suspense>
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

        <Route path="/tableau-de-bord" element={<Dashboard />} />

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
              <Suspense fallback={<p className="text-slate-500">Chargement…</p>}>
                <Presences />
              </Suspense>
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
          path="/classes/:id/notes/:evalId"
          element={
            <RequireAuth roles={["teacher", "school_admin"]}>
              <NotesSaisie />
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
        <Route path="/messages" element={<MessagesRoute />} />
        <Route path="/annonces" element={<AnnoncesRoute />} />

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
              <Suspense fallback={<p className="text-slate-500">Chargement…</p>}>
                <MesPresences />
              </Suspense>
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
              <Suspense fallback={<p className="text-slate-500">Chargement…</p>}>
                <EnfantPresences />
              </Suspense>
            </RequireAuth>
          }
        />
        <Route
          path="/enfants/:id/bulletin"
          element={
            <RequireAuth roles={["parent"]}>
              <EnfantBulletin />
            </RequireAuth>
          }
        />
        <Route
          path="/enfants/:id/emploi-du-temps"
          element={
            <RequireAuth roles={["parent"]}>
              <EnfantEmploiDuTemps />
            </RequireAuth>
          }
        />
        <Route
          path="/enfants/:id/devoirs"
          element={
            <RequireAuth roles={["parent"]}>
              <EnfantExamensPage />
            </RequireAuth>
          }
        />
        <Route
          path="/enfants/:id/exercices"
          element={
            <RequireAuth roles={["parent"]}>
              <EnfantExercicesPage />
            </RequireAuth>
          }
        />
        <Route
          path="/enfants/:id/compositions"
          element={
            <RequireAuth roles={["parent"]}>
              <EnfantCompositions />
            </RequireAuth>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// A data router (instead of <BrowserRouter>) is required for useBlocker, used to warn
// about unsaved work (roll call). All the routes stay in <AppRoutes/> under a catch-all.
// Electron (file://) needs the hash router; the web uses the browser router.
const isDesktopFile =
  typeof window !== "undefined" && window.location.protocol === "file:";
const basename = import.meta.env.BASE_URL.replace(/\/$/, "") || undefined;
const routes = [{ path: "*", element: <AppRoutes /> }];
const router = isDesktopFile
  ? createHashRouter(routes)
  : createBrowserRouter(routes, { basename });

export default function App() {
  return <RouterProvider router={router} />;
}
