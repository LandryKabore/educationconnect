import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, User, BookOpen, Calendar, Users, TrendingUp, Award, Clock, Calculator, Brain, Microscope, Code2, Lightbulb, Database, Loader2 } from "lucide-react";
import { useStudentData } from "@/hooks/useStudentData";

const StudentDashboard = () => {
  const navigate = useNavigate();
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
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

  const studyGroups = [
    { name: "Math Study Group", subject: "Mathematics", members: 8, lastActivity: "2 hours ago", active: true },
    { name: "Science Champions", subject: "Physics", members: 12, lastActivity: "1 day ago", active: false },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="flex items-center gap-2 text-white">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Loading your dashboard...</span>
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
                <h1 className="text-xl font-bold text-white">Student Dashboard</h1>
                <p className="text-sm text-slate-300">
                  {studentInfo?.profile ? `${studentInfo.profile.first_name} ${studentInfo.profile.last_name}` : "Student"} - 
                  {studentInfo?.student?.classes?.name || "Unknown Class"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
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
          <Card className="bg-slate-800/60 backdrop-blur-sm border border-slate-600/50 shadow-xl hover:shadow-2xl transition-all duration-500">
            <CardContent className="p-6 text-center">
              <Award className="w-8 h-8 text-orange-400 mx-auto mb-2" />
              <div className="text-2xl font-bold text-orange-400">{gpa}</div>
              <div className="text-sm text-slate-300">Overall GPA</div>
            </CardContent>
          </Card>
          <Card className="bg-slate-800/60 backdrop-blur-sm border border-slate-600/50 shadow-xl hover:shadow-2xl transition-all duration-500">
            <CardContent className="p-6 text-center">
              <Clock className="w-8 h-8 text-green-400 mx-auto mb-2" />
              <div className="text-2xl font-bold text-green-400">{attendanceRate}</div>
              <div className="text-sm text-slate-300">Attendance</div>
            </CardContent>
          </Card>
          <Card className="bg-slate-800/60 backdrop-blur-sm border border-slate-600/50 shadow-xl hover:shadow-2xl transition-all duration-500">
            <CardContent className="p-6 text-center">
              <BookOpen className="w-8 h-8 text-blue-400 mx-auto mb-2" />
              <div className="text-2xl font-bold text-blue-400">8</div>
              <div className="text-sm text-slate-300">Active Subjects</div>
            </CardContent>
          </Card>
          <Card className="bg-slate-800/60 backdrop-blur-sm border border-slate-600/50 shadow-xl hover:shadow-2xl transition-all duration-500">
            <CardContent className="p-6 text-center">
              <Users className="w-8 h-8 text-red-400 mx-auto mb-2" />
              <div className="text-2xl font-bold text-red-400">{assignments.length}</div>
              <div className="text-sm text-slate-300">Upcoming Assignments</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
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
              <Button className="w-full mt-4 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white border-0">
                View All Grades
              </Button>
            </CardContent>
          </Card>

          {/* Upcoming Exams */}
          <Card className="bg-slate-800/60 backdrop-blur-sm border border-slate-600/50 shadow-xl hover:shadow-2xl transition-all duration-500 hover:-translate-y-1">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-red-400" />
                <CardTitle className="text-white">Upcoming Exams</CardTitle>
              </div>
              <CardDescription className="text-slate-300">Important test dates to remember</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {assignments.length > 0 ? assignments.slice(0, 3).map((assignment) => (
                  <div key={assignment.id} className="p-3 bg-slate-700/50 rounded-lg">
                    <div className="font-medium text-white">{assignment.subject}</div>
                    <div className="text-sm text-slate-300">{assignment.title}</div>
                    <div className="text-sm text-slate-400">
                      Due: {assignment.due_date}
                    </div>
                  </div>
                )) : (
                  <div className="p-3 bg-slate-700/50 rounded-lg text-center text-slate-300">
                    No upcoming assignments
                  </div>
                )}
              </div>
              <Button className="w-full mt-4 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white border-0">
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
              <div className="space-y-3">
                {studyGroups.map((group, index) => (
                  <div key={index} className="p-3 bg-slate-700/50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="font-medium text-white">{group.name}</div>
                          {group.active && (
                            <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                          )}
                        </div>
                        <div className="text-sm text-slate-300">
                          {group.subject} • {group.members} members
                        </div>
                        <div className="text-xs text-slate-400">Last activity: {group.lastActivity}</div>
                      </div>
                      <Button className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white border-0" size="sm">
                        Join Chat
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <Button className="w-full mt-4 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white border-0">
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