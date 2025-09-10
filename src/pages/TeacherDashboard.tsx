import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, User, Users, Calendar, Upload, MessageCircle, CheckSquare, BookOpen, TrendingUp, Calculator, Brain, Microscope, Code2, Lightbulb, Database } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageToggle } from "@/components/LanguageToggle";

const TeacherDashboard = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

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

  const teacherData = {
    name: "Ms. Sarah Thompson",
    subject: "Mathematics",
    classes: ["8A", "8B", "9A"],
    totalStudents: 87,
  };

  const todayClasses = [
    { class: "8A", subject: "Algebra", time: "9:00 AM", room: "Room 201", students: 28 },
    { class: "8B", subject: "Geometry", time: "11:00 AM", room: "Room 201", students: 30 },
    { class: "9A", subject: "Advanced Math", time: "2:00 PM", room: "Room 203", students: 29 },
  ];

  const pendingTasks = [
    { task: "Grade Math Quiz - 8A", urgent: true, due: "Today" },
    { task: "Upload Study Materials - 9A", urgent: false, due: "Tomorrow" },
    { task: "Parent Meeting - Emma Johnson", urgent: true, due: "Today 3PM" },
    { task: "Attendance Review - 8B", urgent: false, due: "This Week" },
  ];

  const recentMessages = [
    {
      from: "John Parent",
      subject: "Question about homework",
      preview: "Could you clarify the algebra assignment...",
      time: "2 hours ago",
      unread: true,
    },
    {
      from: "School Admin",
      subject: "Weekly Report Due",
      preview: "Please submit your weekly progress report...",
      time: "1 day ago",
      unread: false,
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden">
      {/* Theme and Language Controls */}
      <div className="absolute top-4 right-4 z-20 flex gap-2">
        <LanguageToggle />
        <ThemeToggle />
      </div>
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
      <header className="bg-card border-b border-border shadow-xl backdrop-blur-sm relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Button 
                variant="outline" 
                size="icon"
                onClick={() => navigate("/")}
                className="shrink-0"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold text-foreground">{t('dashboard.teacher.title')}</h1>
                <p className="text-sm text-muted-foreground">{teacherData.name} - {teacherData.subject}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="icon">
                <MessageCircle className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="icon">
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
          <Card className="bg-card border-border shadow-xl hover:shadow-2xl transition-all duration-500">
            <CardContent className="p-6 text-center">
              <div className="text-2xl font-bold text-primary">{teacherData.classes.length}</div>
              <div className="text-sm text-muted-foreground">{t('dashboard.teacher.activeClasses')}</div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-xl hover:shadow-2xl transition-all duration-500">
            <CardContent className="p-6 text-center">
              <div className="text-2xl font-bold text-accent">{teacherData.totalStudents}</div>
              <div className="text-sm text-muted-foreground">{t('dashboard.teacher.totalStudents')}</div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-xl hover:shadow-2xl transition-all duration-500">
            <CardContent className="p-6 text-center">
              <div className="text-2xl font-bold text-destructive">4</div>
              <div className="text-sm text-muted-foreground">{t('dashboard.teacher.pendingTasks')}</div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-xl hover:shadow-2xl transition-all duration-500">
            <CardContent className="p-6 text-center">
              <div className="text-2xl font-bold text-success">96%</div>
              <div className="text-sm text-muted-foreground">{t('dashboard.teacher.avgAttendance')}</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
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
                {todayClasses.map((classInfo, index) => (
                  <div key={index} className="p-4 bg-slate-700/50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-white">{classInfo.class} - {classInfo.subject}</div>
                        <div className="text-sm text-slate-300">
                          {classInfo.time} • {classInfo.room} • {classInfo.students} students
                        </div>
                      </div>
                      <Button className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white border-0" size="sm">
                        <CheckSquare className="w-4 h-4 mr-2" />
                        Attendance
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
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
                <Button className="h-16 flex-col bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white border-0">
                  <CheckSquare className="w-5 h-5 mb-1" />
                  Take Attendance
                </Button>
                <Button className="h-16 flex-col bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white border-0">
                  <TrendingUp className="w-5 h-5 mb-1" />
                  Enter Grades
                </Button>
                <Button className="h-16 flex-col bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white border-0">
                  <Upload className="w-5 h-5 mb-1" />
                  Upload Resources
                </Button>
                <Button className="h-16 flex-col bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white border-0">
                  <Users className="w-5 h-5 mb-1" />
                  Manage Classes
                </Button>
              </div>
            </CardContent>
          </Card>

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
                {pendingTasks.map((task, index) => (
                  <div key={index} className={`p-3 rounded-lg border ${task.urgent ? 'border-orange-400/50 bg-orange-400/10' : 'bg-slate-700/50'}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-white">{task.task}</div>
                        <div className="text-sm text-slate-300">Due: {task.due}</div>
                      </div>
                      {task.urgent && (
                        <div className="text-xs bg-orange-500 text-white px-2 py-1 rounded">
                          Urgent
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <Button className="w-full mt-4 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white border-0">
                View All Tasks
              </Button>
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
                {recentMessages.map((message, index) => (
                  <div key={index} className={`p-3 rounded-lg ${message.unread ? 'bg-orange-400/10 border border-orange-400/20' : 'bg-slate-700/50'}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-white">{message.from}</div>
                        <div className="text-sm font-medium text-slate-300">{message.subject}</div>
                        <div className="text-sm text-slate-300 mt-1">{message.preview}</div>
                      </div>
                      <div className="text-xs text-slate-400">{message.time}</div>
                    </div>
                  </div>
                ))}
              </div>
              <Button className="w-full mt-4 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white border-0">
                <MessageCircle className="w-4 h-4 mr-2" />
                View All Messages
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default TeacherDashboard;