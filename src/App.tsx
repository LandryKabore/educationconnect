import { BrowserRouter, HashRouter, Navigate, Route, Routes } from "react-router-dom";
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
import AdminAudit from "@/pages/admin/AdminAudit";
import AdminBilling from "@/pages/admin/AdminBilling";
import AdminSuperAdmins from "@/pages/admin/AdminSuperAdmins";
import EcoleOverview from "@/pages/ecole/EcoleOverview";
import ConfigurationEcole from "@/pages/ecole/ConfigurationEcole";
import ParametresEcole from "@/pages/ecole/ParametresEcole";
import Annees from "@/pages/ecole/Annees";
import Classes from "@/pages/ecole/Classes";
import ProgrammeClasses from "@/pages/ecole/ProgrammeClasses";
import Matieres from "@/pages/ecole/Matieres";
import Eleves from "@/pages/ecole/Eleves";
import EleveDetail from "@/pages/ecole/EleveDetail";
import Enseignants from "@/pages/ecole/Enseignants";
import Parents from "@/pages/ecole/Parents";
import EmploisDuTemps from "@/pages/ecole/EmploisDuTemps";
import Bulletins from "@/pages/ecole/Bulletins";
import Dashboard from "@/pages/Dashboard";
import ClassDetail from "@/pages/enseignant/ClassDetail";
import Presences from "@/pages/enseignant/Presences";
import Notes from "@/pages/enseignant/Notes";
import Devoirs from "@/pages/enseignant/Devoirs";
import Messages from "@/pages/Messages";
import MesNotes from "@/pages/eleve/MesNotes";
import MesDevoirs from "@/pages/eleve/MesDevoirs";
import MesPresences from "@/pages/eleve/MesPresences";
import MonEmploiDuTemps from "@/pages/eleve/MonEmploiDuTemps";
import MonBulletin from "@/pages/eleve/MonBulletin";
import Enfants from "@/pages/parent/Enfants";
import EnfantNotes from "@/pages/parent/EnfantNotes";
import EnfantPresences from "@/pages/parent/EnfantPresences";
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
          path="/devoirs"
          element={
            <RequireAuth roles={["teacher"]}>
              <Devoirs />
            </RequireAuth>
          }
        />
        <Route path="/messages" element={<Messages />} />

        <Route
          path="/mes-notes"
          element={
            <RequireAuth roles={["student"]}>
              <MesNotes />
            </RequireAuth>
          }
        />
        <Route
          path="/mes-devoirs"
          element={
            <RequireAuth roles={["student"]}>
              <MesDevoirs />
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
          path="/mon-emploi-du-temps"
          element={
            <RequireAuth roles={["student"]}>
              <MonEmploiDuTemps />
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
