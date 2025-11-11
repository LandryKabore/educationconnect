import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, User, BookOpen, Calendar, Users, TrendingUp, Award, Clock, Calculator, Brain, Microscope, Code2, Lightbulb, Database, Loader2, GraduationCap, ChevronDown, MessageCircle } from "lucide-react";
import { useStudentData } from "@/hooks/useStudentData";
import { StatCardModal } from "@/components/StatCardModal";
import { StudentGradesModal } from "@/components/StudentGradesModal";
import { MessagesModal } from "@/components/MessagesModal";
import { useTranslation } from "react-i18next";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageToggle } from "@/components/LanguageToggle";
import { getCountdown } from "@/utils/countdownHelpers";
import { AllTeachersModal } from "@/components/AllTeachersModal";
import { StudyCalendarModal } from "@/components/StudyCalendarModal";
import { StudyGroupsModal } from "@/components/StudyGroupsModal";
import { LiveClock } from "@/components/LiveClock";

const StudentDashboard = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<"classes" | "students" | "tasks" | "attendance">("attendance");
  const [gradesModalOpen, setGradesModalOpen] = useState(false);
  const [messagesModalOpen, setMessagesModalOpen] = useState(false);
  const [subjectsModalOpen, setSubjectsModalOpen] = useState(false);
  const [teachersModalOpen, setTeachersModalOpen] = useState(false);
  const [calendarModalOpen, setCalendarModalOpen] = useState(false);
  const [studyGroupsModalOpen, setStudyGroupsModalOpen] = useState(false);
  const { loading, studentInfo, grades, assignments, gpa, attendanceRate } = useStudentData();

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({
        x: (e.clientX / window.innerWidth - 0.5) * 2,
        y: (e.clientY / window.innerHeight - 0.5) * 2,
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const floatingIcons = [
    { icon: Calculator, x: 15, y: 20, size: 25, delay: 0 },
    { icon: Brain, x: 85, y: 25, size: 30, delay: 0.1 },
    { icon: Microscope, x: 25, y: 70, size: 28, delay: 0.2 },
    { icon: Code2, x: 75, y: 65, size: 22, delay: 0.3 },
    { icon: Lightbulb, x: 10, y: 45, size: 26, delay: 0.4 },
    { icon: Database, x: 90, y: 80, size: 29, delay: 0.5 },
  ];

  // Mock data for features not yet implemented
  const studyMaterials = [
    { subject: "Mathematics", title: "Algebra Practice Problems", type: "PDF", uploadedBy: "Ms. Thompson", date: "Dec 7" },
    { subject: "Science", title: "Physics Formula Sheet", type: "PDF", uploadedBy: "Mr. Wilson", date: "Dec 6" },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="flex items-center gap-2 text-white">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>{t('loading')}</span>
        </div>
      </div>
    );
  }

  // Check if user has student data
  const hasStudentData = studentInfo?.student || studentInfo?.enrollment;
  
  if (!loading && !hasStudentData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <Card className="bg-slate-800/60 backdrop-blur-sm border border-slate-600/50 max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <User className="w-5 h-5" />
              No Student Profile Found
            </CardTitle>
            <CardDescription className="text-slate-300">
              You don't have a student profile or enrollment in the system.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-slate-300 text-sm">
              This could mean:
            </p>
            <ul className="list-disc list-inside text-slate-300 text-sm space-y-1">
              <li>You're not registered as a student</li>
              <li>You're logged in with a different role (teacher, admin, parent)</li>
              <li>Your student profile hasn't been created yet</li>
            </ul>
            <Button 
              onClick={() => navigate("/")}
              className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600"
            >
              Go to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative overflow-hidden">
      {/* Floating Interactive Elements */}
      {floatingIcons.map((item, index) => {
        const IconComponent = item.icon;
        const moveX = mousePosition.x * (8 + index * 1.5);
        const moveY = mousePosition.y * (6 + index * 1);
        
        return (
          <div
            key={index}
            className="absolute opacity-10 pointer-events-none"
            style={{
              left: `${item.x}%`,
              top: `${item.y}%`,
              transform: `translate(${moveX}px, ${moveY}px) rotate(${moveX * 0.03}deg)`,
            }}
          >
            <div className="p-2 rounded-xl bg-gradient-to-br from-orange-500/10 to-red-500/10 backdrop-blur-sm border border-orange-500/10">
              <IconComponent 
                size={item.size} 
                className="text-orange-400/30"
              />
            </div>
          </div>
        );
      })}
      
      {/* Background Grid Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:64px_64px]" />
      {/* Header */}
      <header className="bg-slate-800/50 border-b border-slate-700/50 shadow-xl backdrop-blur-sm relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Button 
                variant="outline" 
                size="icon"
                onClick={() => navigate("/")}
                className="shrink-0 border-slate-600 text-slate-200 bg-slate-800/50 hover:bg-slate-700 hover:border-slate-400 hover:text-white"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold text-white">{t('studentDashboard')}</h1>
                <p className="text-sm text-slate-300">
                  {studentInfo?.profile?.first_name && studentInfo?.profile?.last_name 
                    ? `${studentInfo.profile.first_name} ${studentInfo.profile.last_name}` 
                    : t('student')} - 
                  {studentInfo?.enrollment?.class_sections?.name || "Not Enrolled"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <LiveClock />
              {/* Subject Dropdown */}
              {studentInfo?.subjects && studentInfo.subjects.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="border-slate-600 text-slate-200 bg-slate-800/50 hover:bg-slate-700 hover:border-slate-400 hover:text-white">
                      <BookOpen className="w-4 h-4 mr-2" />
                      {t('subjects') || 'My Subjects'}
                      <ChevronDown className="w-4 h-4 ml-2" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="bg-slate-800 border-slate-600 z-50">
                    <DropdownMenuLabel className="text-slate-200">{t('activeSubjects') || 'Active Subjects'}</DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-slate-600" />
                    {studentInfo.subjects.map((subject) => (
                      <DropdownMenuItem 
                        key={subject.id} 
                        className="text-slate-300 hover:bg-slate-700 hover:text-white focus:bg-slate-700 focus:text-white"
                      >
                        <div className="flex flex-col">
                          <span className="font-medium">{subject.name}</span>
                          {subject.code && <span className="text-xs text-slate-400">{subject.code}</span>}
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <ThemeToggle />
              <LanguageToggle />
              <Button 
                variant="outline" 
                size="icon"
                onClick={() => setMessagesModalOpen(true)}
                className="border-slate-600 text-slate-200 bg-slate-800/50 hover:bg-slate-700 hover:border-slate-400 hover:text-white"
              >
                <MessageCircle className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="icon" className="border-slate-600 text-slate-200 bg-slate-800/50 hover:bg-slate-700 hover:border-slate-400 hover:text-white">
                <User className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        {/* Academic Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card 
            className="bg-slate-800/60 backdrop-blur-sm border border-slate-600/50 shadow-xl hover:shadow-2xl transition-all duration-500 cursor-pointer hover:scale-105 hover:border-orange-400/50"
            onClick={() => setGradesModalOpen(true)}
          >
            <CardContent className="p-6 text-center">
              <Award className="w-8 h-8 text-orange-400 mx-auto mb-2" />
              <div className="text-2xl font-bold text-orange-400">{gpa}</div>
              <div className="text-sm text-slate-300">{t('overallGPA')}</div>
            </CardContent>
          </Card>
          <Card 
            className="bg-slate-800/60 backdrop-blur-sm border border-slate-600/50 shadow-xl hover:shadow-2xl transition-all duration-500 cursor-pointer hover:scale-105 hover:border-green-400/50"
            onClick={() => {
              setModalType("attendance");
              setModalOpen(true);
            }}
          >
            <CardContent className="p-6 text-center">
              <Clock className="w-8 h-8 text-green-400 mx-auto mb-2" />
              <div className="text-2xl font-bold text-green-400">{attendanceRate}</div>
              <div className="text-sm text-slate-300">{t('attendance')}</div>
            </CardContent>
          </Card>
          <Card 
            className="bg-slate-800/60 backdrop-blur-sm border border-slate-600/50 shadow-xl hover:shadow-2xl transition-all duration-500 cursor-pointer hover:scale-105 hover:border-blue-400/50"
            onClick={() => setSubjectsModalOpen(true)}
          >
            <CardContent className="p-6 text-center">
              <BookOpen className="w-8 h-8 text-blue-400 mx-auto mb-2" />
              <div className="text-2xl font-bold text-blue-400">{studentInfo?.subjects?.length || 0}</div>
              <div className="text-sm text-slate-300">{t('activeSubjectsCount')}</div>
            </CardContent>
          </Card>
          <Card className="bg-slate-800/60 backdrop-blur-sm border border-slate-600/50 shadow-xl hover:shadow-2xl transition-all duration-500">
            <CardContent className="p-6 text-center">
              <Users className="w-8 h-8 text-red-400 mx-auto mb-2" />
              <div className="text-2xl font-bold text-red-400">{assignments.length}</div>
              <div className="text-sm text-slate-300">{t('upcomingAssignments')}</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Teachers Card */}
          <Card className="bg-slate-800/60 backdrop-blur-sm border border-slate-600/50 shadow-xl hover:shadow-2xl transition-all duration-500 hover:-translate-y-1">
            <CardHeader>
              <div className="flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-purple-400" />
                <CardTitle className="text-white">Your Teachers</CardTitle>
              </div>
              <CardDescription className="text-slate-300">Professors teaching in your class</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {studentInfo?.teachers && studentInfo.teachers.length > 0 ? 
                  studentInfo.teachers.slice(0, 3).map((teacher, index) => {
                    console.log('Teacher data:', teacher); // Debug log
                    return (
                      <div key={index} className="p-3 bg-slate-700/50 rounded-lg">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-white">
                              {teacher.profiles?.first_name && teacher.profiles?.last_name 
                                ? `${teacher.profiles.first_name} ${teacher.profiles.last_name}`
                                : 'Teacher Name Not Available'
                              }
                            </div>
                            <div className="text-sm text-slate-300">
                              {teacher.subjects?.name} {teacher.subjects?.code && `(${teacher.subjects.code})`}
                            </div>
                          </div>
                          <div className="p-2 bg-purple-500/20 rounded-lg">
                            <GraduationCap className="w-4 h-4 text-purple-400" />
                          </div>
                        </div>
                      </div>
                    )
                  }) : (
                    <div className="p-3 bg-slate-700/50 rounded-lg text-center text-slate-300">
                      No teachers assigned yet
                    </div>
                  )
                }
              </div>
              {studentInfo?.teachers && studentInfo.teachers.length > 3 && (
                <Button 
                  onClick={() => setTeachersModalOpen(true)}
                  className="w-full mt-4 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white border-0"
                >
                  View All Teachers ({studentInfo.teachers.length})
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Recent Grades */}
          <Card className="bg-slate-800/60 backdrop-blur-sm border border-slate-600/50 shadow-xl hover:shadow-2xl transition-all duration-500 hover:-translate-y-1">
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-orange-400" />
                <CardTitle className="text-white">Recent Grades</CardTitle>
              </div>
              <CardDescription className="text-slate-300">Your latest academic performance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {grades.length > 0 ? grades.slice(0, 4).map((grade) => (
                  <div key={grade.id} className="p-3 bg-slate-700/50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-white">{grade.subject}</div>
                        <div className="text-sm text-slate-300">{grade.assignment}</div>
                        <div className="text-xs text-slate-400">{grade.date}</div>
                      </div>
                      <div className="text-lg font-bold text-orange-400">{grade.grade}</div>
                    </div>
                  </div>
                )) : (
                  <div className="p-3 bg-slate-700/50 rounded-lg text-center text-slate-300">
                    No grades available yet
                  </div>
                )}
              </div>
              <Button 
                className="w-full mt-4 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white border-0"
                onClick={() => setGradesModalOpen(true)}
              >
                View All Grades
              </Button>
            </CardContent>
          </Card>

          {/* Upcoming Assignments & Exams */}
          <Card className="bg-slate-800/60 backdrop-blur-sm border border-slate-600/50 shadow-xl hover:shadow-2xl transition-all duration-500 hover:-translate-y-1">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-red-400" />
                <CardTitle className="text-white">Upcoming Tasks</CardTitle>
              </div>
              <CardDescription className="text-slate-300">Assignments and exams coming up</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {assignments.length > 0 ? assignments.slice(0, 3).map((assignment) => {
                  const dueDate = new Date(assignment.due_date);
                  const countdown = getCountdown(dueDate);
                  
                  return (
                    <div key={assignment.id} className="p-3 bg-slate-700/50 rounded-lg hover:bg-slate-700/70 cursor-pointer transition-all hover:scale-[1.02]">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="font-medium text-white">{assignment.title}</div>
                          <div className="text-sm text-slate-300">{assignment.subject}</div>
                          <div className="text-sm text-slate-400">
                            {assignment.type === 'exam' ? 'Exam' : 'Assignment'} • Due: {assignment.due_date_formatted}
                          </div>
                        </div>
                        <div className={`text-xs px-2 py-1 rounded ${
                          countdown.overdue 
                            ? 'bg-red-500/20 text-red-400' 
                            : countdown.urgent 
                              ? 'bg-yellow-500/20 text-yellow-400'
                              : 'bg-green-500/20 text-green-400'
                        }`}>
                          {countdown.display}
                        </div>
                      </div>
                    </div>
                  );
                }) : (
                  <div className="p-3 bg-slate-700/50 rounded-lg text-center text-slate-300">
                    No upcoming tasks
                  </div>
                )}
              </div>
              <Button 
                className="w-full mt-4 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white border-0"
                onClick={() => setCalendarModalOpen(true)}
              >
                View Study Calendar
              </Button>
            </CardContent>
          </Card>

          {/* Study Materials */}
          <Card className="bg-slate-800/60 backdrop-blur-sm border border-slate-600/50 shadow-xl hover:shadow-2xl transition-all duration-500 hover:-translate-y-1">
            <CardHeader>
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-blue-400" />
                <CardTitle className="text-white">Study Materials</CardTitle>
              </div>
              <CardDescription className="text-slate-300">Resources uploaded by your teachers</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {studyMaterials.map((material, index) => (
                  <div key={index} className="p-3 bg-slate-700/50 rounded-lg hover:bg-slate-700/70 cursor-pointer transition-colors">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-white">{material.title}</div>
                        <div className="text-sm text-slate-300">
                          {material.subject} • {material.type} • by {material.uploadedBy}
                        </div>
                        <div className="text-xs text-slate-400">{material.date}</div>
                      </div>
                      <Button className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white border-0" size="sm">
                        Download
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <Button className="w-full mt-4 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white border-0">
                Browse All Materials
              </Button>
            </CardContent>
          </Card>

          {/* Study Groups */}
          <Card className="bg-slate-800/60 backdrop-blur-sm border border-slate-600/50 shadow-xl hover:shadow-2xl transition-all duration-500 hover:-translate-y-1">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-green-400" />
                <CardTitle className="text-white">Study Groups</CardTitle>
              </div>
              <CardDescription className="text-slate-300">Collaborate with your classmates</CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={() => setStudyGroupsModalOpen(true)}
                className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white border-0"
              >
                <Users className="w-4 h-4 mr-2" />
                Manage Study Groups
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Attendance Modal */}
      <StatCardModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        type={modalType}
        data={[]}
        stats={{ totalStudents: 0, pendingTasks: 0 }}
      />
      
      {/* Student Grades Modal */}
      <StudentGradesModal
        open={gradesModalOpen}
        onOpenChange={setGradesModalOpen}
      />

      <MessagesModal
        open={messagesModalOpen}
        onOpenChange={setMessagesModalOpen}
      />

      {/* Subjects Modal */}
      <Dialog open={subjectsModalOpen} onOpenChange={setSubjectsModalOpen}>
        <DialogContent className="bg-slate-800 border-slate-600 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-blue-400" />
              Your Active Subjects
            </DialogTitle>
            <DialogDescription className="text-slate-300">
              All subjects you're currently enrolled in
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {studentInfo?.subjects && studentInfo.subjects.length > 0 ? (
              studentInfo.subjects.map((subject) => (
                <div key={subject.id} className="p-4 bg-slate-700/50 rounded-lg hover:bg-slate-700/70 transition-colors">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-white text-lg">{subject.name}</div>
                      {subject.code && <div className="text-sm text-slate-400">{subject.code}</div>}
                      {subject.description && <div className="text-sm text-slate-300 mt-1">{subject.description}</div>}
                    </div>
                    <div className="p-3 bg-blue-500/20 rounded-lg">
                      <BookOpen className="w-5 h-5 text-blue-400" />
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-4 bg-slate-700/50 rounded-lg text-center text-slate-300">
                No subjects enrolled yet
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AllTeachersModal
        open={teachersModalOpen}
        onOpenChange={setTeachersModalOpen}
        teachers={studentInfo?.teachers || []}
      />

      <StudyCalendarModal
        open={calendarModalOpen}
        onOpenChange={setCalendarModalOpen}
        assignments={assignments}
      />

      {studentInfo?.enrollment?.class_section_id && (
        <StudyGroupsModal
          open={studyGroupsModalOpen}
          onOpenChange={setStudyGroupsModalOpen}
          studentUserId={studentInfo.profile.user_id}
          classSectionId={studentInfo.enrollment.class_section_id}
          subjects={studentInfo.subjects || []}
        />
      )}
    </div>
  );
};

export default StudentDashboard;