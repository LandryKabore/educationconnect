import { useState, useEffect } from "react";
import { 
  Users, 
  BookOpen, 
  CheckSquare, 
  MessageCircle, 
  User,
  Search,
  Calendar
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

  const navItems = [
    { title: "Classes", icon: Users, section: "classes" },
    { title: "Assignments", icon: BookOpen, section: "assignments" },
    { title: "Attendance", icon: CheckSquare, section: "attendance" },
    { title: "Messages", icon: MessageCircle, section: "messages" },
    { title: "Schedule", icon: Calendar, section: "schedule" },
    { title: "Profile", icon: User, section: "profile" },
  ];

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
        <SidebarTrigger className="m-2 self-end" />

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
                      <button className="hover:bg-slate-700/50 w-full">
                        <item.icon className="w-4 h-4" />
                        {!collapsed && <span>{item.title}</span>}
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
