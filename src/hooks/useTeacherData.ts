import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";

export interface TeacherClass {
  id: string;
  name: string;
  grade_level: string;
  student_count: number;
  schedule_time?: string;
  room?: string;
}

export interface TeacherTask {
  id: string;
  task: string;
  urgent: boolean;
  due: string;
  type: 'grading' | 'attendance' | 'meeting' | 'admin';
}

export interface TeacherMessage {
  id: string;
  from: string;
  subject: string;
  preview: string;
  time: string;
  unread: boolean;
}

export const useTeacherData = () => {
  const [loading, setLoading] = useState(true);
  const [teacherInfo, setTeacherInfo] = useState<any>(null);
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [tasks, setTasks] = useState<TeacherTask[]>([]);
  const [messages, setMessages] = useState<TeacherMessage[]>([]);
  const [stats, setStats] = useState({
    totalStudents: 0,
    pendingTasks: 0,
    avgAttendance: "0%"
  });

  useEffect(() => {
    fetchTeacherData();
  }, []);

  const fetchTeacherData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch teacher profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();

      const { data: teacher } = await supabase
        .from("teacher_profiles")
        .select(`
          *,
          schools(name)
        `)
        .eq("user_id", user.id)
        .maybeSingle();

      setTeacherInfo({ profile, teacher });

      if (teacher) {
        // Fetch teacher's teaching assignments with class details
        const { data: assignmentsData } = await supabase
          .from("teaching_assignments")
          .select(`
            id,
            class_sections(
              id,
              name,
              grade_level,
              capacity
            ),
            subjects(
              id,
              name,
              schedule_time_start,
              schedule_time_end,
              schedule_days
            ),
            academic_years(
              id,
              name,
              active
            )
          `)
          .eq("teacher_user_id", user.id);

        let formattedClasses: TeacherClass[] = [];
        if (assignmentsData && assignmentsData.length > 0) {
          // Group by class section to avoid duplicates
          const classMap = new Map();
          
          assignmentsData.forEach(assignment => {
            const classSection = assignment.class_sections;
            const subject = assignment.subjects;
            
            if (classSection && !classMap.has(classSection.id)) {
              // Get student count for this class
              const studentCount = Math.floor(Math.random() * 25) + 15; // Mock for now
              
              // Format schedule time
              let scheduleTime = "Not scheduled";
              if (subject?.schedule_time_start && subject?.schedule_time_end) {
                scheduleTime = `${subject.schedule_time_start} - ${subject.schedule_time_end}`;
              }
              
              classMap.set(classSection.id, {
                id: classSection.id,
                name: `${classSection.name} - ${subject?.name || 'Subject'}`,
                grade_level: classSection.grade_level || "Unknown",
                student_count: studentCount,
                schedule_time: scheduleTime,
                room: `Room ${Math.floor(Math.random() * 300) + 100}` // Mock room for now
              });
            }
          });
          
          formattedClasses = Array.from(classMap.values());
          setClasses(formattedClasses);

          // Calculate total students
          const totalStudents = formattedClasses.reduce((sum, cls) => sum + cls.student_count, 0);
          setStats(prev => ({ ...prev, totalStudents }));
        }

        // Generate mock tasks based on real data
        const mockTasks: TeacherTask[] = [
          {
            id: "1",
            task: formattedClasses.length > 0 
              ? `Grade assignments for ${formattedClasses[0].name}` 
              : "Grade assignments",
            urgent: true,
            due: "Today",
            type: "grading"
          },
          {
            id: "2",
            task: "Review attendance records",
            urgent: false,
            due: "Tomorrow",
            type: "attendance"
          },
          {
            id: "3",
            task: "Parent meeting scheduled",
            urgent: true,
            due: "Today 3PM",
            type: "meeting"
          }
        ];
        setTasks(mockTasks);
        setStats(prev => ({ ...prev, pendingTasks: mockTasks.length }));

        // Generate mock messages
        const mockMessages: TeacherMessage[] = [
          {
            id: "1",
            from: "Parent - John Smith",
            subject: "Question about homework",
            preview: "Could you clarify the mathematics assignment...",
            time: "2 hours ago",
            unread: true
          },
          {
            id: "2",
            from: "School Admin",
            subject: "Weekly Report Due",
            preview: "Please submit your weekly progress report...",
            time: "1 day ago",
            unread: false
          }
        ];
        setMessages(mockMessages);

        // Calculate average attendance
        const { data: attendanceData } = await supabase
          .from("enhanced_attendance")
          .select("status")
          .in("class_section_id", formattedClasses.map(cls => cls.id));

        if (attendanceData && attendanceData.length > 0) {
          const presentCount = attendanceData.filter(att => att.status === "present").length;
          const avgAttendance = `${Math.round((presentCount / attendanceData.length) * 100)}%`;
          setStats(prev => ({ ...prev, avgAttendance }));
        }
      }
    } catch (error) {
      console.error("Error fetching teacher data:", error);
      toast({
        title: "Error",
        description: "Failed to load teacher data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const getTodaySchedule = (className: string): string => {
    // Mock schedule generation
    const times = ["9:00 AM", "11:00 AM", "2:00 PM", "3:30 PM"];
    return times[Math.floor(Math.random() * times.length)];
  };

  const markTaskComplete = async (taskId: string) => {
    setTasks(prev => prev.filter(task => task.id !== taskId));
    setStats(prev => ({ ...prev, pendingTasks: prev.pendingTasks - 1 }));
    
    toast({
      title: "Task Completed",
      description: "Task marked as complete"
    });
  };

  const markMessageRead = async (messageId: string) => {
    setMessages(prev => 
      prev.map(msg => 
        msg.id === messageId ? { ...msg, unread: false } : msg
      )
    );
  };

  return {
    loading,
    teacherInfo,
    classes,
    tasks,
    messages,
    stats,
    markTaskComplete,
    markMessageRead,
    refetch: fetchTeacherData
  };
};