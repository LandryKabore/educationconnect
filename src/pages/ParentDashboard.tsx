import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, User, GraduationCap, Calendar, MessageCircle, Bell, BookOpen, TrendingUp, Calculator, Brain, Microscope, Code2, Lightbulb, Database, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useParentData } from "@/hooks/useParentData";
import { useMessages } from "@/hooks/useMessages";
import { LanguageToggle } from "@/components/LanguageToggle";
import { AttendanceBreakdownModal } from "@/components/AttendanceBreakdownModal";
import { ParentProfileModal } from "@/components/ParentProfileModal";
import { MessagesModal } from "@/components/MessagesModal";

const ParentDashboard = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [attendanceModalOpen, setAttendanceModalOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [messagesModalOpen, setMessagesModalOpen] = useState(false);
  const { loading, children, currentChild, selectedChildId, setSelectedChildId, grades, exams, announcements, classAttendance, parentInfo } = useParentData();
  const { conversations } = useMessages();

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

  if (children.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center text-white">
          <h2 className="text-2xl font-bold mb-4">{t('parent.noChildren')}</h2>
          <p className="text-slate-300">{t('parent.noChildren')}</p>
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
                <h1 className="text-xl font-bold text-white">{t('parent.dashboard')}</h1>
                <p className="text-sm text-slate-300">{t('welcomeBack')}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <LanguageToggle />
              <Button variant="outline" size="icon" className="border-slate-600 text-slate-200 bg-slate-800/50 hover:bg-slate-700 hover:border-slate-400 hover:text-white">
                <Bell className="w-4 h-4" />
              </Button>
              <Button 
                variant="outline" 
                size="icon" 
                onClick={() => setProfileModalOpen(true)}
                className="border-slate-600 text-slate-200 bg-slate-800/50 hover:bg-slate-700 hover:border-slate-400 hover:text-white"
              >
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
          <Card className="bg-slate-800/60 backdrop-blur-sm border border-slate-600/50 shadow-xl hover:shadow-2xl transition-all duration-500">
            <CardHeader>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-red-500 rounded-2xl flex items-center justify-center shadow-lg">
                  <GraduationCap className="w-8 h-8 text-white" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-4">
                    <div>
                      <CardTitle className="text-xl text-white">{currentChild?.name || "Select Child"}</CardTitle>
                      <CardDescription className="text-slate-300">{currentChild?.class || "No class assigned"}</CardDescription>
                    </div>
                    {children.length > 1 && (
                      <select 
                        value={selectedChildId || ''} 
                        onChange={(e) => setSelectedChildId(e.target.value)}
                        className="bg-slate-700 text-white rounded px-3 py-1 text-sm border border-slate-600"
                      >
                        {children.map(child => (
                          <option key={child.id} value={child.id}>{child.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-slate-100/80 rounded-xl">
                  <div className="text-2xl font-bold text-orange-500">{currentChild?.overall_grade || "N/A"}</div>
                  <div className="text-sm text-slate-600">Overall Grade</div>
                </div>
                <div 
                  className="text-center p-4 bg-slate-100/80 rounded-xl cursor-pointer hover:bg-slate-200/80 transition-all hover:scale-105"
                  onClick={() => setAttendanceModalOpen(true)}
                >
                  <div className="text-2xl font-bold text-green-500">{currentChild?.attendance || "N/A"}</div>
                  <div className="text-sm text-slate-600">Attendance</div>
                </div>
                <div className="text-center p-4 bg-slate-100/80 rounded-xl">
                  <div className="text-2xl font-bold text-blue-500">{grades.length}</div>
                  <div className="text-sm text-slate-600">Recent Grades</div>
                </div>
                <div className="text-center p-4 bg-slate-100/80 rounded-xl">
                  <div className="text-2xl font-bold text-red-500">{exams.length}</div>
                  <div className="text-sm text-slate-600">Upcoming Exams</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Recent Grades */}
          <Card className="bg-slate-800/60 backdrop-blur-sm border border-slate-600/50 shadow-xl hover:shadow-2xl transition-all duration-500 hover:-translate-y-1">
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-orange-500" />
                <CardTitle className="text-white">Recent Grades</CardTitle>
              </div>
              <CardDescription className="text-slate-300">Latest academic performance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {grades.length > 0 ? grades.slice(0, 4).map((grade) => (
                  <div key={grade.id} className="flex items-center justify-between p-3 bg-slate-700/50 rounded-xl">
                    <div>
                      <div className="font-medium text-white">{grade.subject}</div>
                      <div className="text-sm text-slate-300">{grade.assignment}</div>
                      <div className="text-xs text-slate-400">{grade.date}</div>
                    </div>
                    <div className="text-lg font-bold text-orange-400">{grade.grade}</div>
                  </div>
                )) : (
                  <div className="p-3 bg-slate-700/50 rounded-xl text-center text-slate-300">
                    No grades available yet
                  </div>
                )}
              </div>
              <Button className="w-full mt-4 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white border-0">
                View All Grades
              </Button>
            </CardContent>
          </Card>

          {/* Upcoming Exams */}
          <Card className="bg-slate-800/60 backdrop-blur-sm border border-slate-600/50 shadow-xl hover:shadow-2xl transition-all duration-500 hover:-translate-y-1">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-orange-400" />
                <CardTitle className="text-white">Upcoming Exams</CardTitle>
              </div>
              <CardDescription className="text-slate-300">Important test dates</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {exams.length > 0 ? exams.map((exam) => (
                  <div key={exam.id} className="p-3 bg-slate-700/50 rounded-xl">
                    <div className="font-medium text-white">{exam.subject}</div>
                    <div className="text-sm text-slate-300">{exam.topic}</div>
                    <div className="text-sm text-slate-400">
                      {exam.date} at {exam.time}
                    </div>
                  </div>
                )) : (
                  <div className="p-3 bg-slate-700/50 rounded-xl text-center text-slate-300">
                    No upcoming exams
                  </div>
                )}
              </div>
              <Button className="w-full mt-4 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white border-0">
                View Full Calendar
              </Button>
            </CardContent>
          </Card>

          {/* School Announcements */}
          <Card className="bg-slate-800/60 backdrop-blur-sm border border-slate-600/50 shadow-xl hover:shadow-2xl transition-all duration-500 hover:-translate-y-1">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-red-400" />
                <CardTitle className="text-white">School Announcements</CardTitle>
              </div>
              <CardDescription className="text-slate-300">Latest updates from school</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {announcements.length > 0 ? announcements.map((announcement) => (
                  <div key={announcement.id} className={`p-3 rounded-xl border ${announcement.urgent ? 'border-orange-400/50 bg-orange-400/10' : 'bg-slate-700/50'}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-white">{announcement.title}</div>
                        <div className="text-sm text-slate-300 mt-1">{announcement.message}</div>
                      </div>
                      <div className="text-xs text-slate-400">{announcement.date}</div>
                    </div>
                  </div>
                )) : (
                  <div className="p-3 bg-slate-700/50 rounded-xl text-center text-slate-300">
                    No announcements
                  </div>
                )}
              </div>
              <Button className="w-full mt-4 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white border-0">
                View All Announcements
              </Button>
            </CardContent>
          </Card>

          {/* Teacher Communication */}
          <Card className="bg-slate-800/60 backdrop-blur-sm border border-slate-600/50 shadow-xl hover:shadow-2xl transition-all duration-500 hover:-translate-y-1">
            <CardHeader>
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-green-400" />
                <CardTitle className="text-white">Teacher Messages</CardTitle>
              </div>
              <CardDescription className="text-slate-300">Recent communications</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {conversations.length > 0 ? (
                  conversations.slice(0, 2).map((conv) => (
                    <div key={conv.user_id} className="p-3 bg-slate-700/50 rounded-xl">
                      <div className="font-medium text-white">{conv.user_name}</div>
                      <div className="text-sm text-slate-300 capitalize">{conv.user_role}</div>
                      <div className="text-sm text-slate-300 mt-1 line-clamp-2">{conv.last_message}</div>
                      <div className="text-xs text-slate-400 mt-1">{new Date(conv.last_message_at).toLocaleDateString()}</div>
                    </div>
                  ))
                ) : (
                  <div className="p-3 bg-slate-700/50 rounded-xl text-center text-slate-300">
                    No messages yet
                  </div>
                )}
              </div>
              <Button 
                onClick={() => setMessagesModalOpen(true)}
                className="w-full mt-4 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white border-0"
              >
                <MessageCircle className="w-4 h-4 mr-2" />
                Send Message to Teacher
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>

      <AttendanceBreakdownModal
        open={attendanceModalOpen}
        onOpenChange={setAttendanceModalOpen}
        classAttendance={classAttendance}
        overallPercentage={currentChild?.attendance || "N/A"}
        studentName={currentChild?.name || "Student"}
      />

      <ParentProfileModal
        open={profileModalOpen}
        onOpenChange={setProfileModalOpen}
        parentInfo={parentInfo}
        children={children}
      />

      <MessagesModal
        open={messagesModalOpen}
        onOpenChange={setMessagesModalOpen}
      />
    </div>
  );
};

export default ParentDashboard;