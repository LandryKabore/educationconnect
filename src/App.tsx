import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Auth from "./pages/Auth";
import ParentDashboard from "./pages/ParentDashboard";
import TeacherDashboard from "./pages/TeacherDashboard";
import TeacherAssignment from "./pages/TeacherAssignment";
import StudentDashboard from "./pages/StudentDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import TeacherFirstLogin from "./pages/TeacherFirstLogin";
import StudentFirstLogin from "./pages/StudentFirstLogin";
import StudentClassSelection from "./pages/StudentClassSelection";
import UsernameLogin from "./pages/UsernameLogin";
import CompleteStudentSetup from "./pages/CompleteStudentSetup";
import NotFound from "./pages/NotFound";
import { RequireAuth } from "./components/RequireAuth";

const App = () => (
  <TooltipProvider>
    <Toaster />
    <Sonner />
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/login" element={<Login />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/parent-dashboard" element={<RequireAuth><ParentDashboard /></RequireAuth>} />
        <Route path="/teacher-dashboard" element={<RequireAuth><TeacherDashboard /></RequireAuth>} />
        <Route path="/teacher-assignment" element={<RequireAuth><TeacherAssignment /></RequireAuth>} />
        <Route path="/teacher-first-login" element={<TeacherFirstLogin />} />
        <Route path="/student-first-login" element={<StudentFirstLogin />} />
        <Route path="/username-login" element={<UsernameLogin />} />
        <Route path="/complete-student-setup" element={<CompleteStudentSetup />} />
        <Route path="/student-class-selection" element={<StudentClassSelection />} />
        <Route path="/student-dashboard" element={<RequireAuth><StudentDashboard /></RequireAuth>} />
        <Route path="/admin-dashboard" element={<AdminDashboard />} />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  </TooltipProvider>
);

export default App;
