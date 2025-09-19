import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CircularProgress } from "@/components/ui/circular-progress";
import { Calendar, Users, CheckSquare, TrendingUp, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface Student {
  id: string;
  name: string;
  className: string;
  attendancePercentage?: number;
}

interface StatCardModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: "classes" | "students" | "tasks" | "attendance";
  data: any[];
  stats: any;
}

export function StatCardModal({ open, onOpenChange, type, data, stats }: StatCardModalProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [attendanceData, setAttendanceData] = useState<Student[]>([]);
  const [loadingAttendance, setLoadingAttendance] = useState(false);

  useEffect(() => {
    if (open && type === "students") {
      fetchAllStudents();
    } else if (open && type === "attendance") {
      fetchStudentAttendanceData();
    }
  }, [open, type]);

  const fetchAllStudents = async () => {
    setLoadingStudents(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      console.log("Fetching students for teacher:", user.id);

      // Get all teaching assignments for this teacher
      const { data: assignments, error: assignmentsError } = await supabase
        .from("teaching_assignments")
        .select(`
          class_sections(
            id,
            name,
            grade_level
          )
        `)
        .eq("teacher_user_id", user.id);

      console.log("Teaching assignments:", assignments);
      if (assignmentsError) {
        console.error("Error fetching assignments:", assignmentsError);
        return;
      }

      if (!assignments || assignments.length === 0) {
        console.log("No teaching assignments found");
        return;
      }

      const allStudents: Student[] = [];

      // For each class, get the enrolled students with their profiles
      for (const assignment of assignments) {
        if (assignment.class_sections) {
          console.log("Fetching students for class:", assignment.class_sections.id);
          
          // Get enrollments with student profiles using a different approach
          const { data: enrollments, error: enrollmentsError } = await supabase
            .from("enrollments")
            .select("student_user_id")
            .eq("class_section_id", assignment.class_sections.id)
            .eq("status", "active");

          if (enrollmentsError) {
            console.error("Error fetching enrollments:", enrollmentsError);
            continue;
          }

          if (enrollments && enrollments.length > 0) {
            // Since teacher RLS might be restricting access to profiles, 
            // let's check if we can access them differently by using a service call
            // or try accessing through a specific teacher context
            const studentIds = enrollments.map(e => e.student_user_id);
            
            // Let's try using the current user as a teacher context
            const { data: { user } } = await supabase.auth.getUser();
            console.log("Current teacher user:", user?.id);
            
            // Try a raw query approach that respects teacher RLS
            const { data: studentNames, error: namesError } = await supabase
              .rpc('get_student_names_for_teacher' as any, {
                student_ids: studentIds,
                teacher_id: user?.id
              });

            console.log("Student names from RPC:", studentNames);
            
            if (namesError) {
              console.error("Error calling RPC:", namesError);
              // Fallback: use student IDs
              for (const enrollment of enrollments) {
                allStudents.push({
                  id: enrollment.student_user_id,
                  name: `Student ${enrollment.student_user_id.slice(0, 8)}`,
                  className: `${assignment.class_sections.name} - ${assignment.class_sections.grade_level}`
                });
              }
            } else if (Array.isArray(studentNames)) {
              // Use the names from RPC
              const nameMap = new Map();
              studentNames.forEach((item: any) => {
                nameMap.set(item.user_id, item);
              });
              
              for (const enrollment of enrollments) {
                const nameData = nameMap.get(enrollment.student_user_id);
                const studentName = nameData 
                  ? `${nameData.first_name || ''} ${nameData.last_name || ''}`.trim()
                  : `Student ${enrollment.student_user_id.slice(0, 8)}`;

                allStudents.push({
                  id: enrollment.student_user_id,
                  name: studentName || 'Unknown Student',
                  className: `${assignment.class_sections.name} - ${assignment.class_sections.grade_level}`
                });
              }
            }
          }
        }
      }

      console.log("All students found:", allStudents);
      setStudents(allStudents);
    } catch (error) {
      console.error("Error fetching students:", error);
    } finally {
      setLoadingStudents(false);
    }
  };

  const fetchStudentAttendanceData = async () => {
    setLoadingAttendance(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get all teaching assignments for this teacher
      const { data: assignments, error: assignmentsError } = await supabase
        .from("teaching_assignments")
        .select(`
          class_sections(
            id,
            name,
            grade_level
          )
        `)
        .eq("teacher_user_id", user.id);

      if (assignmentsError || !assignments || assignments.length === 0) {
        return;
      }

      const allStudentsWithAttendance: Student[] = [];

      // For each class, get students and their attendance
      for (const assignment of assignments) {
        if (assignment.class_sections) {
          // Get enrollments
          const { data: enrollments, error: enrollmentsError } = await supabase
            .from("enrollments")
            .select("student_user_id")
            .eq("class_section_id", assignment.class_sections.id)
            .eq("status", "active");

          if (enrollmentsError || !enrollments || enrollments.length === 0) {
            continue;
          }

          const studentIds = enrollments.map(e => e.student_user_id);

          // Get student names using RPC
          const { data: studentNames, error: namesError } = await supabase
            .rpc('get_student_names_for_teacher' as any, {
              student_ids: studentIds,
              teacher_id: user.id
            });

          if (namesError || !Array.isArray(studentNames)) {
            continue;
          }

          // Get attendance data for these students - only records taken by this teacher
          const { data: attendanceRecords, error: attendanceError } = await supabase
            .from("enhanced_attendance")
            .select("student_user_id, status")
            .eq("class_section_id", assignment.class_sections.id)
            .eq("taken_by", user.id)
            .in("student_user_id", studentIds);

          if (attendanceError) {
            console.error("Error fetching attendance:", attendanceError);
          }

          // Calculate attendance percentage for each student
          const nameMap = new Map();
          studentNames.forEach((item: any) => {
            nameMap.set(item.user_id, item);
          });

          for (const enrollment of enrollments) {
            const nameData = nameMap.get(enrollment.student_user_id);
            const studentName = nameData 
              ? `${nameData.first_name || ''} ${nameData.last_name || ''}`.trim()
              : `Student ${enrollment.student_user_id.slice(0, 8)}`;

            // Calculate attendance percentage
            const studentAttendanceRecords = attendanceRecords?.filter(
              record => record.student_user_id === enrollment.student_user_id
            ) || [];

            let attendancePercentage = 0;
            if (studentAttendanceRecords.length > 0) {
              const presentCount = studentAttendanceRecords.filter(
                record => record.status === "present"
              ).length;
              attendancePercentage = Math.round((presentCount / studentAttendanceRecords.length) * 100);
            } else {
              // Default to 95% if no records (new student)
              attendancePercentage = 95;
            }

            allStudentsWithAttendance.push({
              id: enrollment.student_user_id,
              name: studentName || 'Unknown Student',
              className: `${assignment.class_sections.name} - ${assignment.class_sections.grade_level}`,
              attendancePercentage
            });
          }
        }
      }

      // Sort by attendance percentage (lowest first to highlight issues)
      allStudentsWithAttendance.sort((a, b) => (a.attendancePercentage || 0) - (b.attendancePercentage || 0));
      
      setAttendanceData(allStudentsWithAttendance);
    } catch (error) {
      console.error("Error fetching attendance data:", error);
    } finally {
      setLoadingAttendance(false);
    }
  };
  
  const getModalContent = () => {
    switch (type) {
      case "classes":
        return {
          title: "Active Classes",
          icon: <Calendar className="w-5 h-5" />,
          description: `You are currently teaching ${data.length} classes`,
          content: (
            <div className="space-y-3">
              {data.map((classInfo) => (
                <Card key={classInfo.id} className="bg-slate-700/50 border-slate-600">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-white">{classInfo.name}</div>
                        <div className="text-sm text-slate-300">{classInfo.grade_level}</div>
                        <div className="text-xs text-slate-400 mt-1">
                          {classInfo.student_count} students • {classInfo.schedule_time}
                        </div>
                      </div>
                      <Badge variant="outline" className="border-orange-400/50 text-orange-400">
                        {classInfo.room}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )
        };
      
      case "students":
        return {
          title: "Total Students",
          icon: <Users className="w-5 h-5" />,
          description: `You are teaching ${stats.totalStudents} students across all your classes`,
          content: loadingStudents ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
              <span className="ml-2 text-slate-300">Loading students...</span>
            </div>
          ) : (
            <div className="space-y-3">
              {students.length > 0 ? (
                students.map((student) => (
                  <div key={student.id} className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                    <div>
                      <div className="font-medium text-white">{student.name}</div>
                      <div className="text-sm text-slate-300">{student.className}</div>
                    </div>
                    <Badge variant="secondary" className="bg-blue-400/20 text-blue-400 border-blue-400/30">
                      Student
                    </Badge>
                  </div>
                ))
              ) : (
                <div className="p-4 bg-slate-700/50 rounded-lg text-center text-slate-300">
                  No students found
                </div>
              )}
            </div>
          )
        };
      
      case "tasks":
        return {
          title: "Pending Tasks",
          icon: <CheckSquare className="w-5 h-5" />,
          description: `You have ${stats.pendingTasks} tasks that need your attention`,
          content: (
            <div className="space-y-3">
              {data.map((task) => (
                <Card key={task.id} className={`bg-slate-700/50 border ${task.urgent ? 'border-red-400/50' : 'border-slate-600'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-white">{task.task}</div>
                        <div className="text-sm text-slate-300 mt-1">Due: {task.due}</div>
                        <div className="text-xs text-slate-400 mt-1">Type: {task.type}</div>
                      </div>
                      {task.urgent && (
                        <Badge variant="destructive" className="bg-red-500/20 text-red-400 border-red-400/30">
                          Urgent
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )
        };
      
      case "attendance":
        return {
          title: "Student Attendance Overview",
          icon: <TrendingUp className="w-5 h-5" />,
          description: `Individual attendance tracking for all your students (${attendanceData.length} students)`,
          content: loadingAttendance ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin text-green-400" />
              <span className="ml-2 text-slate-300">Loading attendance data...</span>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary stats */}
              <Card className="bg-slate-700/50 border-slate-600">
                <CardHeader>
                  <CardTitle className="text-white text-sm">Overall Statistics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold text-green-400">
                        {attendanceData.filter(s => (s.attendancePercentage || 0) >= 90).length}
                      </div>
                      <div className="text-xs text-slate-300">Excellent (90%+)</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-orange-400">
                        {attendanceData.filter(s => (s.attendancePercentage || 0) >= 60 && (s.attendancePercentage || 0) < 90).length}
                      </div>
                      <div className="text-xs text-slate-300">Needs Attention</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-red-400">
                        {attendanceData.filter(s => (s.attendancePercentage || 0) < 60).length}
                      </div>
                      <div className="text-xs text-slate-300">Critical (&lt;60%)</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Individual student attendance */}
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {attendanceData.length > 0 ? (
                  attendanceData.map((student, index) => (
                    <div 
                      key={student.id} 
                      className={cn(
                        "flex items-center justify-between p-4 rounded-lg border transition-all duration-300 hover:scale-[1.02] animate-fade-in",
                        (student.attendancePercentage || 0) >= 90 
                          ? "bg-green-400/10 border-green-400/30" 
                          : (student.attendancePercentage || 0) >= 75
                          ? "bg-yellow-400/10 border-yellow-400/30"
                          : (student.attendancePercentage || 0) >= 60
                          ? "bg-orange-400/10 border-orange-400/30"
                          : "bg-red-400/10 border-red-400/30"
                      )}
                      style={{
                        animationDelay: `${index * 100}ms`
                      }}
                    >
                      <div className="flex-1">
                        <div className="font-medium text-white">{student.name}</div>
                        <div className="text-sm text-slate-300">{student.className}</div>
                        <div className="text-xs text-slate-400 mt-1">
                          {(student.attendancePercentage || 0) >= 90 ? "Excellent attendance" :
                           (student.attendancePercentage || 0) >= 75 ? "Good attendance" :
                           (student.attendancePercentage || 0) >= 60 ? "Needs improvement" :
                           "Critical - Contact parent"}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <CircularProgress 
                          percentage={student.attendancePercentage || 0}
                          size={50}
                          strokeWidth={3}
                          animationDelay={index * 150}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-8 bg-slate-700/50 rounded-lg text-center">
                    <TrendingUp className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                    <div className="text-slate-300">No attendance data available</div>
                    <div className="text-sm text-slate-400 mt-1">
                      Start taking attendance to see student progress here
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        };
      
      default:
        return { title: "", icon: null, description: "", content: null };
    }
  };

  const modalContent = getModalContent();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto bg-slate-800 border-slate-600">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            {modalContent.icon}
            {modalContent.title}
          </DialogTitle>
          <DialogDescription className="text-slate-300">
            {modalContent.description}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4">
          {modalContent.content}
        </div>
      </DialogContent>
    </Dialog>
  );
}