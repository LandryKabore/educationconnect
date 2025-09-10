import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";

export interface ChildInfo {
  id: string;
  name: string;
  class: string;
  grade_level: string;
  overall_grade: string;
  attendance: string;
  profile: any;
}

export interface ChildGrade {
  id: string;
  subject: string;
  grade: string;
  date: string;
  assignment: string;
}

export interface ChildExam {
  id: string;
  subject: string;
  date: string;
  time: string;
  topic: string;
}

export interface SchoolAnnouncement {
  id: string;
  title: string;
  message: string;
  date: string;
  urgent: boolean;
}

export const useParentData = () => {
  const [loading, setLoading] = useState(true);
  const [children, setChildren] = useState<ChildInfo[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [grades, setGrades] = useState<ChildGrade[]>([]);
  const [exams, setExams] = useState<ChildExam[]>([]);
  const [announcements, setAnnouncements] = useState<SchoolAnnouncement[]>([]);

  useEffect(() => {
    fetchParentData();
  }, []);

  useEffect(() => {
    if (selectedChildId) {
      fetchChildData(selectedChildId);
    }
  }, [selectedChildId]);

  const fetchParentData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch children through parent-student relationships
      const { data: relationships } = await supabase
        .from("parent_student_relationships")
        .select(`
          student_id,
          students(
            *,
            profiles(*),
            classes(name, grade_level)
          )
        `)
        .eq("parent_id", user.id);

      if (relationships && relationships.length > 0) {
        const childrenData = relationships.map(rel => {
          const student = rel.students;
          return {
            id: student.user_id,
            name: `${student.profiles?.first_name || 'Unknown'} ${student.profiles?.last_name || 'Student'}`,
            class: student.classes?.name || "Unknown Class",
            grade_level: student.classes?.grade_level || "Unknown Grade",
            overall_grade: "A-", // Will be calculated from actual grades
            attendance: "96%", // Will be calculated from actual attendance
            profile: student.profiles
          };
        });

        setChildren(childrenData);
        
        // Select first child by default
        if (childrenData.length > 0 && !selectedChildId) {
          setSelectedChildId(childrenData[0].id);
        }
      }

      // Fetch mock announcements (could be from a real announcements table)
      const mockAnnouncements: SchoolAnnouncement[] = [
        {
          id: "1",
          title: "Parent-Teacher Conference",
          message: "Scheduled for December 20th. Please confirm your attendance.",
          date: new Date().toLocaleDateString(),
          urgent: true
        },
        {
          id: "2",
          title: "Winter Break Schedule",
          message: "Classes will resume on January 8th, 2025.",
          date: new Date(Date.now() - 86400000).toLocaleDateString(),
          urgent: false
        }
      ];
      setAnnouncements(mockAnnouncements);

    } catch (error) {
      console.error("Error fetching parent data:", error);
      toast({
        title: "Error",
        description: "Failed to load parent data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchChildData = async (childId: string) => {
    try {
      // Fetch child's grades
      const { data: gradesData } = await supabase
        .from("grades")
        .select(`
          *,
          assignments(title, max_points, subjects(name))
        `)
        .eq("student_id", childId)
        .order("created_at", { ascending: false })
        .limit(10);

      if (gradesData) {
        const formattedGrades = gradesData.map(grade => ({
          id: grade.id,
          subject: grade.assignments?.subjects?.name || "Unknown",
          assignment: grade.assignments?.title || "Unknown Assignment",
          grade: calculateLetterGrade(grade.points_earned, grade.assignments?.max_points || 100),
          date: new Date(grade.created_at).toLocaleDateString()
        }));
        setGrades(formattedGrades);

        // Update child's overall grade
        const overallGrade = calculateOverallGrade(formattedGrades);
        setChildren(prev => 
          prev.map(child => 
            child.id === childId 
              ? { ...child, overall_grade: overallGrade }
              : child
          )
        );
      }

      // Fetch upcoming exams (assignments with future due dates)
      const { data: examsData } = await supabase
        .from("assignments")
        .select(`
          *,
          subjects(name),
          classes!inner(
            students!inner(user_id)
          )
        `)
        .eq("classes.students.user_id", childId)
        .gte("due_date", new Date().toISOString())
        .order("due_date", { ascending: true })
        .limit(5);

      if (examsData) {
        const formattedExams = examsData.map(exam => ({
          id: exam.id,
          subject: exam.subjects?.name || "Unknown Subject",
          date: new Date(exam.due_date).toLocaleDateString(),
          time: new Date(exam.due_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          topic: exam.title
        }));
        setExams(formattedExams);
      }

      // Calculate attendance
      const { data: attendanceData } = await supabase
        .from("attendance")
        .select("status")
        .eq("student_id", childId);

      if (attendanceData && attendanceData.length > 0) {
        const presentDays = attendanceData.filter(att => att.status === "present").length;
        const attendanceRate = `${Math.round((presentDays / attendanceData.length) * 100)}%`;
        
        setChildren(prev => 
          prev.map(child => 
            child.id === childId 
              ? { ...child, attendance: attendanceRate }
              : child
          )
        );
      }

    } catch (error) {
      console.error("Error fetching child data:", error);
      toast({
        title: "Error",
        description: "Failed to load child data",
        variant: "destructive"
      });
    }
  };

  const calculateLetterGrade = (points: number, maxPoints: number): string => {
    const percentage = (points / maxPoints) * 100;
    if (percentage >= 97) return "A+";
    if (percentage >= 93) return "A";
    if (percentage >= 90) return "A-";
    if (percentage >= 87) return "B+";
    if (percentage >= 83) return "B";
    if (percentage >= 80) return "B-";
    if (percentage >= 77) return "C+";
    if (percentage >= 73) return "C";
    if (percentage >= 70) return "C-";
    return "F";
  };

  const calculateOverallGrade = (grades: ChildGrade[]): string => {
    if (grades.length === 0) return "N/A";
    
    // Simple average for now - could be weighted by subject importance
    const gradeValues = grades.map(grade => {
      switch (grade.grade.charAt(0)) {
        case 'A': return 4.0;
        case 'B': return 3.0;
        case 'C': return 2.0;
        case 'D': return 1.0;
        default: return 0.0;
      }
    });

    const average = gradeValues.reduce((sum, val) => sum + val, 0) / gradeValues.length;
    
    if (average >= 3.7) return "A";
    if (average >= 3.0) return "B";
    if (average >= 2.0) return "C";
    return "D";
  };

  const currentChild = children.find(child => child.id === selectedChildId);

  return {
    loading,
    children,
    currentChild,
    selectedChildId,
    setSelectedChildId,
    grades,
    exams,
    announcements,
    refetch: fetchParentData
  };
};