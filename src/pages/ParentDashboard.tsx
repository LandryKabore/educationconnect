import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, User, GraduationCap, Calendar, MessageCircle, Bell, BookOpen, TrendingUp, Calculator, Brain, Microscope, Code2, Lightbulb, Database } from "lucide-react";

const ParentDashboard = () => {
  const navigate = useNavigate();
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

  const childData = {
    name: "Emma Johnson",
    class: "Grade 8A",
    overallGrade: "A-",
    attendance: "96%",
  };

  const recentGrades = [
    { subject: "Mathematics", grade: "A", date: "Dec 8" },
    { subject: "English", grade: "A-", date: "Dec 6" },
    { subject: "Science", grade: "B+", date: "Dec 5" },
    { subject: "History", grade: "A", date: "Dec 3" },
  ];

  const upcomingExams = [
    { subject: "Mathematics", date: "Dec 15, 2024", time: "9:00 AM" },
    { subject: "French", date: "Dec 17, 2024", time: "10:30 AM" },
    { subject: "Physics", date: "Dec 19, 2024", time: "2:00 PM" },
  ];

  const announcements = [
    {
      title: "Parent-Teacher Conference",
      message: "Scheduled for December 20th. Please confirm your attendance.",
      date: "Dec 9",
      urgent: true,
    },
    {
      title: "Winter Break Schedule",
      message: "Classes will resume on January 8th, 2025.",
      date: "Dec 8",
      urgent: false,
    },
  ];

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
                variant="ghost" 
                size="icon"
                onClick={() => navigate("/")}
                className="shrink-0"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold text-white">Parent Dashboard</h1>
                <p className="text-sm text-slate-300">Welcome back!</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="icon" className="border-slate-600 text-slate-200 bg-slate-800/50 hover:bg-slate-700 hover:border-slate-400 hover:text-white">
                <Bell className="w-4 h-4" />
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
        {/* Child Overview */}
        <div className="mb-8">
          <Card className="bg-white/60 backdrop-blur-sm border border-white/20 shadow-xl hover:shadow-2xl transition-all duration-500">
            <CardHeader>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-red-500 rounded-2xl flex items-center justify-center shadow-lg">
                  <GraduationCap className="w-8 h-8 text-white" />
                </div>
                <div>
                  <CardTitle className="text-xl text-slate-900">{childData.name}</CardTitle>
                  <CardDescription className="text-slate-600">{childData.class}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-slate-100/80 rounded-xl">
                  <div className="text-2xl font-bold text-orange-500">{childData.overallGrade}</div>
                  <div className="text-sm text-slate-600">Overall Grade</div>
                </div>
                <div className="text-center p-4 bg-slate-100/80 rounded-xl">
                  <div className="text-2xl font-bold text-green-500">{childData.attendance}</div>
                  <div className="text-sm text-slate-600">Attendance</div>
                </div>
                <div className="text-center p-4 bg-slate-100/80 rounded-xl">
                  <div className="text-2xl font-bold text-blue-500">8</div>
                  <div className="text-sm text-slate-600">Subjects</div>
                </div>
                <div className="text-center p-4 bg-slate-100/80 rounded-xl">
                  <div className="text-2xl font-bold text-red-500">3</div>
                  <div className="text-sm text-slate-600">Upcoming Exams</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Recent Grades */}
          <Card className="bg-white/60 backdrop-blur-sm border border-white/20 shadow-xl hover:shadow-2xl transition-all duration-500 hover:-translate-y-1">
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-orange-500" />
                <CardTitle className="text-slate-900">Recent Grades</CardTitle>
              </div>
              <CardDescription className="text-slate-600">Latest academic performance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentGrades.map((grade, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-slate-100/80 rounded-xl">
                    <div>
                      <div className="font-medium text-slate-900">{grade.subject}</div>
                      <div className="text-sm text-slate-600">{grade.date}</div>
                    </div>
                    <div className="text-lg font-bold text-orange-500">{grade.grade}</div>
                  </div>
                ))}
              </div>
              <Button variant="outline" className="w-full mt-4">
                View All Grades
              </Button>
            </CardContent>
          </Card>

          {/* Upcoming Exams */}
          <Card className="bg-white/60 backdrop-blur-sm border border-white/20 shadow-xl hover:shadow-2xl transition-all duration-500 hover:-translate-y-1">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-500" />
                <CardTitle className="text-slate-900">Upcoming Exams</CardTitle>
              </div>
              <CardDescription className="text-slate-600">Important test dates</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {upcomingExams.map((exam, index) => (
                  <div key={index} className="p-3 bg-slate-100/80 rounded-xl">
                    <div className="font-medium text-slate-900">{exam.subject}</div>
                    <div className="text-sm text-slate-600">
                      {exam.date} at {exam.time}
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="outline" className="w-full mt-4">
                View Full Calendar
              </Button>
            </CardContent>
          </Card>

          {/* School Announcements */}
          <Card className="bg-white/60 backdrop-blur-sm border border-white/20 shadow-xl hover:shadow-2xl transition-all duration-500 hover:-translate-y-1">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-red-500" />
                <CardTitle className="text-slate-900">School Announcements</CardTitle>
              </div>
              <CardDescription className="text-slate-600">Latest updates from school</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {announcements.map((announcement, index) => (
                  <div key={index} className={`p-3 rounded-xl border ${announcement.urgent ? 'border-orange-300 bg-orange-50/80' : 'bg-slate-100/80'}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-slate-900">{announcement.title}</div>
                        <div className="text-sm text-slate-600 mt-1">{announcement.message}</div>
                      </div>
                      <div className="text-xs text-slate-500">{announcement.date}</div>
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="outline" className="w-full mt-4">
                View All Announcements
              </Button>
            </CardContent>
          </Card>

          {/* Teacher Communication */}
          <Card className="bg-white/60 backdrop-blur-sm border border-white/20 shadow-xl hover:shadow-2xl transition-all duration-500 hover:-translate-y-1">
            <CardHeader>
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-green-500" />
                <CardTitle className="text-slate-900">Teacher Messages</CardTitle>
              </div>
              <CardDescription className="text-slate-600">Recent communications</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="p-3 bg-slate-100/80 rounded-xl">
                  <div className="font-medium text-slate-900">Ms. Sarah Thompson</div>
                  <div className="text-sm text-slate-600">Mathematics Teacher</div>
                  <div className="text-sm text-slate-700 mt-1">Emma is showing excellent progress in algebra. Keep up the great work!</div>
                </div>
                <div className="p-3 bg-slate-100/80 rounded-xl">
                  <div className="font-medium text-slate-900">Mr. James Wilson</div>
                  <div className="text-sm text-slate-600">English Teacher</div>
                  <div className="text-sm text-slate-700 mt-1">Please review the reading assignment for next week's discussion.</div>
                </div>
              </div>
              <Button className="w-full mt-4 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white border-0">
                <MessageCircle className="w-4 h-4 mr-2" />
                Send Message to Teacher
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default ParentDashboard;