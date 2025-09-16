import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TeacherFirstLogin } from "@/components/TeacherFirstLogin";

const title = "Complete Setup | EduConnect";
const description = "Complete your teacher account setup with email and password.";

export default function TeacherFirstLoginPage() {
  const navigate = useNavigate();
  const [teacherInfo, setTeacherInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // SEO
    document.title = title;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute("content", description);
    
    // Check for teacher first login data
    const storedData = localStorage.getItem('teacher_first_login');
    if (!storedData) {
      navigate('/auth', { replace: true });
      return;
    }

    try {
      const data = JSON.parse(storedData);
      setTeacherInfo(data);
    } catch (error) {
      console.error('Error parsing teacher data:', error);
      navigate('/auth', { replace: true });
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  const handleComplete = () => {
    localStorage.removeItem('teacher_first_login');
    navigate('/auth', { replace: true });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!teacherInfo) {
    return null;
  }

  return (
    <TeacherFirstLogin 
      teacherInfo={teacherInfo} 
      onComplete={handleComplete}
    />
  );
}