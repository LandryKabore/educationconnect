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
        .from("teachers")
        .select(`
          *,
          schools(name)
        `)
        .eq("user_id", user.id)
        .maybeSingle();

      setTeacherInfo({ profile, teacher });

      if (teacher) {
        // Fetch teacher's classes with student count
        const { data: classesData } = await supabase
          .from("classes")
          .select(`
            *,
            students(count)
          `)
          .eq("teacher_id", user.id);

        if (classesData) {
          const formattedClasses = classesData.map(cls => ({
            id: cls.id,
            name: cls.name,
            grade_level: cls.grade_level || "Unknown",
            student_count: cls.students?.length || 0,
            schedule_time: getTodaySchedule(cls.name), // Mock schedule
            room: `Room ${Math.floor(Math.random() * 300) + 100}` // Mock room
          }));
          setClasses(formattedClasses);

          // Calculate total students
          const totalStudents = formattedClasses.reduce((sum, cls) => sum + cls.student_count, 0);
          setStats(prev => ({ ...prev, totalStudents }));
        }

        // Generate mock tasks based on real data
        const mockTasks: TeacherTask[] = [
          {
            id: "1",
            task: `Grade assignments for ${classes[0]?.name || 'Class'}`,
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
          .from("attendance")
          .select("status")
          .in("class_id", classesData.map(cls => cls.id));

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