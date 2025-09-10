import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, User, BookOpen, Calendar, Users, TrendingUp, Award, Clock } from "lucide-react";

const StudentDashboard = () => {
  const navigate = useNavigate();

  const studentData = {
    name: "Alex Thompson",
    grade: "Grade 9A",
    overallGPA: "3.8",
    attendance: "94%",
  };

  const recentGrades = [
    { subject: "Mathematics", grade: "A-", date: "Dec 8", assignment: "Algebra Quiz" },
    { subject: "English", grade: "B+", date: "Dec 6", assignment: "Essay: Climate Change" },
    { subject: "Science", grade: "A", date: "Dec 5", assignment: "Physics Lab Report" },
    { subject: "History", grade: "A-", date: "Dec 3", assignment: "World War II Project" },
  ];

  const upcomingExams = [
    { subject: "Mathematics", date: "Dec 15", time: "9:00 AM", topic: "Quadratic Equations" },
    { subject: "French", date: "Dec 17", time: "10:30 AM", topic: "Conversation Test" },
    { subject: "Chemistry", date: "Dec 19", time: "2:00 PM", topic: "Organic Compounds" },
  ];

  const studyMaterials = [
    { subject: "Mathematics", title: "Algebra Practice Problems", type: "PDF", uploadedBy: "Ms. Thompson", date: "Dec 7" },
    { subject: "Science", title: "Physics Formula Sheet", type: "PDF", uploadedBy: "Mr. Wilson", date: "Dec 6" },
    { subject: "English", title: "Essay Writing Guidelines", type: "Document", uploadedBy: "Ms. Davis", date: "Dec 5" },
    { subject: "History", title: "WWII Timeline", type: "PDF", uploadedBy: "Mr. Brown", date: "Dec 4" },
  ];

  const studyGroups = [
    { name: "Math Study Group", subject: "Mathematics", members: 8, lastActivity: "2 hours ago", active: true },
    { name: "Science Champions", subject: "Physics", members: 12, lastActivity: "1 day ago", active: false },
    { name: "History Buffs", subject: "History", members: 6, lastActivity: "3 days ago", active: false },
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
                <h1 className="text-xl font-bold text-foreground">Student Dashboard</h1>
                <p className="text-sm text-muted-foreground">{studentData.name} - {studentData.grade}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="icon">
                <User className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Academic Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="shadow-card">
            <CardContent className="p-6 text-center">
              <Award className="w-8 h-8 text-primary mx-auto mb-2" />
              <div className="text-2xl font-bold text-primary">{studentData.overallGPA}</div>
              <div className="text-sm text-muted-foreground">Overall GPA</div>
            </CardContent>
          </Card>
          <Card className="shadow-card">
            <CardContent className="p-6 text-center">
              <Clock className="w-8 h-8 text-success mx-auto mb-2" />
              <div className="text-2xl font-bold text-success">{studentData.attendance}</div>
              <div className="text-sm text-muted-foreground">Attendance</div>
            </CardContent>
          </Card>
          <Card className="shadow-card">
            <CardContent className="p-6 text-center">
              <BookOpen className="w-8 h-8 text-secondary mx-auto mb-2" />
              <div className="text-2xl font-bold text-secondary">8</div>
              <div className="text-sm text-muted-foreground">Active Subjects</div>
            </CardContent>
          </Card>
          <Card className="shadow-card">
            <CardContent className="p-6 text-center">
              <Users className="w-8 h-8 text-accent mx-auto mb-2" />
              <div className="text-2xl font-bold text-accent">3</div>
              <div className="text-sm text-muted-foreground">Study Groups</div>
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
              <CardDescription>Your latest academic performance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentGrades.map((grade, index) => (
                  <div key={index} className="p-3 bg-muted rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{grade.subject}</div>
                        <div className="text-sm text-muted-foreground">{grade.assignment}</div>
                        <div className="text-xs text-muted-foreground">{grade.date}</div>
                      </div>
                      <div className="text-lg font-bold text-primary">{grade.grade}</div>
                    </div>
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
                <Calendar className="w-5 h-5 text-warning" />
                <CardTitle>Upcoming Exams</CardTitle>
              </div>
              <CardDescription>Important test dates to remember</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {upcomingExams.map((exam, index) => (
                  <div key={index} className="p-3 bg-muted rounded-lg">
                    <div className="font-medium">{exam.subject}</div>
                    <div className="text-sm text-muted-foreground">{exam.topic}</div>
                    <div className="text-sm text-muted-foreground">
                      {exam.date} at {exam.time}
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="outline" className="w-full mt-4">
                View Study Calendar
              </Button>
            </CardContent>
          </Card>

          {/* Study Materials */}
          <Card className="shadow-card">
            <CardHeader>
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-secondary" />
                <CardTitle>Study Materials</CardTitle>
              </div>
              <CardDescription>Resources uploaded by your teachers</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {studyMaterials.map((material, index) => (
                  <div key={index} className="p-3 bg-muted rounded-lg hover:bg-muted/80 cursor-pointer transition-colors">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{material.title}</div>
                        <div className="text-sm text-muted-foreground">
                          {material.subject} • {material.type} • by {material.uploadedBy}
                        </div>
                        <div className="text-xs text-muted-foreground">{material.date}</div>
                      </div>
                      <Button variant="ghost" size="sm">
                        Download
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="outline" className="w-full mt-4">
                Browse All Materials
              </Button>
            </CardContent>
          </Card>

          {/* Study Groups */}
          <Card className="shadow-card">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-accent" />
                <CardTitle>Study Groups</CardTitle>
              </div>
              <CardDescription>Collaborate with your classmates</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {studyGroups.map((group, index) => (
                  <div key={index} className="p-3 bg-muted rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="font-medium">{group.name}</div>
                          {group.active && (
                            <div className="w-2 h-2 bg-success rounded-full"></div>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {group.subject} • {group.members} members
                        </div>
                        <div className="text-xs text-muted-foreground">Last activity: {group.lastActivity}</div>
                      </div>
                      <Button variant="outline" size="sm">
                        Join Chat
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="default" className="w-full mt-4">
                <Users className="w-4 h-4 mr-2" />
                Find More Groups
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default StudentDashboard;