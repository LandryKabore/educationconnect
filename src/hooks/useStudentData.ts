import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";

export interface StudentGrade {
  id: string;
  subject: string;
  assignment: string;
  grade: string;
  date: string;
  points_earned: number;
  max_points: number;
}

export interface StudentAttendance {
  id: string;
  date: string;
  status: string;
  class_name: string;
}

export interface StudentAssignment {
  id: string;
  title: string;
  description: string;
  due_date: string;
  subject: string;
  max_points: number;
}

export const useStudentData = () => {
  const [loading, setLoading] = useState(true);
  const [studentInfo, setStudentInfo] = useState<any>(null);
  const [grades, setGrades] = useState<StudentGrade[]>([]);
  const [attendance, setAttendance] = useState<StudentAttendance[]>([]);
  const [assignments, setAssignments] = useState<StudentAssignment[]>([]);

  useEffect(() => {
    fetchStudentData();
  }, []);

  const fetchStudentData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch student profile and info
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();

      const { data: student } = await supabase
        .from("student_profiles")
        .select(`
          *,
          schools(name)
        `)
        .eq("user_id", user.id)
        .maybeSingle();

      // Fetch student enrollment to get class information
      const { data: enrollment } = await supabase
        .from("enrollments")
        .select(`
          *,
          class_sections(name, grade_level)
        `)
        .eq("student_user_id", user.id)
        .maybeSingle();

      // Fetch teachers for the student's class
      let teachers = [];
      let subjects = [];
      if (enrollment?.class_section_id) {
        const { data: teachingAssignments } = await supabase
          .from("teaching_assignments")
          .select(`
            *,
            teacher_user_id,
            subjects(id, name, code),
            profiles!teaching_assignments_teacher_user_id_fkey(first_name, last_name)
          `)
          .eq("class_section_id", enrollment.class_section_id);

        teachers = teachingAssignments || [];
        
        // Get unique subjects for this class
        const { data: classSubjects } = await supabase
          .from("class_section_subjects")
          .select(`
            subjects(id, name, code)
          `)
          .eq("class_section_id", enrollment.class_section_id);

        subjects = classSubjects?.map(cs => cs.subjects).filter(Boolean) || [];
      }

      setStudentInfo({ profile, student, enrollment, teachers, subjects });

      if (student) {
        // Fetch grades with assignment and subject info
        const { data: gradesData } = await supabase
          .from("grades")
          .select(`
            *,
            assignments(title, max_points, subjects(name))
          `)
          .eq("student_id", user.id)
          .order("created_at", { ascending: false })
          .limit(10);

        if (gradesData) {
          const formattedGrades = gradesData.map(grade => ({
            id: grade.id,
            subject: grade.assignments?.subjects?.name || "Unknown",
            assignment: grade.assignments?.title || "Unknown Assignment",
            grade: calculateLetterGrade(grade.points_earned, grade.assignments?.max_points || 100),
            date: new Date(grade.created_at).toLocaleDateString(),
            points_earned: grade.points_earned || 0,
            max_points: grade.assignments?.max_points || 100
          }));
          setGrades(formattedGrades);
        }

        // Fetch attendance
        const { data: attendanceData } = await supabase
          .from("attendance")
          .select(`
            *,
            classes(name)
          `)
          .eq("student_id", user.id)
          .order("date", { ascending: false })
          .limit(30);

        if (attendanceData) {
          const formattedAttendance = attendanceData.map(att => ({
            id: att.id,
            date: new Date(att.date).toLocaleDateString(),
            status: att.status,
            class_name: att.classes?.name || "Unknown Class"
          }));
          setAttendance(formattedAttendance);
        }

        // Get student's enrolled classes first
        const { data: enrollments } = await supabase
          .from("enrollments")
          .select("class_section_id")
          .eq("student_user_id", user.id);

        const classSectionIds = enrollments?.map(e => e.class_section_id) || [];

        // Fetch upcoming assignments
        const { data: assignmentsData } = await supabase
          .from("assignments")
          .select(`
            *,
            subjects(name)
          `)
          .in("class_id", classSectionIds)
          .gte("due_date", new Date().toISOString())
          .order("due_date", { ascending: true })
          .limit(10);

        if (assignmentsData) {
          const formattedAssignments = assignmentsData.map(assignment => ({
            id: assignment.id,
            title: assignment.title,
            description: assignment.description || "",
            due_date: new Date(assignment.due_date).toLocaleDateString(),
            subject: assignment.subjects?.name || "Unknown Subject",
            max_points: assignment.max_points || 100
          }));
          setAssignments(formattedAssignments);
        }
      }
    } catch (error) {
      console.error("Error fetching student data:", error);
      toast({
        title: "Error",
        description: "Failed to load student data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
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
    if (percentage >= 67) return "D+";
    if (percentage >= 65) return "D";
    return "F";
  };

  const calculateGPA = (): string => {
    if (grades.length === 0) return "0.0";
    
    const gradePoints = grades.map(grade => {
      const percentage = (grade.points_earned / grade.max_points) * 100;
      if (percentage >= 97) return 4.0;
      if (percentage >= 93) return 4.0;
      if (percentage >= 90) return 3.7;
      if (percentage >= 87) return 3.3;
      if (percentage >= 83) return 3.0;
      if (percentage >= 80) return 2.7;
      if (percentage >= 77) return 2.3;
      if (percentage >= 73) return 2.0;
      if (percentage >= 70) return 1.7;
      if (percentage >= 67) return 1.3;
      if (percentage >= 65) return 1.0;
      return 0.0;
    });

    const avgGPA = gradePoints.reduce((sum, gpa) => sum + gpa, 0) / gradePoints.length;
    return avgGPA.toFixed(1);
  };

  const calculateAttendanceRate = (): string => {
    if (attendance.length === 0) return "0%";
    
    const presentDays = attendance.filter(att => att.status === "present").length;
    const rate = (presentDays / attendance.length) * 100;
    return `${Math.round(rate)}%`;
  };

  return {
    loading,
    studentInfo,
    grades,
    attendance,
    assignments,
    gpa: calculateGPA(),
    attendanceRate: calculateAttendanceRate(),
    refetch: fetchStudentData
  };
};