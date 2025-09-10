import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, User, Users, Calendar, Upload, MessageCircle, CheckSquare, BookOpen, TrendingUp } from "lucide-react";

const TeacherDashboard = () => {
  const navigate = useNavigate();

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
                <h1 className="text-xl font-bold text-foreground">Teacher Dashboard</h1>
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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="shadow-card">
            <CardContent className="p-6 text-center">
              <div className="text-2xl font-bold text-primary">{teacherData.classes.length}</div>
              <div className="text-sm text-muted-foreground">Active Classes</div>
            </CardContent>
          </Card>
          <Card className="shadow-card">
            <CardContent className="p-6 text-center">
              <div className="text-2xl font-bold text-secondary">{teacherData.totalStudents}</div>
              <div className="text-sm text-muted-foreground">Total Students</div>
            </CardContent>
          </Card>
          <Card className="shadow-card">
            <CardContent className="p-6 text-center">
              <div className="text-2xl font-bold text-accent">4</div>
              <div className="text-sm text-muted-foreground">Pending Tasks</div>
            </CardContent>
          </Card>
          <Card className="shadow-card">
            <CardContent className="p-6 text-center">
              <div className="text-2xl font-bold text-success">96%</div>
              <div className="text-sm text-muted-foreground">Avg Attendance</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Today's Classes */}
          <Card className="shadow-card">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" />
                <CardTitle>Today's Classes</CardTitle>
              </div>
              <CardDescription>Your schedule for today</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {todayClasses.map((classInfo, index) => (
                  <div key={index} className="p-4 bg-muted rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{classInfo.class} - {classInfo.subject}</div>
                        <div className="text-sm text-muted-foreground">
                          {classInfo.time} • {classInfo.room} • {classInfo.students} students
                        </div>
                      </div>
                      <Button variant="outline" size="sm">
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
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common tasks and tools</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <Button variant="default" className="h-16 flex-col">
                  <CheckSquare className="w-5 h-5 mb-1" />
                  Take Attendance
                </Button>
                <Button variant="secondary" className="h-16 flex-col">
                  <TrendingUp className="w-5 h-5 mb-1" />
                  Enter Grades
                </Button>
                <Button variant="accent" className="h-16 flex-col">
                  <Upload className="w-5 h-5 mb-1" />
                  Upload Resources
                </Button>
                <Button variant="outline" className="h-16 flex-col">
                  <Users className="w-5 h-5 mb-1" />
                  Manage Classes
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Pending Tasks */}
          <Card className="shadow-card">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-accent" />
                <CardTitle>Pending Tasks</CardTitle>
              </div>
              <CardDescription>Items requiring your attention</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {pendingTasks.map((task, index) => (
                  <div key={index} className={`p-3 rounded-lg border ${task.urgent ? 'border-warning bg-warning/10' : 'bg-muted'}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{task.task}</div>
                        <div className="text-sm text-muted-foreground">Due: {task.due}</div>
                      </div>
                      {task.urgent && (
                        <div className="text-xs bg-warning text-warning-foreground px-2 py-1 rounded">
                          Urgent
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="outline" className="w-full mt-4">
                View All Tasks
              </Button>
            </CardContent>
          </Card>

          {/* Recent Messages */}
          <Card className="shadow-card">
            <CardHeader>
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-primary" />
                <CardTitle>Recent Messages</CardTitle>
              </div>
              <CardDescription>Communications from parents and admin</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentMessages.map((message, index) => (
                  <div key={index} className={`p-3 rounded-lg ${message.unread ? 'bg-primary/10 border border-primary/20' : 'bg-muted'}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-medium">{message.from}</div>
                        <div className="text-sm font-medium text-muted-foreground">{message.subject}</div>
                        <div className="text-sm text-muted-foreground mt-1">{message.preview}</div>
                      </div>
                      <div className="text-xs text-muted-foreground">{message.time}</div>
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="default" className="w-full mt-4">
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