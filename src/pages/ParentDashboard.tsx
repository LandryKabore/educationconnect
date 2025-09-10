import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, User, GraduationCap, Calendar, MessageCircle, Bell, BookOpen, TrendingUp } from "lucide-react";

const ParentDashboard = () => {
  const navigate = useNavigate();

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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border shadow-card">
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
                <h1 className="text-xl font-bold text-foreground">Parent Dashboard</h1>
                <p className="text-sm text-muted-foreground">Welcome back!</p>
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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Child Overview */}
        <div className="mb-8">
          <Card className="shadow-card">
            <CardHeader>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gradient-primary rounded-xl flex items-center justify-center">
                  <GraduationCap className="w-6 h-6 text-white" />
                </div>
                <div>
                  <CardTitle className="text-xl">{childData.name}</CardTitle>
                  <CardDescription>{childData.class}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold text-primary">{childData.overallGrade}</div>
                  <div className="text-sm text-muted-foreground">Overall Grade</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold text-success">{childData.attendance}</div>
                  <div className="text-sm text-muted-foreground">Attendance</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold text-accent">8</div>
                  <div className="text-sm text-muted-foreground">Subjects</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold text-secondary">3</div>
                  <div className="text-sm text-muted-foreground">Upcoming Exams</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Recent Grades */}
          <Card className="shadow-card">
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                <CardTitle>Recent Grades</CardTitle>
              </div>
              <CardDescription>Latest academic performance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentGrades.map((grade, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div>
                      <div className="font-medium">{grade.subject}</div>
                      <div className="text-sm text-muted-foreground">{grade.date}</div>
                    </div>
                    <div className="text-lg font-bold text-primary">{grade.grade}</div>
                  </div>
                ))}
              </div>
              <Button variant="outline" className="w-full mt-4">
                View All Grades
              </Button>
            </CardContent>
          </Card>

          {/* Upcoming Exams */}
          <Card className="shadow-card">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-secondary" />
                <CardTitle>Upcoming Exams</CardTitle>
              </div>
              <CardDescription>Important test dates</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {upcomingExams.map((exam, index) => (
                  <div key={index} className="p-3 bg-muted rounded-lg">
                    <div className="font-medium">{exam.subject}</div>
                    <div className="text-sm text-muted-foreground">
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
          <Card className="shadow-card">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-accent" />
                <CardTitle>School Announcements</CardTitle>
              </div>
              <CardDescription>Latest updates from school</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {announcements.map((announcement, index) => (
                  <div key={index} className={`p-3 rounded-lg border ${announcement.urgent ? 'border-warning bg-warning/10' : 'bg-muted'}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-medium">{announcement.title}</div>
                        <div className="text-sm text-muted-foreground mt-1">{announcement.message}</div>
                      </div>
                      <div className="text-xs text-muted-foreground">{announcement.date}</div>
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
          <Card className="shadow-card">
            <CardHeader>
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-primary" />
                <CardTitle>Teacher Messages</CardTitle>
              </div>
              <CardDescription>Recent communications</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="p-3 bg-muted rounded-lg">
                  <div className="font-medium">Ms. Sarah Thompson</div>
                  <div className="text-sm text-muted-foreground">Mathematics Teacher</div>
                  <div className="text-sm mt-1">Emma is showing excellent progress in algebra. Keep up the great work!</div>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <div className="font-medium">Mr. James Wilson</div>
                  <div className="text-sm text-muted-foreground">English Teacher</div>
                  <div className="text-sm mt-1">Please review the reading assignment for next week's discussion.</div>
                </div>
              </div>
              <Button variant="default" className="w-full mt-4">
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