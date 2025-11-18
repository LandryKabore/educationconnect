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

        // Get the grade level of the current student's class
        const { data: currentClass } = await supabase
          .from("class_sections")
          .select("grade_level")
          .eq("id", classSectionId)
          .single();

        if (!currentClass) continue;

        // Get all class sections with the same grade level
        const { data: gradeLevelClasses } = await supabase
          .from("class_sections")
          .select("id")
          .eq("grade_level", currentClass.grade_level);

        if (!gradeLevelClasses || gradeLevelClasses.length === 0) continue;

        const gradeLevelClassIds = gradeLevelClasses.map(c => c.id);

        // Get all students in the same grade level
        const { data: gradeStudents } = await supabase
          .from("enrollments")
          .select("student_user_id")
          .in("class_section_id", gradeLevelClassIds);

        if (!gradeStudents || gradeStudents.length === 0) continue;

        const studentIds = gradeStudents.map(s => s.student_user_id);
        
        console.log(`[Performance Comparison] ${subjectName}:`, {
          gradeLevel: currentClass.grade_level,
          classSectionIds: gradeLevelClassIds,
          subjectId,
          totalStudents: gradeStudents.length,
          currentStudentId: studentUserId
        });

        // Calculate attendance averages across the grade level for this subject
        const { data: attendanceRecords } = await supabase
          .from("enhanced_attendance")
          .select("student_user_id, status")
          .in("class_section_id", gradeLevelClassIds)
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

          // Calculate class average (including all students for accurate comparison)
          if (attendanceByStudent.size > 0) {
            const avgSum = Array.from(attendanceByStudent.entries()).reduce((sum, [, data]) => {
              return sum + (data.present / data.total) * 100;
            }, 0);
            classAvgAttendance = avgSum / attendanceByStudent.size;
          }

          console.log(`[Attendance] ${subjectName}:`, {
            totalRecords: attendanceRecords.length,
            studentsWithRecords: attendanceByStudent.size,
            studentAttendance,
            classAvgAttendance,
            breakdown: Array.from(attendanceByStudent.entries()).map(([id, data]) => ({
              studentId: id,
              rate: Math.round((data.present / data.total) * 100 * 10) / 10
            }))
          });
        }

        // Calculate grade averages across the grade level for this subject
        const { data: gradeRecords } = await supabase
          .from("enhanced_grades")
          .select(`
            student_user_id,
            score,
            max_score,
            exams!inner(subject_id, class_section_id)
          `)
          .in("exams.class_section_id", gradeLevelClassIds)
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

          // Calculate class average (including all students for accurate comparison)
          if (gradesByStudent.size > 0) {
            const avgSum = Array.from(gradesByStudent.entries()).reduce((sum, [, data]) => {
              return sum + (data.totalScore / data.totalMax) * 100;
            }, 0);
            classAvgGrade = avgSum / gradesByStudent.size;
          }

          console.log(`[Grades] ${subjectName}:`, {
            totalRecords: gradeRecords.length,
            studentsWithGrades: gradesByStudent.size,
            studentGrade,
            classAvgGrade,
            breakdown: Array.from(gradesByStudent.entries()).map(([id, data]) => ({
              studentId: id,
              rate: Math.round((data.totalScore / data.totalMax) * 100 * 10) / 10
            }))
          });
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
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={performanceData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="subject" 
                      tick={{ fill: 'hsl(var(--foreground))' }}
                      stroke="hsl(var(--border))"
                    />
                    <YAxis 
                      tick={{ fill: 'hsl(var(--foreground))' }}
                      domain={[0, 100]}
                      stroke="hsl(var(--border))"
                    />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      labelStyle={{ color: 'hsl(var(--popover-foreground))' }}
                    />
                    <Legend />
                    <Bar 
                      dataKey="studentAttendance" 
                      fill="hsl(217 91% 60%)" 
                      name={`${studentName}'s Attendance`}
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar 
                      dataKey="classAvgAttendance" 
                      fill="hsl(173 58% 39%)" 
                      name="Class Average"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Grade Comparison Chart */}
            <Card className="p-4">
              <h3 className="text-lg font-semibold mb-4">Grade Comparison by Subject</h3>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={performanceData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="subject" 
                      tick={{ fill: 'hsl(var(--foreground))' }}
                      stroke="hsl(var(--border))"
                    />
                    <YAxis 
                      tick={{ fill: 'hsl(var(--foreground))' }}
                      domain={[0, 100]}
                      stroke="hsl(var(--border))"
                    />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      labelStyle={{ color: 'hsl(var(--popover-foreground))' }}
                    />
                    <Legend />
                    <Bar 
                      dataKey="studentGrade" 
                      fill="hsl(142 76% 36%)" 
                      name={`${studentName}'s Grade`}
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar 
                      dataKey="classAvgGrade" 
                      fill="hsl(48 96% 53%)" 
                      name="Class Average"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Privacy Note */}
            <Card className="p-4 bg-muted/50">
              <p className="text-sm text-muted-foreground">
                <strong>Privacy Note:</strong> Class averages are calculated from anonymized aggregated data. Individual student information is never shared.
              </p>
            </Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
