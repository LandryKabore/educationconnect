import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GraduationCap, Users, BookOpen, User, Calculator, Brain, Microscope, Code2, Lightbulb, Database, Globe, Smartphone } from "lucide-react";

const Login = () => {
  const navigate = useNavigate();
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({
        x: (e.clientX / window.innerWidth - 0.5) * 2,
        y: (e.clientY / window.innerHeight - 0.5) * 2,
      });
    };

    const handleDeviceOrientation = (e: DeviceOrientationEvent) => {
      if (e.gamma !== null && e.beta !== null) {
        const gamma = Math.max(-45, Math.min(45, e.gamma));
        const beta = Math.max(-45, Math.min(45, e.beta));
        
        setMousePosition({
          x: gamma / 22.5,
          y: beta / 22.5,
        });
      }
    };

    const requestOrientationPermission = async () => {
      if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
        try {
          const permission = await (DeviceOrientationEvent as any).requestPermission();
          if (permission === 'granted') {
            window.addEventListener('deviceorientation', handleDeviceOrientation);
          }
        } catch (error) {
          console.log('Device orientation permission denied');
        }
      } else if (window.DeviceOrientationEvent) {
        window.addEventListener('deviceorientation', handleDeviceOrientation);
      }
    };

    const handleFirstInteraction = () => {
      requestOrientationPermission();
      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('touchstart', handleFirstInteraction);
    };

    document.addEventListener('click', handleFirstInteraction);
    document.addEventListener('touchstart', handleFirstInteraction);
    window.addEventListener('mousemove', handleMouseMove);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('deviceorientation', handleDeviceOrientation);
      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('touchstart', handleFirstInteraction);
    };
  }, []);

  const floatingIcons = [
    { icon: Calculator, x: 15, y: 20, size: 30, delay: 0 },
    { icon: Brain, x: 85, y: 25, size: 35, delay: 0.1 },
    { icon: Microscope, x: 25, y: 70, size: 32, delay: 0.2 },
    { icon: Code2, x: 75, y: 65, size: 28, delay: 0.3 },
    { icon: Lightbulb, x: 10, y: 45, size: 30, delay: 0.4 },
    { icon: Database, x: 90, y: 80, size: 33, delay: 0.5 },
    { icon: Globe, x: 60, y: 15, size: 26, delay: 0.6 },
    { icon: Smartphone, x: 45, y: 85, size: 29, delay: 0.7 },
  ];

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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Floating Interactive Elements */}
      {floatingIcons.map((item, index) => {
        const IconComponent = item.icon;
        const moveX = mousePosition.x * (10 + index * 2);
        const moveY = mousePosition.y * (8 + index * 1.5);
        
        return (
          <div
            key={index}
            className="absolute opacity-15 pointer-events-none"
            style={{
              left: `${item.x}%`,
              top: `${item.y}%`,
              transform: `translate(${moveX}px, ${moveY}px) rotate(${moveX * 0.05}deg)`,
            }}
          >
            <div className="p-2 rounded-xl bg-gradient-to-br from-orange-500/15 to-red-500/15 backdrop-blur-sm border border-orange-500/15">
              <IconComponent 
                size={item.size} 
                className="text-orange-400/40"
              />
            </div>
          </div>
        );
      })}
      
      {/* Background Grid Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
      
      <div className="w-full max-w-4xl relative z-10">
        {/* Header */}
        <div className="text-center mb-8 space-y-4">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-orange-500/20 to-red-500/20 rounded-3xl backdrop-blur-sm border border-orange-500/30 mb-6">
            <GraduationCap className="w-10 h-10 text-orange-400" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4">
            Welcome to{" "}
            <span className="bg-gradient-to-r from-orange-400 to-red-400 bg-clip-text text-transparent">
              EduConnect
            </span>
          </h1>
          <p className="text-xl text-slate-300 max-w-2xl mx-auto leading-relaxed">
            Your comprehensive school management platform designed for African schools. 
            Choose your role to continue your educational journey.
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
                className={`relative overflow-hidden border border-white/20 bg-white/60 backdrop-blur-sm hover:bg-white/80 transition-all duration-500 cursor-pointer group shadow-xl hover:shadow-2xl ${
                  isSelected ? 'scale-105 bg-white/90' : 'hover:scale-102 hover:-translate-y-2'
                }`}
                onClick={() => handleRoleSelect(role)}
              >
                <CardHeader className="text-center pb-4">
                  <div className="relative mb-6">
                    <div className={`w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br ${role.color} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                      <IconComponent className="w-8 h-8 text-white" />
                    </div>
                    <div className={`absolute inset-0 bg-gradient-to-br ${role.color} rounded-2xl opacity-20 group-hover:opacity-30 transition-opacity duration-300 blur-xl mx-auto w-16 h-16`} />
                  </div>
                  <CardTitle className="text-xl font-bold text-slate-900 group-hover:text-blue-600 transition-colors duration-300">
                    {role.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-center pb-8">
                  <CardDescription className="text-slate-600 leading-relaxed mb-6 text-base">
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
        <div className="text-center mt-16 text-slate-400 text-lg">
          <p>© 2024 EduConnect. Empowering education across Africa.</p>
        </div>
      </div>
    </div>
  );
};

export default Login;