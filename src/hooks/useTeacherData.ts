import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";
import { format, addDays, isToday, isTomorrow, differenceInHours, differenceInDays } from "date-fns";

export interface TeacherClass {
  id: string;
  name: string;
  grade_level: string;
  student_count: number;
  schedule_time?: string;
  room?: string;
  subject?: string;
}

export interface TeacherTask {
  id: string;
  task: string;
  urgent: boolean;
  due: Date;
  dueText: string;
  type: 'grading' | 'attendance' | 'meeting' | 'admin';
}

export interface TeacherMessage {
  id: string;
  from: string;
  subject: string;
  preview: string;
  time: Date;
  timeText: string;
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

  // Utility function to format due dates
  const formatDueDate = (date: Date): string => {
    if (isToday(date)) {
      return `Today ${format(date, 'h:mm a')}`;
    } else if (isTomorrow(date)) {
      return `Tomorrow ${format(date, 'h:mm a')}`;
    } else {
      const daysDiff = differenceInDays(date, new Date());
      if (daysDiff <= 7) {
        return format(date, 'EEEE h:mm a');
      }
      return format(date, 'MMM d, h:mm a');
    }
  };

  // Utility function to format message times
  const formatMessageTime = (date: Date): string => {
    const hoursDiff = differenceInHours(new Date(), date);
    if (hoursDiff < 1) {
      return 'Just now';
    } else if (hoursDiff < 24) {
      return `${hoursDiff} hour${hoursDiff > 1 ? 's' : ''} ago`;
    } else {
      const daysDiff = differenceInDays(new Date(), date);
      if (daysDiff === 1) {
        return '1 day ago';
      } else if (daysDiff <= 7) {
        return `${daysDiff} days ago`;
      }
      return format(date, 'MMM d');
    }
  };

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
          
          // Fetch actual student counts for each class
          for (const assignment of assignmentsData) {
            const classSection = assignment.class_sections;
            const subject = assignment.subjects;
            
            if (classSection && !classMap.has(classSection.id)) {
              // Get actual student count for this class
              const { data: enrollments } = await supabase
                .from("enrollments")
                .select("id")
                .eq("class_section_id", classSection.id)
                .eq("status", "active");
              
              const studentCount = enrollments?.length || 0;
              
              // Format schedule time
              let scheduleTime = "Not scheduled";
              if (subject?.schedule_time_start && subject?.schedule_time_end) {
                scheduleTime = `${subject.schedule_time_start} - ${subject.schedule_time_end}`;
              }
              
              classMap.set(classSection.id, {
                id: classSection.id,
                name: classSection.name,
                grade_level: classSection.grade_level || "Unknown",
                student_count: studentCount,
                schedule_time: scheduleTime,
                room: `Room ${Math.floor(Math.random() * 300) + 100}`, // Mock room for now
                subject: subject?.name || "Subject"
              });
            }
          }
          
          formattedClasses = Array.from(classMap.values());
          setClasses(formattedClasses);

          // Calculate total students
          const totalStudents = formattedClasses.reduce((sum, cls) => sum + cls.student_count, 0);
          setStats(prev => ({ ...prev, totalStudents }));
        }

        // Generate realistic tasks based on real data and current date
        const now = new Date();
        const mockTasks: TeacherTask[] = [
          {
            id: "1",
            task: formattedClasses.length > 0 
              ? `Grade assignments for ${formattedClasses[0].name}` 
              : "Grade assignments",
            urgent: true,
            due: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 17, 0), // Today 5PM
            dueText: "",
            type: "grading"
          },
          {
            id: "2",
            task: "Review attendance records",
            urgent: false,
            due: addDays(now, 1), // Tomorrow
            dueText: "",
            type: "attendance"
          },
          {
            id: "3",
            task: "Parent meeting scheduled",
            urgent: true,
            due: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 15, 0), // Today 3PM
            dueText: "",
            type: "meeting"
          },
          {
            id: "4",
            task: "Submit weekly progress report",
            urgent: false,
            due: addDays(now, 5), // This Friday
            dueText: "",
            type: "admin"
          }
        ];

        // Format due dates
        mockTasks.forEach(task => {
          task.dueText = formatDueDate(task.due);
        });
        setTasks(mockTasks);
        setStats(prev => ({ ...prev, pendingTasks: mockTasks.length }));

        // Generate realistic messages with actual timestamps
        const mockMessages: TeacherMessage[] = [
          {
            id: "1",
            from: "Parent - John Smith",
            subject: "Question about homework",
            preview: "Could you clarify the mathematics assignment...",
            time: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
            timeText: "",
            unread: true
          },
          {
            id: "2",
            from: "School Admin",
            subject: "Weekly Report Due",
            preview: "Please submit your weekly progress report...",
            time: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
            timeText: "",
            unread: false
          },
          {
            id: "3",
            from: "Parent - Sarah Johnson", 
            subject: "Student absence notification",
            preview: "My child will be absent tomorrow due to...",
            time: new Date(Date.now() - 45 * 60 * 1000), // 45 minutes ago
            timeText: "",
            unread: true
          }
        ];

        // Format message times
        mockMessages.forEach(message => {
          message.timeText = formatMessageTime(message.time);
        });
        setMessages(mockMessages);

        // Calculate average attendance for classes where this teacher took attendance
        const { data: attendanceData } = await supabase
          .from("enhanced_attendance")
          .select("status")
          .eq("taken_by", user?.id)
          .in("class_section_id", formattedClasses.map(cls => cls.id));

        if (attendanceData && attendanceData.length > 0) {
          const presentCount = attendanceData.filter(att => att.status === "present").length;
          const avgAttendance = `${Math.round((presentCount / attendanceData.length) * 100)}%`;
          setStats(prev => ({ ...prev, avgAttendance }));
        } else {
          // If no attendance taken yet, show 0%
          setStats(prev => ({ ...prev, avgAttendance: "0%" }));
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
    // Generate schedule based on current day of week
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
    
    // Different schedule for different days
    const schedules = {
      1: ["8:00 AM", "10:00 AM", "1:00 PM", "3:00 PM"], // Monday
      2: ["9:00 AM", "11:00 AM", "2:00 PM", "4:00 PM"], // Tuesday  
      3: ["8:30 AM", "10:30 AM", "1:30 PM", "3:30 PM"], // Wednesday
      4: ["9:00 AM", "11:00 AM", "2:00 PM", "4:00 PM"], // Thursday
      5: ["8:00 AM", "10:00 AM", "12:00 PM", "2:00 PM"]  // Friday
    };
    
    const daySchedule = schedules[dayOfWeek as keyof typeof schedules] || schedules[1];
    return daySchedule[Math.floor(Math.random() * daySchedule.length)];
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