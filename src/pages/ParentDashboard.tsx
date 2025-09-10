import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, User, GraduationCap, Calendar, MessageCircle, Bell, BookOpen, TrendingUp, Calculator, Brain, Microscope, Code2, Lightbulb, Database } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageToggle } from "@/components/LanguageToggle";

const ParentDashboard = () => {
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
                <h1 className="text-xl font-bold text-foreground">{t('dashboard.parent.title', 'Parent Dashboard')}</h1>
                <p className="text-sm text-muted-foreground">{t('welcomeBack')}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="icon">
                <Bell className="w-4 h-4" />
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
        {/* Child Overview */}
        <div className="mb-8">
          <Card className="bg-card border-border shadow-xl hover:shadow-2xl transition-all duration-500">
            <CardHeader>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-gradient-to-br from-primary to-secondary rounded-2xl flex items-center justify-center shadow-lg">
                  <GraduationCap className="w-8 h-8 text-white" />
                </div>
                <div>
                  <CardTitle className="text-xl text-foreground">{childData.name}</CardTitle>
                  <CardDescription className="text-muted-foreground">{childData.class}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-muted rounded-xl">
                  <div className="text-2xl font-bold text-primary">{childData.overallGrade}</div>
                  <div className="text-sm text-muted-foreground">{t('dashboard.parent.overallGrade', 'Overall Grade')}</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-xl">
                  <div className="text-2xl font-bold text-success">{childData.attendance}</div>
                  <div className="text-sm text-muted-foreground">{t('dashboard.parent.attendance', 'Attendance')}</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-xl">
                  <div className="text-2xl font-bold text-accent">8</div>
                  <div className="text-sm text-muted-foreground">{t('dashboard.parent.subjects', 'Subjects')}</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-xl">
                  <div className="text-2xl font-bold text-destructive">3</div>
                  <div className="text-sm text-muted-foreground">{t('dashboard.parent.upcomingExams', 'Upcoming Exams')}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Recent Grades */}
          <Card className="bg-card border-border shadow-xl hover:shadow-2xl transition-all duration-500 hover:-translate-y-1">
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                <CardTitle className="text-foreground">{t('dashboard.parent.recentGrades')}</CardTitle>
              </div>
              <CardDescription className="text-muted-foreground">{t('dashboard.parent.latestPerformance')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentGrades.map((grade, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-muted rounded-xl">
                    <div>
                      <div className="font-medium text-foreground">{grade.subject}</div>
                      <div className="text-sm text-muted-foreground">{grade.date}</div>
                    </div>
                    <div className="text-lg font-bold text-primary">{grade.grade}</div>
                  </div>
                ))}
              </div>
              <Button className="w-full mt-4 bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-white border-0">
                {t('dashboard.parent.viewAllGrades')}
              </Button>
            </CardContent>
          </Card>

          {/* Upcoming Exams */}
          <Card className="bg-card border-border shadow-xl hover:shadow-2xl transition-all duration-500 hover:-translate-y-1">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-accent" />
                <CardTitle className="text-foreground">{t('dashboard.parent.upcomingExamsTitle')}</CardTitle>
              </div>
              <CardDescription className="text-muted-foreground">{t('dashboard.parent.importantDates')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {upcomingExams.map((exam, index) => (
                  <div key={index} className="p-3 bg-muted rounded-xl">
                    <div className="font-medium text-foreground">{exam.subject}</div>
                    <div className="text-sm text-muted-foreground">
                      {exam.date} at {exam.time}
                    </div>
                  </div>
                ))}
              </div>
              <Button className="w-full mt-4 bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-white border-0">
                {t('dashboard.parent.viewFullCalendar')}
              </Button>
            </CardContent>
          </Card>

          {/* School Announcements */}
          <Card className="bg-card border-border shadow-xl hover:shadow-2xl transition-all duration-500 hover:-translate-y-1">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-destructive" />
                <CardTitle className="text-foreground">{t('dashboard.parent.schoolAnnouncements')}</CardTitle>
              </div>
              <CardDescription className="text-muted-foreground">{t('dashboard.parent.latestUpdates')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {announcements.map((announcement, index) => (
                  <div key={index} className={`p-3 rounded-xl border ${announcement.urgent ? 'border-destructive/50 bg-destructive/10' : 'bg-muted'}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-foreground">{announcement.title}</div>
                        <div className="text-sm text-muted-foreground mt-1">{announcement.message}</div>
                      </div>
                      <div className="text-xs text-muted-foreground">{announcement.date}</div>
                    </div>
                  </div>
                ))}
              </div>
              <Button className="w-full mt-4 bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-white border-0">
                {t('dashboard.parent.viewAllAnnouncements')}
              </Button>
            </CardContent>
          </Card>

          {/* Teacher Communication */}
          <Card className="bg-card border-border shadow-xl hover:shadow-2xl transition-all duration-500 hover:-translate-y-1">
            <CardHeader>
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-success" />
                <CardTitle className="text-foreground">{t('dashboard.parent.teacherMessages')}</CardTitle>
              </div>
              <CardDescription className="text-muted-foreground">{t('dashboard.parent.recentCommunications')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="p-3 bg-muted rounded-xl">
                  <div className="font-medium text-foreground">Ms. Sarah Thompson</div>
                  <div className="text-sm text-muted-foreground">Mathematics Teacher</div>
                  <div className="text-sm text-muted-foreground mt-1">Emma is showing excellent progress in algebra. Keep up the great work!</div>
                </div>
                <div className="p-3 bg-muted rounded-xl">
                  <div className="font-medium text-foreground">Mr. James Wilson</div>
                  <div className="text-sm text-muted-foreground">English Teacher</div>
                  <div className="text-sm text-muted-foreground mt-1">Please review the reading assignment for next week's discussion.</div>
                </div>
              </div>
              <Button className="w-full mt-4 bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-white border-0">
                <MessageCircle className="w-4 h-4 mr-2" />
                {t('dashboard.parent.sendMessageToTeacher')}
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default ParentDashboard;