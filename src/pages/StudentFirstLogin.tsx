import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { StudentFirstLogin } from "@/components/StudentFirstLogin";

export default function StudentFirstLoginPage() {
  const navigate = useNavigate();
  const [studentInfo, setStudentInfo] = useState(null);

  useEffect(() => {
    // Get student info from localStorage (set during temp login)
    const storedInfo = localStorage.getItem('student_first_login');
    if (storedInfo) {
      setStudentInfo(JSON.parse(storedInfo));
    } else {
      // No stored info, redirect to auth
      navigate('/auth', { replace: true });
    }
  }, [navigate]);

  const handleComplete = () => {
    // Clear stored info
    localStorage.removeItem('student_first_login');
    navigate('/auth', { replace: true });
  };

  if (!studentInfo) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return <StudentFirstLogin studentInfo={studentInfo} onComplete={handleComplete} />;
}