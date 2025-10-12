import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface StudentGrade {
  student_name: string;
  student_no: string;
  assignment_title: string;
  subject_name: string;
  score: number;
  max_score: number;
  percentage: number;
  graded_at: string;
  comment?: string;
  type: 'assignment' | 'exam';
}

interface ClassSection {
  id: string;
  name: string;
  grade_level: string;
}

export function AllGradesModal() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [grades, setGrades] = useState<StudentGrade[]>([]);
  const [classes, setClasses] = useState<ClassSection[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>("all");

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open]);

  useEffect(() => {
    if (open && classes.length > 0) {
      fetchGrades(selectedClass);
    }
  }, [selectedClass]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch teacher's classes
      const { data: teachingAssignments } = await supabase
        .from("teaching_assignments")
        .select(`
          class_sections(id, name, grade_level)
        `)
        .eq("teacher_user_id", user.id);

      if (teachingAssignments) {
        const uniqueClasses = Array.from(
          new Map(
            teachingAssignments
              .filter(ta => ta.class_sections)
              .map(ta => [ta.class_sections!.id, ta.class_sections!])
          ).values()
        ) as ClassSection[];
        setClasses(uniqueClasses);
      }

      // Fetch grades
      await fetchGrades("all");
    } catch (error) {
      console.error("Error fetching data:", error);
      toast({
        title: "Error",
        description: "Failed to load grades data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchGrades = async (classId: string) => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get class IDs to filter
      const classIdsToFetch = classId === "all" 
        ? classes.map(c => c.id)
        : [classId];

      if (classIdsToFetch.length === 0) {
        setGrades([]);
        return;
      }

      const allGrades: StudentGrade[] = [];

      // 1. Fetch ASSIGNMENT grades
      const { data: assignments } = await supabase
        .from("assignments")
        .select("id, title, class_id, teacher_id, subjects(name)")
        .eq("teacher_id", user.id)
        .in("class_id", classIdsToFetch);

      if (assignments && assignments.length > 0) {
        const assignmentIds = assignments.map(a => a.id);
        
        const { data: assignmentGrades } = await supabase
          .from("grades")
          .select("points_earned, assignment_id, student_id, graded_at, feedback, assignments(max_points)")
          .in("assignment_id", assignmentIds)
          .order("graded_at", { ascending: false });

        if (assignmentGrades && assignmentGrades.length > 0) {
          const studentIds = [...new Set(assignmentGrades.map(g => g.student_id))];
          
          const { data: profiles } = await supabase
            .from("profiles")
            .select("user_id, first_name, last_name")
            .in("user_id", studentIds);

          const { data: studentProfiles } = await supabase
            .from("student_profiles")
            .select("user_id, student_no")
            .in("user_id", studentIds);

          const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
          const studentProfileMap = new Map(studentProfiles?.map(sp => [sp.user_id, sp]) || []);
          const assignmentMap = new Map(assignments.map(a => [a.id, a]));

          assignmentGrades.forEach((grade) => {
            const profile = profileMap.get(grade.student_id);
            const studentProfile = studentProfileMap.get(grade.student_id);
            const assignment = assignmentMap.get(grade.assignment_id);
            const maxPoints = grade.assignments?.max_points || 100;
            const percentage = ((grade.points_earned / maxPoints) * 100).toFixed(1);
            
            allGrades.push({
              student_name: `${profile?.first_name || 'Unknown'} ${profile?.last_name || 'Student'}`,
              student_no: studentProfile?.student_no || 'N/A',
              assignment_title: assignment?.title || 'Unknown Assignment',
              subject_name: assignment?.subjects?.name || 'N/A',
              score: grade.points_earned,
              max_score: maxPoints,
              percentage: parseFloat(percentage),
              graded_at: new Date(grade.graded_at).toLocaleDateString(),
              comment: grade.feedback,
              type: 'assignment'
            });
          });
        }
      }

      // 2. Fetch EXAM grades
      const { data: exams } = await supabase
        .from("exams")
        .select("id, title, class_section_id, subjects(name)")
        .in("class_section_id", classIdsToFetch);

      if (exams && exams.length > 0) {
        const examIds = exams.map(e => e.id);
        
        const { data: examGrades } = await supabase
          .from("enhanced_grades")
          .select("score, max_score, comment, created_at, student_user_id, exam_id")
          .in("exam_id", examIds)
          .order("created_at", { ascending: false });

        if (examGrades && examGrades.length > 0) {
          const studentIds = [...new Set(examGrades.map(g => g.student_user_id))];
          
          const { data: profiles } = await supabase
            .from("profiles")
            .select("user_id, first_name, last_name")
            .in("user_id", studentIds);

          const { data: studentProfiles } = await supabase
            .from("student_profiles")
            .select("user_id, student_no")
            .in("user_id", studentIds);

          const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
          const studentProfileMap = new Map(studentProfiles?.map(sp => [sp.user_id, sp]) || []);
          const examMap = new Map(exams.map(e => [e.id, e]));

          examGrades.forEach((grade) => {
            const profile = profileMap.get(grade.student_user_id);
            const studentProfile = studentProfileMap.get(grade.student_user_id);
            const exam = examMap.get(grade.exam_id);
            const percentage = ((grade.score / grade.max_score) * 100).toFixed(1);
            
            allGrades.push({
              student_name: `${profile?.first_name || 'Unknown'} ${profile?.last_name || 'Student'}`,
              student_no: studentProfile?.student_no || 'N/A',
              assignment_title: exam?.title || 'Unknown Exam',
              subject_name: exam?.subjects?.name || 'N/A',
              score: grade.score,
              max_score: grade.max_score,
              percentage: parseFloat(percentage),
              graded_at: new Date(grade.created_at).toLocaleDateString(),
              comment: grade.comment,
              type: 'exam'
            });
          });
        }
      }

      // Sort all grades by date (most recent first)
      allGrades.sort((a, b) => new Date(b.graded_at).getTime() - new Date(a.graded_at).getTime());
      
      setGrades(allGrades);
    } catch (error: any) {
      console.error("Error fetching grades:", error);
      toast({
        title: "Error",
        description: error?.message || "Failed to load grades",
        variant: "destructive"
      });
      setGrades([]);
    } finally {
      setLoading(false);
    }
  };

  const getGradeColor = (percentage: number) => {
    if (percentage >= 80) return "text-green-400";
    if (percentage >= 60) return "text-yellow-400";
    return "text-red-400";
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-16 flex-col bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white border-0">
          <TrendingUp className="w-5 h-5 mb-1" />
          View All Grades
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Student Grades Overview</DialogTitle>
          <DialogDescription>
            View and filter all student grades across your classes
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Select value={selectedClass} onValueChange={setSelectedClass}>
              <SelectTrigger className="w-[250px]">
                <SelectValue placeholder="Filter by class" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {classes.map((cls) => (
                  <SelectItem key={cls.id} value={cls.id}>
                    {cls.name} - Grade {cls.grade_level}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-sm text-muted-foreground">
              Total: {grades.length} grades
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : grades.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No grades found
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Student No</TableHead>
                    <TableHead>Assignment/Exam</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead className="text-right">Percentage</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grades.map((grade, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{grade.student_name}</TableCell>
                      <TableCell>{grade.student_no}</TableCell>
                      <TableCell>{grade.assignment_title}</TableCell>
                      <TableCell>{grade.subject_name}</TableCell>
                      <TableCell className="text-right">
                        {grade.score}/{grade.max_score}
                      </TableCell>
                      <TableCell className={`text-right font-semibold ${getGradeColor(grade.percentage)}`}>
                        {grade.percentage}%
                      </TableCell>
                      <TableCell>{grade.graded_at}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
