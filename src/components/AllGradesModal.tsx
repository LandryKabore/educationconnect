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

      let query = supabase
        .from("enhanced_grades")
        .select(`
          score,
          max_score,
          comment,
          created_at,
          student_user_id,
          exams(
            title,
            subjects(name)
          ),
          profiles!enhanced_grades_student_user_id_fkey(
            first_name,
            last_name
          ),
          student_profiles!enhanced_grades_student_user_id_fkey(
            student_no
          )
        `)
        .order("created_at", { ascending: false });

      // If specific class selected, filter by class
      if (classId !== "all") {
        query = query.eq("exams.class_section_id", classId);
      }

      const { data: gradesData, error } = await query;

      if (error) throw error;

      const formattedGrades: StudentGrade[] = (gradesData || []).map((grade: any) => {
        const percentage = ((grade.score / grade.max_score) * 100).toFixed(1);
        return {
          student_name: `${grade.profiles?.first_name || 'Unknown'} ${grade.profiles?.last_name || 'Student'}`,
          student_no: grade.student_profiles?.student_no || 'N/A',
          exam_title: grade.exams?.title || 'Unknown Exam',
          subject_name: grade.exams?.subjects?.name || 'N/A',
          score: grade.score,
          max_score: grade.max_score,
          percentage: parseFloat(percentage),
          graded_at: new Date(grade.created_at).toLocaleDateString(),
          comment: grade.comment
        };
      });

      setGrades(formattedGrades);
    } catch (error) {
      console.error("Error fetching grades:", error);
      toast({
        title: "Error",
        description: "Failed to load grades",
        variant: "destructive"
      });
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
