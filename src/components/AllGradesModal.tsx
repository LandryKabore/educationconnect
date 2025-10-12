import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface StudentGrade {
  student_name: string;
  student_no: string;
  exam_title: string;
  subject_name: string;
  score: number;
  max_score: number;
  percentage: number;
  graded_at: string;
  comment?: string;
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

      // Fetch exams for the selected classes
      const { data: teacherExams, error: examsError } = await supabase
        .from("exams")
        .select("id, title, class_section_id, subjects(name)")
        .in("class_section_id", classIdsToFetch);

      if (examsError) {
        console.error("Error fetching exams:", examsError);
        throw examsError;
      }

      if (!teacherExams || teacherExams.length === 0) {
        setGrades([]);
        return;
      }

      const examIds = teacherExams.map(e => e.id);

      // Fetch grades for those exams
      const { data: gradesData, error: gradesError } = await supabase
        .from("enhanced_grades")
        .select("score, max_score, comment, created_at, student_user_id, exam_id")
        .in("exam_id", examIds)
        .order("created_at", { ascending: false });

      if (gradesError) {
        console.error("Error fetching grades:", gradesError);
        throw gradesError;
      }

      if (!gradesData || gradesData.length === 0) {
        setGrades([]);
        return;
      }

      // Get unique student IDs
      const studentIds = [...new Set(gradesData.map(g => g.student_user_id))];

      // Fetch student data
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name")
        .in("user_id", studentIds);

      if (profilesError) {
        console.error("Error fetching profiles:", profilesError);
      }

      const { data: studentProfiles, error: studentProfilesError } = await supabase
        .from("student_profiles")
        .select("user_id, student_no")
        .in("user_id", studentIds);

      if (studentProfilesError) {
        console.error("Error fetching student profiles:", studentProfilesError);
      }

      // Create lookup maps
      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
      const studentProfileMap = new Map(studentProfiles?.map(sp => [sp.user_id, sp]) || []);
      const examMap = new Map(teacherExams.map(e => [e.id, e]));

      const formattedGrades: StudentGrade[] = gradesData.map((grade) => {
        const profile = profileMap.get(grade.student_user_id);
        const studentProfile = studentProfileMap.get(grade.student_user_id);
        const exam = examMap.get(grade.exam_id);
        const percentage = ((grade.score / grade.max_score) * 100).toFixed(1);
        
        return {
          student_name: `${profile?.first_name || 'Unknown'} ${profile?.last_name || 'Student'}`,
          student_no: studentProfile?.student_no || 'N/A',
          exam_title: exam?.title || 'Unknown Exam',
          subject_name: exam?.subjects?.name || 'N/A',
          score: grade.score,
          max_score: grade.max_score,
          percentage: parseFloat(percentage),
          graded_at: new Date(grade.created_at).toLocaleDateString(),
          comment: grade.comment
        };
      });

      setGrades(formattedGrades);
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
                    <TableHead>Exam</TableHead>
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
                      <TableCell>{grade.exam_title}</TableCell>
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
