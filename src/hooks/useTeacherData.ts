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
  subject_id?: string;
  attendanceTaken?: boolean;
  schedule_days?: string[];
  schedule_time_start?: string;
  schedule_time_end?: string;
}

export interface TeacherTask {
  id: string;
  title: string;
  description: string | null;
  due_date: string;
  priority: string;
  status: string;
  completed_at: string | null;
}

export interface TeacherMessage {
  id: string;
  from: string;
  subject: string;
  preview: string;
  time: Date;
  timeText: string;
  unread: boolean;
  senderId?: string;
}

export interface TeacherSubject {
  id: string;
  name: string;
}

export interface TeacherAssignment {
  id: string;
  title: string;
  description?: string;
  due_date?: Date;
  max_points?: number;
  class_name: string;
  subject_name: string;
  created_at: Date;
  formattedDueDate?: string;
  formattedCreatedDate: string;
}

export const useTeacherData = () => {
  const [loading, setLoading] = useState(true);
  const [teacherInfo, setTeacherInfo] = useState<any>(null);
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [subjects, setSubjects] = useState<TeacherSubject[]>([]);
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [tasks, setTasks] = useState<TeacherTask[]>([]);
  const [messages, setMessages] = useState<TeacherMessage[]>([]);
  const [stats, setStats] = useState({
    totalStudents: 0,
    pendingTasks: 0,
    avgAttendance: "0%",
    totalAssignments: 0
  });

  useEffect(() => {
    fetchTeacherData();
    
    // Subscribe to new messages
    const channel = supabase
      .channel('teacher-messages')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
        },
        () => {
          fetchTeacherData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Utility function to format due dates
  const formatDueDate = (date: Date): string => {
    return format(date, 'MMM d, yyyy h:mm a');
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
        // Fetch teacher's teaching assignments with class details and schedule
        const { data: teachingAssignments } = await supabase
          .from("teaching_assignments")
          .select(`
            id,
            class_section_id,
            subject_id,
            class_sections(
              id,
              name,
              grade_level,
              capacity
            ),
            subjects(
              id,
              name
            ),
            academic_years(
              id,
              name,
              active
            )
          `)
          .eq("teacher_user_id", user.id);

        let formattedClasses: TeacherClass[] = [];
        let formattedSubjects: TeacherSubject[] = [];
        if (teachingAssignments && teachingAssignments.length > 0) {
          // Group by class section to avoid duplicates
          const classMap = new Map();
          const subjectMap = new Map();
          
          // Extract unique subjects
          for (const assignment of teachingAssignments) {
            const subject = assignment.subjects;
            if (subject && !subjectMap.has(subject.id)) {
              subjectMap.set(subject.id, {
                id: subject.id,
                name: subject.name
              });
            }
          }
          formattedSubjects = Array.from(subjectMap.values());
          setSubjects(formattedSubjects);
          
          // Fetch actual student counts and schedule for each class
          for (const assignment of teachingAssignments) {
            const classSection = assignment.class_sections;
            const subject = assignment.subjects;
            
            if (classSection && !classMap.has(classSection.id)) {
              // Fetch schedule information from class_section_subjects
              const { data: scheduleData } = await supabase
                .from("class_section_subjects")
                .select("schedule_days, schedule_time_start, schedule_time_end")
                .eq("class_section_id", classSection.id)
                .eq("subject_id", assignment.subject_id)
                .maybeSingle();
              
              // Get actual student count for this class (both verified and unverified)
              const { data: enrollments } = await supabase
                .from("enrollments")
                .select("student_user_id")
                .eq("class_section_id", classSection.id)
                .eq("status", "active");
              
              // Also count unverified students from student_temp_credentials
              const { data: tempStudents } = await supabase
                .from("student_temp_credentials")
                .select("student_user_id")
                .eq("class_section_id", classSection.id);
              
              // Get unique student IDs from both sources to avoid double counting
              const uniqueStudentIds = new Set([
                ...(enrollments?.map(e => e.student_user_id) || []),
                ...(tempStudents?.map(s => s.student_user_id) || [])
              ]);
              
              // Count unique students
              const studentCount = uniqueStudentIds.size;
              
              // Check if attendance was taken today for this class
              const today = new Date().toISOString().split('T')[0];
              const { data: todayAttendance } = await supabase
                .from("enhanced_attendance")
                .select("id")
                .eq("class_section_id", classSection.id)
                .eq("taken_by", user.id)
                .eq("date", today)
                .limit(1);
              
              // Format schedule time
              let scheduleTime = "Not scheduled";
              if (scheduleData?.schedule_time_start && scheduleData?.schedule_time_end) {
                scheduleTime = `${scheduleData.schedule_time_start} - ${scheduleData.schedule_time_end}`;
              }
              
              classMap.set(classSection.id, {
                id: classSection.id,
                name: classSection.name,
                grade_level: classSection.grade_level || "Unknown",
                student_count: studentCount,
                room: `Room ${Math.floor(Math.random() * 300) + 100}`, // Mock room for now
                subject: subject?.name || "Subject",
                subject_id: subject?.id,
                schedule_time: scheduleTime,
                schedule_days: scheduleData?.schedule_days || [],
                schedule_time_start: scheduleData?.schedule_time_start,
                schedule_time_end: scheduleData?.schedule_time_end,
                attendanceTaken: todayAttendance && todayAttendance.length > 0
              });
            }
          }
          
          formattedClasses = Array.from(classMap.values());
          setClasses(formattedClasses);

          // Calculate total students
          const totalStudents = formattedClasses.reduce((sum, cls) => sum + cls.student_count, 0);
          setStats(prev => ({ ...prev, totalStudents }));
        }

        // Fetch assignments created by this teacher
        const { data: createdAssignments } = await supabase
          .from("assignments")
          .select(`
            id,
            title,
            description,
            due_date,
            max_points,
            created_at,
            class_sections!assignments_class_id_fkey(name),
            subjects(name)
          `)
          .eq("teacher_id", user.id)
          .order("created_at", { ascending: false });

        if (createdAssignments) {
          const formattedAssignments: TeacherAssignment[] = createdAssignments.map(assignment => ({
            id: assignment.id,
            title: assignment.title,
            description: assignment.description,
            due_date: assignment.due_date ? new Date(assignment.due_date) : undefined,
            max_points: assignment.max_points,
            class_name: assignment.class_sections?.name || "Unknown Class",
            subject_name: assignment.subjects?.name || "No Subject",
            created_at: new Date(assignment.created_at),
            formattedDueDate: assignment.due_date ? formatDueDate(new Date(assignment.due_date)) : undefined,
            formattedCreatedDate: format(new Date(assignment.created_at), 'MMM d, yyyy')
          }));
          
          setAssignments(formattedAssignments);
          setStats(prev => ({ ...prev, totalAssignments: formattedAssignments.length }));
        }

        // Fetch real tasks from database
        const { data: tasksData } = await supabase
          .from("teacher_tasks")
          .select("*")
          .eq("teacher_user_id", user.id)
          .eq("status", "pending")
          .order("due_date", { ascending: true });

        if (tasksData) {
          setTasks(tasksData);
          setStats(prev => ({ ...prev, pendingTasks: tasksData.length }));
        } else {
          setTasks([]);
          setStats(prev => ({ ...prev, pendingTasks: 0 }));
        }

        // Fetch real messages from parents and admins
        const { data: messagesData } = await supabase
          .from("messages")
          .select(`
            id,
            subject,
            body,
            created_at,
            read_at,
            sender:profiles!messages_sender_user_id_fkey(
              user_id,
              first_name,
              last_name,
              role
            )
          `)
          .eq("recipient_user_id", user?.id)
          .in("sender.role", ["parent", "admin"])
          .order("created_at", { ascending: false })
          .limit(5);

        const formattedMessages: TeacherMessage[] = [];
        
        for (const msg of messagesData || []) {
          const senderName = `${msg.sender?.first_name || 'Unknown'} ${msg.sender?.last_name || 'User'}`;
          const rolePrefix = msg.sender?.role === 'admin' ? 'School Admin' : 'Parent';
          
          let displayName = `${rolePrefix} - ${senderName}`;
          
          // If sender is a parent, fetch their child's name
          if (msg.sender?.role === 'parent') {
            const { data: parentLinks } = await supabase
              .from("parent_student_links")
              .select(`
                student_user_id
              `)
              .eq("parent_user_id", msg.sender.user_id)
              .eq("status", "active")
              .limit(1)
              .maybeSingle();
            
            if (parentLinks?.student_user_id) {
              const { data: studentProfile } = await supabase
                .from("profiles")
                .select("first_name, last_name")
                .eq("user_id", parentLinks.student_user_id)
                .maybeSingle();
              
              if (studentProfile) {
                const childName = `${studentProfile.first_name} ${studentProfile.last_name}`;
                displayName = `${rolePrefix} - ${senderName} (${childName})`;
              }
            }
          }
          
          formattedMessages.push({
            id: msg.id,
            from: displayName,
            subject: msg.subject || "No subject",
            preview: msg.body.substring(0, 50) + (msg.body.length > 50 ? '...' : ''),
            time: new Date(msg.created_at),
            timeText: formatMessageTime(new Date(msg.created_at)),
            unread: !msg.read_at,
            senderId: msg.sender?.user_id
          });
        }

        setMessages(formattedMessages);

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
    try {
      const { error } = await supabase
        .from("teacher_tasks")
        .update({
          status: "completed",
          completed_at: new Date().toISOString()
        })
        .eq("id", taskId);

      if (error) throw error;

      setTasks(prev => prev.filter(task => task.id !== taskId));
      setStats(prev => ({ ...prev, pendingTasks: prev.pendingTasks - 1 }));
      
      toast({
        title: "Task Completed",
        description: "Task marked as complete"
      });
    } catch (error) {
      console.error("Error completing task:", error);
      toast({
        title: "Error",
        description: "Failed to complete task",
        variant: "destructive"
      });
    }
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
    subjects,
    assignments,
    tasks,
    messages,
    stats,
    markTaskComplete,
    markMessageRead,
    refetch: fetchTeacherData
  };
};