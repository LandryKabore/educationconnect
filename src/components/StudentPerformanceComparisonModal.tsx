import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp, Award, Users } from "lucide-react";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface StudentPerformanceComparisonModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentUserId: string;
  studentName: string;
}

interface PerformanceData {
  subject: string;
  studentAttendance: number;
  classAvgAttendance: number;
  studentGrade: number;
  classAvgGrade: number;
}

export const StudentPerformanceComparisonModal = ({
  open,
  onOpenChange,
  studentUserId,
  studentName,
}: StudentPerformanceComparisonModalProps) => {
  const [loading, setLoading] = useState(true);
  const [performanceData, setPerformanceData] = useState<PerformanceData[]>([]);

  useEffect(() => {
    if (open && studentUserId) {
      fetchPerformanceData();
    }
  }, [open, studentUserId]);

  const fetchPerformanceData = async () => {
    try {
      setLoading(true);

      // Get student's enrollments to find their classes
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("class_section_id")
        .eq("student_user_id", studentUserId);

      if (!enrollments || enrollments.length === 0) {
        setPerformanceData([]);
        setLoading(false);
        return;
      }

      const classSectionIds = enrollments.map(e => e.class_section_id);

      // Get teaching assignments (subjects) for these classes
      const { data: teachingAssignments } = await supabase
        .from("teaching_assignments")
        .select(`
          subject_id,
          class_section_id,
          subjects(name)
        `)
        .in("class_section_id", classSectionIds);

      if (!teachingAssignments || teachingAssignments.length === 0) {
        setPerformanceData([]);
        setLoading(false);
        return;
      }

      const performanceBySubject: PerformanceData[] = [];

      for (const assignment of teachingAssignments) {
        const subjectId = assignment.subject_id;
        const classSectionId = assignment.class_section_id;
        const subjectName = assignment.subjects?.name || "Unknown";

        // Get all students in this class
        const { data: classStudents } = await supabase
          .from("enrollments")
          .select("student_user_id")
          .eq("class_section_id", classSectionId);

        if (!classStudents || classStudents.length === 0) continue;

        const studentIds = classStudents.map(s => s.student_user_id);

        // Calculate attendance averages
        const { data: attendanceRecords } = await supabase
          .from("enhanced_attendance")
          .select("student_user_id, status")
          .eq("class_section_id", classSectionId)
          .eq("subject_id", subjectId)
          .in("student_user_id", studentIds);

        let studentAttendance = 0;
        let classAvgAttendance = 0;

        if (attendanceRecords && attendanceRecords.length > 0) {
          // Calculate per-student attendance rates
          const attendanceByStudent = new Map<string, { present: number; total: number }>();
          
          attendanceRecords.forEach(record => {
            if (!attendanceByStudent.has(record.student_user_id)) {
              attendanceByStudent.set(record.student_user_id, { present: 0, total: 0 });
            }
            const studentData = attendanceByStudent.get(record.student_user_id)!;
            studentData.total++;
            if (record.status === "present" || record.status === "late" || record.status === "excused") {
              studentData.present++;
            }
          });

          // Get this student's attendance
          const thisStudentData = attendanceByStudent.get(studentUserId);
          if (thisStudentData) {
            studentAttendance = (thisStudentData.present / thisStudentData.total) * 100;
          }

          // Calculate class average (excluding this student for privacy)
          const otherStudents = Array.from(attendanceByStudent.entries())
            .filter(([id]) => id !== studentUserId);
          
          if (otherStudents.length > 0) {
            const avgSum = otherStudents.reduce((sum, [, data]) => {
              return sum + (data.present / data.total) * 100;
            }, 0);
            classAvgAttendance = avgSum / otherStudents.length;
          }
        }

        // Calculate grade averages
        const { data: gradeRecords } = await supabase
          .from("enhanced_grades")
          .select(`
            student_user_id,
            score,
            max_score,
            exams!inner(subject_id, class_section_id)
          `)
          .eq("exams.class_section_id", classSectionId)
          .eq("exams.subject_id", subjectId)
          .in("student_user_id", studentIds);

        let studentGrade = 0;
        let classAvgGrade = 0;

        if (gradeRecords && gradeRecords.length > 0) {
          // Calculate per-student grade averages
          const gradesByStudent = new Map<string, { totalScore: number; totalMax: number }>();
          
          gradeRecords.forEach(record => {
            if (!gradesByStudent.has(record.student_user_id)) {
              gradesByStudent.set(record.student_user_id, { totalScore: 0, totalMax: 0 });
            }
            const studentData = gradesByStudent.get(record.student_user_id)!;
            studentData.totalScore += record.score;
            studentData.totalMax += record.max_score;
          });

          // Get this student's grade
          const thisStudentGrade = gradesByStudent.get(studentUserId);
          if (thisStudentGrade) {
            studentGrade = (thisStudentGrade.totalScore / thisStudentGrade.totalMax) * 100;
          }

          // Calculate class average (excluding this student for privacy)
          const otherStudents = Array.from(gradesByStudent.entries())
            .filter(([id]) => id !== studentUserId);
          
          if (otherStudents.length > 0) {
            const avgSum = otherStudents.reduce((sum, [, data]) => {
              return sum + (data.totalScore / data.totalMax) * 100;
            }, 0);
            classAvgGrade = avgSum / otherStudents.length;
          }
        }

        // Only add if we have data
        if (studentAttendance > 0 || studentGrade > 0 || classAvgAttendance > 0 || classAvgGrade > 0) {
          performanceBySubject.push({
            subject: subjectName,
            studentAttendance: Math.round(studentAttendance * 10) / 10,
            classAvgAttendance: Math.round(classAvgAttendance * 10) / 10,
            studentGrade: Math.round(studentGrade * 10) / 10,
            classAvgGrade: Math.round(classAvgGrade * 10) / 10,
          });
        }
      }

      setPerformanceData(performanceBySubject);
    } catch (error) {
      console.error("Error fetching performance comparison data:", error);
    } finally {
      setLoading(false);
    }
  };

  const chartConfig = {
    studentAttendance: {
      label: `${studentName}'s Attendance`,
      color: "hsl(var(--chart-1))",
    },
    classAvgAttendance: {
      label: "Class Average Attendance",
      color: "hsl(var(--chart-2))",
    },
    studentGrade: {
      label: `${studentName}'s Grade`,
      color: "hsl(var(--chart-3))",
    },
    classAvgGrade: {
      label: "Class Average Grade",
      color: "hsl(var(--chart-4))",
    },
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Performance Comparison - {studentName}
          </DialogTitle>
          <DialogDescription>
            Compare your child's performance with class averages (anonymized data)
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Loading comparison data...</p>
            </div>
          </div>
        ) : performanceData.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-50 text-muted-foreground" />
            <p className="text-muted-foreground">No comparison data available yet</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="p-4 bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/20 rounded-lg">
                    <Award className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Average Attendance</p>
                    <p className="text-2xl font-bold">
                      {Math.round(performanceData.reduce((sum, d) => sum + d.studentAttendance, 0) / performanceData.length)}%
                    </p>
                  </div>
                </div>
              </Card>
              <Card className="p-4 bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-500/20 rounded-lg">
                    <TrendingUp className="w-5 h-5 text-green-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Average Grade</p>
                    <p className="text-2xl font-bold">
                      {Math.round(performanceData.reduce((sum, d) => sum + d.studentGrade, 0) / performanceData.length)}%
                    </p>
                  </div>
                </div>
              </Card>
            </div>

            {/* Attendance Comparison Chart */}
            <Card className="p-4">
              <h3 className="text-lg font-semibold mb-4">Attendance Comparison by Subject</h3>
              <ChartContainer config={chartConfig} className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={performanceData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="subject" 
                      className="text-xs"
                      tick={{ fill: 'hsl(var(--foreground))' }}
                    />
                    <YAxis 
                      className="text-xs"
                      tick={{ fill: 'hsl(var(--foreground))' }}
                      domain={[0, 100]}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Legend />
                    <Bar 
                      dataKey="studentAttendance" 
                      fill="hsl(var(--chart-1))" 
                      name={`${studentName}'s Attendance`}
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar 
                      dataKey="classAvgAttendance" 
                      fill="hsl(var(--chart-2))" 
                      name="Class Average"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </Card>

            {/* Grade Comparison Chart */}
            <Card className="p-4">
              <h3 className="text-lg font-semibold mb-4">Grade Comparison by Subject</h3>
              <ChartContainer config={chartConfig} className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={performanceData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="subject" 
                      className="text-xs"
                      tick={{ fill: 'hsl(var(--foreground))' }}
                    />
                    <YAxis 
                      className="text-xs"
                      tick={{ fill: 'hsl(var(--foreground))' }}
                      domain={[0, 100]}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Legend />
                    <Bar 
                      dataKey="studentGrade" 
                      fill="hsl(var(--chart-3))" 
                      name={`${studentName}'s Grade`}
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar 
                      dataKey="classAvgGrade" 
                      fill="hsl(var(--chart-4))" 
                      name="Class Average"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </Card>

            {/* Privacy Note */}
            <Card className="p-4 bg-muted/50">
              <p className="text-sm text-muted-foreground">
                <strong>Privacy Note:</strong> Class averages are calculated from anonymized data and exclude your child's scores to provide an accurate comparison. Individual student information is never shared.
              </p>
            </Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
