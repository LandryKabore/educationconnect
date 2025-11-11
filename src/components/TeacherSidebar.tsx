import { useState, useEffect } from "react";
import { 
  Users, 
  BookOpen, 
  CheckSquare, 
  MessageCircle, 
  User,
  Search,
  Calendar,
  AlertCircle
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StudentInfoModal } from "./StudentInfoModal";
import { Badge } from "@/components/ui/badge";

interface TeacherSidebarProps {
  selectedClassId: string;
  onNavigate?: (section: string) => void;
}

interface Student {
  user_id: string;
  first_name: string;
  last_name: string;
  student_no: string;
}

export function TeacherSidebar({ selectedClassId, onNavigate }: TeacherSidebarProps) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const [searchQuery, setSearchQuery] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [studentModalOpen, setStudentModalOpen] = useState(false);
  
  // Notification counts
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [pendingGrades, setPendingGrades] = useState(0);
  const [studentsAtRisk, setStudentsAtRisk] = useState(0);

  const navItems = [
    { title: "Classes", icon: Users, section: "classes", badge: 0 },
    { title: "Assignments", icon: BookOpen, section: "assignments", badge: pendingGrades },
    { title: "Attendance", icon: CheckSquare, section: "attendance", badge: studentsAtRisk },
    { title: "Messages", icon: MessageCircle, section: "messages", badge: unreadMessages },
    { title: "Schedule", icon: Calendar, section: "schedule", badge: 0 },
    { title: "Profile", icon: User, section: "profile", badge: 0 },
  ];

  useEffect(() => {
    fetchNotificationCounts();
    
    // Set up real-time subscriptions
    const messagesChannel = supabase
      .channel('sidebar-messages')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
        },
        () => {
          fetchNotificationCounts();
        }
      )
      .subscribe();

    const gradesChannel = supabase
      .channel('sidebar-grades')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'enhanced_grades',
        },
        () => {
          fetchNotificationCounts();
        }
      )
      .subscribe();

    const attendanceChannel = supabase
      .channel('sidebar-attendance')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'enhanced_attendance',
        },
        () => {
          fetchNotificationCounts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(gradesChannel);
      supabase.removeChannel(attendanceChannel);
    };
  }, [selectedClassId]);

  useEffect(() => {
    if (selectedClassId !== "all") {
      fetchStudents();
    } else {
      setStudents([]);
      setFilteredStudents([]);
    }
  }, [selectedClassId]);

  useEffect(() => {
    if (searchQuery.trim()) {
      const filtered = students.filter(student => 
        `${student.first_name} ${student.last_name}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
        student.student_no?.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredStudents(filtered);
    } else {
      setFilteredStudents([]);
    }
  }, [searchQuery, students]);

  const fetchNotificationCounts = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch unread messages count
      const { count: messagesCount } = await supabase
        .from("messages")
        .select("*", { count: 'exact', head: true })
        .eq("recipient_user_id", user.id)
        .is("read_at", null);
      
      setUnreadMessages(messagesCount || 0);

      // Fetch pending grades count (exams without grades for enrolled students)
      const { data: teacherClasses } = await supabase
        .from("teaching_assignments")
        .select("class_section_id, subject_id")
        .eq("teacher_user_id", user.id);

      if (teacherClasses && teacherClasses.length > 0) {
        let totalPendingGrades = 0;
        
        for (const assignment of teacherClasses) {
          // Get exams for this teacher's classes
          const { data: exams } = await supabase
            .from("exams")
            .select("id")
            .eq("class_section_id", assignment.class_section_id)
            .eq("subject_id", assignment.subject_id);

          if (exams) {
            for (const exam of exams) {
              // Get students enrolled in this class
              const { data: enrollments } = await supabase
                .from("enrollments")
                .select("student_user_id")
                .eq("class_section_id", assignment.class_section_id)
                .eq("status", "active");

              if (enrollments) {
                for (const enrollment of enrollments) {
                  // Check if grade exists for this student and exam
                  const { data: grade } = await supabase
                    .from("enhanced_grades")
                    .select("id")
                    .eq("exam_id", exam.id)
                    .eq("student_user_id", enrollment.student_user_id)
                    .maybeSingle();

                  if (!grade) {
                    totalPendingGrades++;
                  }
                }
              }
            }
          }
        }
        
        setPendingGrades(totalPendingGrades);

        // Fetch students at risk (attendance < 60%)
        const classIds = teacherClasses.map(c => c.class_section_id);
        const { data: attendanceData } = await supabase
          .from("enhanced_attendance")
          .select("student_user_id, status")
          .in("class_section_id", classIds);

        if (attendanceData) {
          // Group by student and calculate rates
          const studentAttendance = attendanceData.reduce((acc: any, record) => {
            if (!acc[record.student_user_id]) {
              acc[record.student_user_id] = { total: 0, attending: 0 };
            }
            acc[record.student_user_id].total++;
            if (["present", "late", "excused"].includes(record.status)) {
              acc[record.student_user_id].attending++;
            }
            return acc;
          }, {});

          const atRiskCount = Object.values(studentAttendance).filter((stats: any) => {
            const rate = (stats.attending / stats.total) * 100;
            return rate < 60 && stats.total >= 5; // At least 5 records to be meaningful
          }).length;

          setStudentsAtRisk(atRiskCount);
        }
      }
    } catch (error) {
      console.error("Error fetching notification counts:", error);
    }
  };

  const fetchStudents = async () => {
    try {
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select(`
          student_user_id,
          profiles!enrollments_student_user_id_fkey(
            user_id,
            first_name,
            last_name
          ),
          student_profiles!enrollments_student_user_id_fkey(
            student_no
          )
        `)
        .eq("class_section_id", selectedClassId)
        .eq("status", "active");

      if (enrollments) {
        const studentList: Student[] = enrollments.map((enrollment: any) => ({
          user_id: enrollment.profiles.user_id,
          first_name: enrollment.profiles.first_name || "Unknown",
          last_name: enrollment.profiles.last_name || "Student",
          student_no: enrollment.student_profiles?.student_no || "N/A"
        }));
        setStudents(studentList);
      }
    } catch (error) {
      console.error("Error fetching students:", error);
    }
  };

  const handleStudentClick = (studentUserId: string) => {
    setSelectedStudent(studentUserId);
    setStudentModalOpen(true);
  };

  return (
    <>
      <Sidebar
        className={collapsed ? "w-16" : "w-64"}
      >
        <div className="p-2 border-b border-slate-700">
          <SidebarTrigger className="w-full" />
        </div>

        <SidebarContent>
          {/* Navigation */}
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton 
                      asChild
                      onClick={() => onNavigate?.(item.section)}
                    >
                      <button className="hover:bg-slate-700/50 w-full relative">
                        <item.icon className="w-4 h-4 flex-shrink-0" />
                        {!collapsed && (
                          <>
                            <span className="flex-1">{item.title}</span>
                            {item.badge > 0 && (
                              <Badge className="ml-auto bg-red-500 hover:bg-red-500 h-5 min-w-5 flex items-center justify-center p-0 px-1.5">
                                {item.badge > 99 ? "99+" : item.badge}
                              </Badge>
                            )}
                          </>
                        )}
                        {collapsed && item.badge > 0 && (
                          <div className="absolute -top-1 -right-1 h-3 w-3 bg-red-500 rounded-full" />
                        )}
                      </button>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* Student Search */}
          {!collapsed && selectedClassId !== "all" && (
            <SidebarGroup>
              <SidebarGroupLabel>Student Search</SidebarGroupLabel>
              <SidebarGroupContent>
                <div className="px-2 py-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Search students..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8 bg-slate-800 border-slate-600 text-white"
                    />
                  </div>
                  {filteredStudents.length > 0 && (
                    <ScrollArea className="h-[300px] mt-2">
                      <div className="space-y-1">
                        {filteredStudents.map((student) => (
                          <button
                            key={student.user_id}
                            onClick={() => handleStudentClick(student.user_id)}
                            className="w-full text-left px-3 py-2 rounded-md hover:bg-slate-700/50 transition-colors"
                          >
                            <div className="font-medium text-white text-sm">
                              {student.first_name} {student.last_name}
                            </div>
                            <div className="text-xs text-slate-400">
                              #{student.student_no}
                            </div>
                          </button>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                  {searchQuery && filteredStudents.length === 0 && (
                    <div className="text-sm text-slate-400 text-center mt-4">
                      No students found
                    </div>
                  )}
                </div>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>
      </Sidebar>

      {selectedStudent && (
        <StudentInfoModal
          open={studentModalOpen}
          onOpenChange={setStudentModalOpen}
          studentUserId={selectedStudent}
          classId={selectedClassId}
        />
      )}
    </>
  );
}
