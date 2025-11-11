import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, User, Users, Calendar, Upload, MessageCircle, CheckSquare, BookOpen, TrendingUp, Calculator, Brain, Microscope, Code2, Lightbulb, Database, Loader2, Clock, FileText, Menu } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "react-i18next";
import { useTeacherData } from "@/hooks/useTeacherData";
import { CreateAssignmentModal } from "@/components/CreateAssignmentModal";
import { AllGradesModal } from "@/components/AllGradesModal";
import { GradeStudentModal } from "@/components/GradeStudentModal";
import { AttendanceModal } from "@/components/AttendanceModal";
import { StatCardModal } from "@/components/StatCardModal";
import { MessagesModal } from "@/components/MessagesModal";
import { ParentSelectorModal } from "@/components/ParentSelectorModal";
import { CreateTaskModal } from "@/components/CreateTaskModal";
import { TasksModal } from "@/components/TasksModal";
import { LanguageToggle } from "@/components/LanguageToggle";
import { AllAssignmentsModal } from "@/components/AllAssignmentsModal";
import { TeacherScheduleModal } from "@/components/TeacherScheduleModal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { getCountdown } from "@/utils/countdownHelpers";
import { LiveClock } from "@/components/LiveClock";

const TeacherDashboard = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<"classes" | "students" | "tasks" | "attendance">("classes");
  const [messagesModalOpen, setMessagesModalOpen] = useState(false);
  const [selectedMessageSender, setSelectedMessageSender] = useState<{userId: string, name: string} | null>(null);
  const [parentSelectorOpen, setParentSelectorOpen] = useState(false);
  const [tasksModalOpen, setTasksModalOpen] = useState(false);
  const [allAssignmentsOpen, setAllAssignmentsOpen] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<string>("all");
  const [currentTime, setCurrentTime] = useState(new Date());
  const { loading, teacherInfo, classes, subjects, assignments, tasks, messages, stats, markTaskComplete, markMessageRead, refetch } = useTeacherData();

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

  // Update current time every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(timer);
  }, []);

  const handleCardClick = (type: "classes" | "students" | "tasks" | "attendance") => {
    setModalType(type);
    setModalOpen(true);
  };

  const floatingIcons = [
    { icon: Calculator, x: 15, y: 20, size: 25, delay: 0 },
    { icon: Brain, x: 85, y: 25, size: 30, delay: 0.1 },
    { icon: Microscope, x: 25, y: 70, size: 28, delay: 0.2 },
    { icon: Code2, x: 75, y: 65, size: 22, delay: 0.3 },
    { icon: Lightbulb, x: 10, y: 45, size: 26, delay: 0.4 },
    { icon: Database, x: 90, y: 80, size: 29, delay: 0.5 },
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
        <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8">
          <div className="flex items-center justify-between gap-2 h-16">
            {/* Left Section */}
            <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-shrink">
              <Button 
                variant="outline" 
                size="icon"
                onClick={() => navigate("/")}
                className="shrink-0 border-slate-600 text-slate-200 bg-slate-800/50 hover:bg-slate-700 hover:border-slate-400 hover:text-white"
              >
                <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              </Button>
              <div className="min-w-0">
                <h1 className="text-sm sm:text-xl font-bold text-white truncate">{t('teacher.dashboard')}</h1>
                <p className="text-xs sm:text-sm text-slate-300 truncate">
                  {teacherInfo?.profile ? `${teacherInfo.profile.first_name} ${teacherInfo.profile.last_name}` : t('teacher')}
                </p>
              </div>
            </div>

            {/* Desktop Middle Section */}
            <div className="hidden lg:flex items-center gap-4 text-slate-300">
              <LanguageToggle />
              <LiveClock />
              {classes.length > 0 && (
                <div className="flex items-center gap-3 border-l border-slate-600 pl-4">
                  <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                    <SelectTrigger className="w-[200px] bg-slate-700/50 border-slate-600 text-white">
                      <SelectValue placeholder="Select class" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="all" className="text-white">All Classes</SelectItem>
                      {classes.map((cls) => (
                        <SelectItem key={cls.id} value={cls.id} className="text-white">
                          {cls.name} - {cls.subject}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button 
                    variant="outline"
                    size="sm"
                    onClick={() => setScheduleModalOpen(true)}
                    className="border-slate-600 text-slate-200 bg-slate-800/50 hover:bg-slate-700 hover:border-orange-400 hover:text-white"
                  >
                    <Calendar className="w-4 h-4 mr-2" />
                    Full Schedule
                  </Button>
                </div>
              )}
            </div>

            {/* Right Section */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {/* Mobile Menu Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="icon"
                    className="lg:hidden border-slate-600 text-slate-200 bg-slate-800/50 hover:bg-slate-700 hover:border-slate-400 hover:text-white"
                  >
                    <Menu className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56 bg-slate-800 border-slate-700 z-50" align="end">
                  <div className="p-2">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-slate-400">Language</span>
                      <LanguageToggle />
                    </div>
                  </div>
                  <DropdownMenuSeparator className="bg-slate-700" />
                  <div className="p-2">
                    <div className="text-xs text-slate-400 mb-1">Current Time</div>
                    <LiveClock />
                  </div>
                  {classes.length > 0 && (
                    <>
                      <DropdownMenuSeparator className="bg-slate-700" />
                      <div className="p-2">
                        <div className="text-xs text-slate-400 mb-2">Class Filter</div>
                        <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                          <SelectTrigger className="w-full bg-slate-700/50 border-slate-600 text-white text-sm">
                            <SelectValue placeholder="Select class" />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-800 border-slate-700 z-[100]">
                            <SelectItem value="all" className="text-white">All Classes</SelectItem>
                            {classes.map((cls) => (
                              <SelectItem key={cls.id} value={cls.id} className="text-white">
                                {cls.name} - {cls.subject}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <DropdownMenuSeparator className="bg-slate-700" />
                      <DropdownMenuItem 
                        className="text-white hover:bg-slate-700 cursor-pointer"
                        onClick={() => setScheduleModalOpen(true)}
                      >
                        <Calendar className="w-4 h-4 mr-2" />
                        Full Schedule
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="relative">
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => setMessagesModalOpen(true)}
                  className="border-slate-600 text-slate-200 bg-slate-800/50 hover:bg-slate-700 hover:border-slate-400 hover:text-white"
                >
                  <MessageCircle className="w-4 h-4" />
                </Button>
                {messages.filter(msg => msg.unread).length > 0 && (
                  <Badge className="absolute -top-1 -right-1 h-5 min-w-5 flex items-center justify-center p-0 px-1 bg-red-500 hover:bg-red-500 text-white text-xs">
                    {messages.filter(msg => msg.unread).length}
                  </Badge>
                )}
              </div>
              <Button variant="outline" size="icon" className="border-slate-600 text-slate-200 bg-slate-800/50 hover:bg-slate-700 hover:border-slate-400 hover:text-white">
                <User className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card 
            className="bg-slate-800/60 backdrop-blur-sm border border-slate-600/50 shadow-xl hover:shadow-2xl transition-all duration-500 cursor-pointer hover:scale-105 hover:border-orange-400/50"
            onClick={() => handleCardClick("classes")}
          >
            <CardContent className="p-6 text-center">
              <div className="text-2xl font-bold text-orange-400">{classes.length}</div>
              <div className="text-sm text-slate-300">Active Classes</div>
            </CardContent>
          </Card>
          <Card 
            className="bg-slate-800/60 backdrop-blur-sm border border-slate-600/50 shadow-xl hover:shadow-2xl transition-all duration-500 cursor-pointer hover:scale-105 hover:border-blue-400/50"
            onClick={() => handleCardClick("students")}
          >
            <CardContent className="p-6 text-center">
              <div className="text-2xl font-bold text-blue-400">{stats.totalStudents}</div>
              <div className="text-sm text-slate-300">Total Students</div>
            </CardContent>
          </Card>
          <Card 
            className="bg-slate-800/60 backdrop-blur-sm border border-slate-600/50 shadow-xl hover:shadow-2xl transition-all duration-500 cursor-pointer hover:scale-105 hover:border-red-400/50"
            onClick={() => handleCardClick("tasks")}
          >
            <CardContent className="p-6 text-center">
              <div className="text-2xl font-bold text-red-400">{stats.pendingTasks}</div>
              <div className="text-sm text-slate-300">Pending Tasks</div>
            </CardContent>
          </Card>
          <Card 
            className="bg-slate-800/60 backdrop-blur-sm border border-slate-600/50 shadow-xl hover:shadow-2xl transition-all duration-500 cursor-pointer hover:scale-105 hover:border-green-400/50"
            onClick={() => handleCardClick("attendance")}
          >
            <CardContent className="p-6 text-center">
              <div className="text-2xl font-bold text-green-400">{stats.avgAttendance}</div>
              <div className="text-sm text-slate-300">Avg Attendance</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
          {/* Today's Classes */}
          <Card className="bg-slate-800/60 backdrop-blur-sm border border-slate-600/50 shadow-xl hover:shadow-2xl transition-all duration-500 hover:-translate-y-1">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-orange-400" />
                <CardTitle className="text-white">Today's Classes</CardTitle>
              </div>
              <CardDescription className="text-slate-300">Your schedule for today</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {classes.length > 0 ? classes
                  .filter(cls => selectedClassId === "all" || cls.id === selectedClassId)
                  .map((classInfo) => (
                  <div key={classInfo.id} className="p-4 bg-slate-700/50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-white">{classInfo.name} - {classInfo.grade_level}</div>
                        <div className="text-sm text-slate-300">
                          {classInfo.schedule_time} • {classInfo.room} • {classInfo.student_count} students
                        </div>
                      </div>
                      <Button 
                        className={`${
                          classInfo.attendanceTaken 
                            ? 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700' 
                            : 'bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600'
                        } text-white border-0`} 
                        size="sm"
                      >
                        <CheckSquare className="w-4 h-4 mr-2" />
                        {classInfo.attendanceTaken ? 'Attendance ✓' : 'Attendance'}
                      </Button>
                    </div>
                  </div>
                )) : (
                  <div className="p-4 bg-slate-700/50 rounded-lg text-center text-slate-300">
                    No classes assigned yet
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Recent Assignments */}
          <Card className="bg-slate-800/60 backdrop-blur-sm border border-slate-600/50 shadow-xl hover:shadow-2xl transition-all duration-500 hover:-translate-y-1">
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-purple-400" />
                <CardTitle className="text-white">Recent Assignments</CardTitle>
              </div>
              <CardDescription className="text-slate-300">Your created assignments</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
{assignments.length > 0 ? assignments.slice(0, 3).map((assignment) => {
                  const dueDate = assignment.due_date ? new Date(assignment.due_date) : null;
                  const countdown = dueDate ? getCountdown(dueDate) : null;
                  
                  return (
                  <div key={assignment.id} className="p-4 bg-slate-700/50 rounded-lg">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-white">{assignment.title}</div>
                        <div className="text-sm text-slate-300">
                          {assignment.class_name} • {assignment.subject_name}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          Created: {assignment.formattedCreatedDate}
                          {assignment.formattedDueDate && (
                            <> • Due: {assignment.formattedDueDate}</>
                          )}
                        </div>
                      </div>
                       <div className="flex flex-col items-end gap-1">
                         {assignment.max_points && (
                           <div className="text-sm text-slate-400">
                             {assignment.max_points} pts
                           </div>
                         )}
                         {countdown && (
                           <div className={`text-xs px-2 py-1 rounded ${
                             countdown.overdue 
                               ? 'bg-red-500/20 text-red-400' 
                               : countdown.urgent 
                                 ? 'bg-yellow-500/20 text-yellow-400'
                                 : 'bg-green-500/20 text-green-400'
                           }`}>
                             {countdown.display}
                           </div>
                         )}
                       </div>
                     </div>
                   </div>
                   );
                 }) : (
                  <div className="p-4 bg-slate-700/50 rounded-lg text-center text-slate-300">
                    No assignments created yet
                  </div>
                )}
              </div>
              {assignments.length > 3 && (
                <Button 
                  onClick={() => setAllAssignmentsOpen(true)}
                  className="w-full mt-4 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white border-0"
                >
                  View All Assignments ({assignments.length})
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card className="bg-slate-800/60 backdrop-blur-sm border border-slate-600/50 shadow-xl hover:shadow-2xl transition-all duration-500 hover:-translate-y-1">
            <CardHeader>
              <CardTitle className="text-white">Quick Actions</CardTitle>
              <CardDescription className="text-slate-300">Common tasks and tools</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <AttendanceModal onAttendanceSubmitted={refetch} />
                <GradeStudentModal onGradeSubmitted={refetch} />
                <CreateAssignmentModal 
                  classes={classes.map(c => ({ id: c.id, name: c.name }))} 
                  subjects={subjects} 
                  onAssignmentCreated={refetch} 
                />
                <AllGradesModal />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">

          {/* Pending Tasks */}
          <Card className="bg-slate-800/60 backdrop-blur-sm border border-slate-600/50 shadow-xl hover:shadow-2xl transition-all duration-500 hover:-translate-y-1">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-red-400" />
                <CardTitle className="text-white">Pending Tasks</CardTitle>
              </div>
              <CardDescription className="text-slate-300">Items requiring your attention</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {tasks.length > 0 ? tasks.slice(0, 4).map((task) => {
                  const dueDate = new Date(task.due_date);
                  const now = new Date();
                  const diffHours = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);
                  const isUrgent = diffHours > 0 && diffHours <= 24;
                  const isOverdue = dueDate < now;
                  
                  return (
                    <div key={task.id} className={`p-3 rounded-lg border ${
                      isOverdue ? 'border-red-400/50 bg-red-400/10' : 
                      isUrgent ? 'border-orange-400/50 bg-orange-400/10' : 
                      'bg-slate-700/50 border-slate-600'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="font-medium text-white">{task.title}</div>
                          <div className="text-sm text-slate-300">
                            Due: {format(dueDate, "MMM d, yyyy 'at' h:mm a")}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {isOverdue && (
                            <div className="text-xs bg-red-500 text-white px-2 py-1 rounded">
                              Overdue
                            </div>
                          )}
                          {isUrgent && !isOverdue && (
                            <div className="text-xs bg-orange-500 text-white px-2 py-1 rounded">
                              Urgent
                            </div>
                          )}
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => markTaskComplete(task.id)}
                            className="text-xs"
                          >
                            Complete
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                }) : (
                  <div className="p-3 bg-slate-700/50 rounded-lg text-center text-slate-300">
                    No pending tasks
                  </div>
                )}
              </div>
              <div className="flex gap-2 mt-4">
                <CreateTaskModal onTaskCreated={refetch} />
                <Button 
                  className="flex-1 bg-slate-700 hover:bg-slate-600 text-white border-0"
                  onClick={() => setTasksModalOpen(true)}
                >
                  View All Tasks
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Recent Messages */}
          <Card className="bg-slate-800/60 backdrop-blur-sm border border-slate-600/50 shadow-xl hover:shadow-2xl transition-all duration-500 hover:-translate-y-1">
            <CardHeader>
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-green-400" />
                <CardTitle className="text-white">Recent Messages</CardTitle>
              </div>
              <CardDescription className="text-slate-300">Communications from parents and admin</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {messages.length > 0 ? messages.map((message) => (
                  <div 
                    key={message.id} 
                    className={`p-3 rounded-lg cursor-pointer transition-all hover:bg-slate-700/70 ${message.unread ? 'bg-orange-400/10 border border-orange-400/20' : 'bg-slate-700/50'}`}
                    onClick={() => {
                      if (message.senderId) {
                        setSelectedMessageSender({
                          userId: message.senderId,
                          name: message.from
                        });
                        setMessagesModalOpen(true);
                      }
                    }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-white">{message.from}</div>
                        <div className="text-sm font-medium text-slate-300">{message.subject}</div>
                        <div className="text-sm text-slate-300 mt-1">{message.preview}</div>
                      </div>
                      <div className="text-xs text-slate-400">{message.timeText}</div>
                    </div>
                  </div>
                )) : (
                  <div className="p-3 bg-slate-700/50 rounded-lg text-center text-slate-300">
                    No recent messages
                  </div>
                )}
              </div>
              <div className="flex gap-2 mt-4">
                <Button 
                  variant="outline"
                  className="flex-1 border-slate-600 text-white hover:bg-slate-700"
                  onClick={() => setMessagesModalOpen(true)}
                >
                  View All
                </Button>
                <Button 
                  className="flex-1 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white border-0"
                  onClick={() => setParentSelectorOpen(true)}
                >
                  <MessageCircle className="w-4 h-4 mr-2" />
                  New Message
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Stat Card Modal */}
      <StatCardModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        type={modalType}
        data={modalType === "tasks" ? tasks : classes}
        stats={stats}
      />

      <MessagesModal
        open={messagesModalOpen}
        onOpenChange={(open) => {
          setMessagesModalOpen(open);
          if (!open) setSelectedMessageSender(null);
        }}
        preselectedUserId={selectedMessageSender?.userId}
        preselectedUserName={selectedMessageSender?.name}
      />

      <ParentSelectorModal
        open={parentSelectorOpen}
        onOpenChange={setParentSelectorOpen}
        onSelectParent={(parentId, parentName) => {
          setSelectedMessageSender({ userId: parentId, name: parentName });
          setParentSelectorOpen(false);
          setMessagesModalOpen(true);
        }}
      />

      <TasksModal
        open={tasksModalOpen}
        onOpenChange={setTasksModalOpen}
        tasks={tasks}
        onTaskUpdate={refetch}
      />

      <AllAssignmentsModal
        open={allAssignmentsOpen}
        onOpenChange={setAllAssignmentsOpen}
        assignments={assignments}
      />
      
      <TeacherScheduleModal
        isOpen={scheduleModalOpen}
        onClose={() => setScheduleModalOpen(false)}
        scheduleClasses={classes.map(cls => ({
          id: cls.id,
          name: cls.name,
          subject: cls.subject || "Subject",
          grade_level: cls.grade_level,
          days: cls.schedule_days || [],
          time_start: cls.schedule_time_start || "TBD",
          time_end: cls.schedule_time_end || "TBD",
          student_count: cls.student_count
        }))}
      />
    </div>
  );
};

export default TeacherDashboard;