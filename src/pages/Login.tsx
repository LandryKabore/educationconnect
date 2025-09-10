import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GraduationCap, Users, BookOpen, User } from "lucide-react";

const Login = () => {
  const navigate = useNavigate();
  const [selectedRole, setSelectedRole] = useState<string | null>(null);

  const roles = [
    {
      id: "parent",
      title: "Parent",
      description: "View your child's progress, grades, and communicate with teachers",
      icon: Users,
      color: "from-blue-500 to-blue-600",
      route: "/parent-dashboard",
    },
    {
      id: "teacher", 
      title: "Teacher",
      description: "Manage classes, take attendance, grade students, and upload resources",
      icon: GraduationCap,
      color: "from-green-500 to-green-600", 
      route: "/teacher-dashboard",
    },
    {
      id: "student",
      title: "Student", 
      description: "Access your grades, study materials, and join study groups",
      icon: BookOpen,
      color: "from-amber-500 to-amber-600",
      route: "/student-dashboard",
    },
  ];

  const handleRoleSelect = (role: typeof roles[0]) => {
    setSelectedRole(role.id);
    // Simulate login process - in real app, this would involve authentication
    setTimeout(() => {
      navigate(role.route);
    }, 500);
  };

  return (
    <div className="min-h-screen bg-gradient-primary flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8 space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 rounded-2xl backdrop-blur-sm border border-white/20 mb-4">
            <GraduationCap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white">
            EduConnect
          </h1>
          <p className="text-lg text-white/80 max-w-md mx-auto">
            Your comprehensive school management platform. Choose your role to continue.
          </p>
        </div>

        {/* Role Selection Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {roles.map((role) => {
            const IconComponent = role.icon;
            const isSelected = selectedRole === role.id;
            
            return (
              <Card 
                key={role.id}
                className={`relative overflow-hidden border-white/20 bg-white/95 backdrop-blur-sm hover:bg-white transition-all duration-300 cursor-pointer group ${
                  isSelected ? 'scale-105 shadow-elevated' : 'hover:scale-102 shadow-card hover:shadow-elevated'
                }`}
                onClick={() => handleRoleSelect(role)}
              >
                <CardHeader className="text-center pb-4">
                  <div className={`w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br ${role.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                    <IconComponent className="w-8 h-8 text-white" />
                  </div>
                  <CardTitle className="text-xl font-bold text-foreground group-hover:text-primary transition-colors">
                    {role.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-center pb-8">
                  <CardDescription className="text-muted-foreground leading-relaxed mb-6">
                    {role.description}
                  </CardDescription>
                  <Button 
                    variant="role"
                    size="role"
                    className="w-full"
                    disabled={isSelected}
                  >
                    {isSelected ? (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        Logging in...
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <User className="w-5 h-5 group-hover:text-primary-foreground transition-colors" />
                        Continue as {role.title}
                      </div>
                    )}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Footer */}
        <div className="text-center mt-12 text-white/60 text-sm">
          <p>© 2024 EduConnect. Empowering education through technology.</p>
        </div>
      </div>
    </div>
  );
};

export default Login;