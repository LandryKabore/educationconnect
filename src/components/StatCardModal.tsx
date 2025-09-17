import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Users, CheckSquare, TrendingUp, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Student {
  id: string;
  name: string;
  className: string;
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

  useEffect(() => {
    if (open && type === "students") {
      fetchAllStudents();
    }
  }, [open, type]);

  const fetchAllStudents = async () => {
    setLoadingStudents(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get all teaching assignments for this teacher
      const { data: assignments } = await supabase
        .from("teaching_assignments")
        .select(`
          class_sections(
            id,
            name,
            grade_level
          )
        `)
        .eq("teacher_user_id", user.id);

      if (!assignments) return;

      const allStudents: Student[] = [];

      // For each class, get the enrolled students
      for (const assignment of assignments) {
        if (assignment.class_sections) {
          const { data: enrollments } = await supabase
            .from("enrollments")
            .select(`
              student_user_id,
              profiles!enrollments_student_user_id_fkey(first_name, last_name)
            `)
            .eq("class_section_id", assignment.class_sections.id)
            .eq("status", "active");

          if (enrollments) {
            enrollments.forEach(enrollment => {
              if (enrollment.profiles) {
                allStudents.push({
                  id: enrollment.student_user_id,
                  name: `${enrollment.profiles.first_name || ''} ${enrollment.profiles.last_name || ''}`.trim(),
                  className: `${assignment.class_sections.name} - ${assignment.class_sections.grade_level}`
                });
              }
            });
          }
        }
      }

      setStudents(allStudents);
    } catch (error) {
      console.error("Error fetching students:", error);
    } finally {
      setLoadingStudents(false);
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
          title: "Average Attendance",
          icon: <TrendingUp className="w-5 h-5" />,
          description: `Current average attendance across all your classes is ${stats.avgAttendance}`,
          content: (
            <div className="space-y-3">
              <Card className="bg-slate-700/50 border-slate-600">
                <CardHeader>
                  <CardTitle className="text-white text-sm">Attendance Overview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-300">Overall Average:</span>
                      <span className="text-green-400 font-medium">{stats.avgAttendance}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-300">Total Classes:</span>
                      <span className="text-white">{data.length}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-300">Total Students:</span>
                      <span className="text-white">{stats.totalStudents}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-orange-400/10 border-orange-400/30">
                <CardContent className="p-4">
                  <div className="text-sm text-orange-200">
                    <strong>Note:</strong> Attendance tracking helps monitor student engagement and identify patterns. 
                    Regular attendance updates provide better insights into class performance.
                  </div>
                </CardContent>
              </Card>
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