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

export interface ClassAttendance {
  className: string;
  subjectName: string;
  presentDays: number;
  totalDays: number;
  percentage: number;
  missedDates: { date: string; status: string }[];
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
  const [classAttendance, setClassAttendance] = useState<ClassAttendance[]>([]);
  const [parentInfo, setParentInfo] = useState<{
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    createdAt?: string;
  } | null>(null);

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

      // Fetch parent profile information
      const { data: parentProfile } = await supabase
        .from("profiles")
        .select("first_name, last_name, email, phone, created_at")
        .eq("user_id", user.id)
        .single();

      if (parentProfile) {
        setParentInfo({
          firstName: parentProfile.first_name || "Parent",
          lastName: parentProfile.last_name || "",
          email: parentProfile.email,
          phone: parentProfile.phone || undefined,
          createdAt: new Date(parentProfile.created_at).toLocaleDateString(),
        });
      }

      // Fetch children through parent-student links
      const { data: relationships } = await supabase
        .from("parent_student_links")
        .select("student_user_id")
        .eq("parent_user_id", user.id)
        .eq("status", "active");

      if (relationships && relationships.length > 0) {
        // Fetch student profiles separately
        const studentIds = relationships.map(rel => rel.student_user_id);
        
        const { data: studentProfiles } = await supabase
          .from("profiles")
          .select("*")
          .in("user_id", studentIds);

        // Fetch enrollments to get class section info
        const { data: enrollmentsData } = await supabase
          .from("enrollments")
          .select(`
            student_user_id,
            class_section_id,
            class_sections(name, grade_level)
          `)
          .in("student_user_id", studentIds)
          .eq("status", "active");

        const childrenData = relationships.map(rel => {
          const profile = studentProfiles?.find(p => p.user_id === rel.student_user_id);
          const enrollment = enrollmentsData?.find(e => e.student_user_id === rel.student_user_id);
          const classSection = enrollment?.class_sections;
          
          return {
            id: rel.student_user_id,
            name: `${profile?.first_name || 'Unknown'} ${profile?.last_name || 'Student'}`,
            class: classSection?.name || "No class assigned",
            grade_level: classSection?.grade_level || "N/A",
            overall_grade: "A-", // Will be calculated from actual grades
            attendance: "96%", // Will be calculated from actual attendance
            profile: profile
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
      // Fetch child's assignment grades from grades table
      const { data: assignmentGrades, error: assignmentError } = await supabase
        .from("grades")
        .select(`
          *,
          assignment_id,
          assignments(
            title,
            max_points,
            subject_id,
            subjects(name)
          )
        `)
        .eq("student_id", childId)
        .order("graded_at", { ascending: false })
        .limit(10);

      console.log("Assignment grades data:", assignmentGrades);
      console.log("Assignment grades error:", assignmentError);

      // Fetch child's exam grades from enhanced_grades
      const { data: examGrades, error: examError } = await supabase
        .from("enhanced_grades")
        .select(`
          *,
          exams(
            title,
            max_score,
            subject_id,
            subjects(name)
          )
        `)
        .eq("student_user_id", childId)
        .order("created_at", { ascending: false })
        .limit(10);

      console.log("Exam grades data:", examGrades);
      console.log("Exam grades error:", examError);

      // Combine and format all grades
      const allGrades: ChildGrade[] = [];

      // Add assignment grades
      if (assignmentGrades) {
        assignmentGrades.forEach(grade => {
          if (grade.points_earned !== null && grade.assignments) {
            allGrades.push({
              id: grade.id,
              subject: grade.assignments?.subjects?.name || "Unknown",
              assignment: grade.assignments?.title || "Unknown Assignment",
              grade: calculateLetterGrade(grade.points_earned, grade.assignments.max_points),
              date: new Date(grade.graded_at || grade.created_at).toLocaleDateString()
            });
          }
        });
      }

      // Add exam grades
      if (examGrades) {
        examGrades.forEach(grade => {
          allGrades.push({
            id: grade.id,
            subject: grade.exams?.subjects?.name || "Unknown",
            assignment: grade.exams?.title || "Unknown Exam",
            grade: calculateLetterGrade(grade.score, grade.max_score),
            date: new Date(grade.created_at).toLocaleDateString()
          });
        });
      }

      // Sort by date (most recent first)
      allGrades.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      setGrades(allGrades);

      // Update child's overall grade
      const overallGrade = calculateOverallGrade(allGrades);
      setChildren(prev => 
        prev.map(child => 
          child.id === childId 
            ? { ...child, overall_grade: overallGrade }
            : child
        )
      );
    

      // Fetch upcoming exams for the child's enrolled classes
      const { data: enrollmentsData } = await supabase
        .from("enrollments")
        .select("class_section_id")
        .eq("student_user_id", childId)
        .eq("status", "active");

      if (enrollmentsData && enrollmentsData.length > 0) {
        const classSectionIds = enrollmentsData.map(e => e.class_section_id);
        
        console.log("Parent - Class section IDs for exams:", classSectionIds);
        console.log("Parent - Looking for exams >= ", new Date().toISOString().split('T')[0]);
        
        const { data: examsData, error: examsError } = await supabase
          .from("exams")
          .select(`
            *,
            subjects(name)
          `)
          .in("class_section_id", classSectionIds)
          .gte("exam_date", new Date().toISOString().split('T')[0])
          .order("exam_date", { ascending: true })
          .limit(5);

        console.log("Parent - Exams data:", examsData);
        console.log("Parent - Exams error:", examsError);

        if (examsData) {
          const formattedExams = examsData.map(exam => ({
            id: exam.id,
            subject: exam.subjects?.name || "Unknown Subject",
            date: new Date(exam.exam_date).toLocaleDateString(),
            time: "TBD",
            topic: exam.title
          }));
          setExams(formattedExams);
          console.log("Parent - Formatted exams:", formattedExams);
        }
      } else {
        console.log("Parent - No enrollments found for child:", childId);
      }

      // Calculate attendance from enhanced_attendance
      const { data: attendanceData } = await supabase
        .from("enhanced_attendance")
        .select(`
          status,
          date,
          class_section_id,
          class_sections(
            name,
            grade_level
          )
        `)
        .eq("student_user_id", childId)
        .order("date", { ascending: false });

      if (attendanceData && attendanceData.length > 0) {
        const presentDays = attendanceData.filter(att => att.status === "present").length;
        const attendanceRate = `${Math.round((presentDays / attendanceData.length) * 100)}%`;
        
        // Group attendance by class section
        const attendanceByClass = new Map<string, { 
          present: number; 
          total: number; 
          className: string;
          missedDates: { date: string; status: string }[];
        }>();
        
        attendanceData.forEach(att => {
          const classId = att.class_section_id;
          const className = att.class_sections?.name || "Unknown Class";
          
          if (!attendanceByClass.has(classId)) {
            attendanceByClass.set(classId, { present: 0, total: 0, className, missedDates: [] });
          }
          
          const classData = attendanceByClass.get(classId)!;
          classData.total++;
          if (att.status === "present") {
            classData.present++;
          } else {
            classData.missedDates.push({
              date: new Date(att.date).toLocaleDateString(),
              status: att.status
            });
          }
        });

        // Fetch subjects for each class section
        const classAttendanceData: ClassAttendance[] = [];
        for (const [classId, data] of attendanceByClass.entries()) {
          const { data: subjectData } = await supabase
            .from("class_section_subjects")
            .select("subjects(name)")
            .eq("class_section_id", classId)
            .limit(1)
            .single();

          classAttendanceData.push({
            className: data.className,
            subjectName: subjectData?.subjects?.name || "General",
            presentDays: data.present,
            totalDays: data.total,
            percentage: (data.present / data.total) * 100,
            missedDates: data.missedDates,
          });
        }

        setClassAttendance(classAttendanceData);
        
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

  const calculateLetterGrade = (score: number, maxScore: number): string => {
    const percentage = (score / maxScore) * 100;
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
    classAttendance,
    parentInfo,
    refetch: fetchParentData
  };
};