import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GraduationCap, Users, BookOpen, Shield, Wifi, Globe, Smartphone, Calculator, Brain, Microscope, Code2, Lightbulb, Database } from "lucide-react";
import { useState, useEffect } from "react";

const Index = () => {
  const navigate = useNavigate();
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [velocity, setVelocity] = useState({ x: 0, y: 0 });
  const [targetPosition, setTargetPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const newTarget = {
        x: (e.clientX / window.innerWidth - 0.5) * 2,
        y: (e.clientY / window.innerHeight - 0.5) * 2,
      };
      setTargetPosition(newTarget);
    };

    const handleDeviceOrientation = (e: DeviceOrientationEvent) => {
      if (e.gamma !== null && e.beta !== null) {
        const gamma = Math.max(-45, Math.min(45, e.gamma));
        const beta = Math.max(-45, Math.min(45, e.beta));
        
        const newTarget = {
          x: gamma / 22.5,
          y: beta / 22.5,
        };
        setTargetPosition(newTarget);
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

  // Smooth momentum animation
  useEffect(() => {
    let animationFrame: number;
    
    const animate = () => {
      setMousePosition(current => {
        const dampening = 0.2; // Increased for more sensitivity
        const maxVelocity = 0.5; // Limit velocity to prevent runaway
        
        // Calculate target difference
        const diff = {
          x: targetPosition.x - current.x,
          y: targetPosition.y - current.y,
        };
        
        // Apply smooth interpolation directly to position
        const newPosition = {
          x: current.x + diff.x * dampening,
          y: current.y + diff.y * dampening,
        };
        
        // Clamp position to reasonable bounds
        return {
          x: Math.max(-2, Math.min(2, newPosition.x)),
          y: Math.max(-2, Math.min(2, newPosition.y)),
        };
      });
      
      animationFrame = requestAnimationFrame(animate);
    };
    
    animationFrame = requestAnimationFrame(animate);
    
    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [targetPosition]);

  const floatingIcons = [
    { icon: Calculator, x: 15, y: 20, size: 40, delay: 0, depth: 1 },
    { icon: Brain, x: 85, y: 25, size: 60, delay: 0.1, depth: 0.3 },
    { icon: Microscope, x: 25, y: 70, size: 35, delay: 0.2, depth: 0.8 },
    { icon: Code2, x: 75, y: 65, size: 55, delay: 0.3, depth: 0.2 },
    { icon: Lightbulb, x: 10, y: 45, size: 30, delay: 0.4, depth: 0.9 },
    { icon: Database, x: 90, y: 80, size: 50, delay: 0.5, depth: 0.4 },
    { icon: Globe, x: 60, y: 15, size: 28, delay: 0.6, depth: 1.2 },
    { icon: BookOpen, x: 45, y: 85, size: 65, delay: 0.7, depth: 0.1 },
    { icon: Smartphone, x: 5, y: 60, size: 25, delay: 0.8, depth: 1.5 },
    { icon: Shield, x: 95, y: 35, size: 45, delay: 0.9, depth: 0.6 },
    { icon: Users, x: 35, y: 5, size: 40, delay: 1.0, depth: 0.7 },
    { icon: Wifi, x: 80, y: 90, size: 32, delay: 1.1, depth: 1.0 },
  ];

  const features = [
    {
      icon: Users,
      title: "Multi-Role Access",
      description: "Dedicated dashboards for parents, teachers, and students with role-specific features.",
    },
    {
      icon: Wifi,
      title: "Offline Support",
      description: "Teachers can take attendance offline and sync when internet is available.",
    },
    {
      icon: Globe,
      title: "Multi-Language",
      description: "Support for English, French, and local African languages.",
    },
    {
      icon: Smartphone,
      title: "Mobile-First",
      description: "Optimized for smartphones and tablets with responsive design.",
    },
    {
      icon: Shield,
      title: "Secure & Private",
      description: "Safe environment for educational data and communications.",
    },
    {
      icon: BookOpen,
      title: "Study Groups",
      description: "Students can collaborate in moderated study groups and forums.",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 min-h-screen flex items-center">
        {/* Floating Interactive Elements */}
        {floatingIcons.map((item, index) => {
          const IconComponent = item.icon;
          const baseMovement = 15 + index * 3;
          const moveX = mousePosition.x * (baseMovement * item.depth);
          const moveY = mousePosition.y * (10 + index * 2) * item.depth;
          
          // Create depth-based visual effects
          const opacity = Math.max(0.1, 0.4 - item.depth * 0.15);
          const blur = item.depth > 0.8 ? 'blur-sm' : item.depth > 0.5 ? 'blur-[1px]' : '';
          const scale = 1 + (1 - item.depth) * 0.3; // Closer items are larger
          
          return (
            <div
              key={index}
              className={`absolute pointer-events-none transition-transform duration-75 ease-out ${blur}`}
              style={{
                left: `${item.x}%`,
                top: `${item.y}%`,
                transform: `translate(${moveX}px, ${moveY}px) rotate(${moveX * 0.1}deg) scale(${scale})`,
                zIndex: Math.round(10 - item.depth * 10), // Closer items have higher z-index
                opacity,
              }}
            >
              <div className="p-3 rounded-xl bg-gradient-to-br from-orange-500/20 to-red-500/20 backdrop-blur-sm border border-orange-500/20 shadow-lg">
                <IconComponent 
                  size={item.size} 
                  className="text-orange-400/60"
                />
              </div>
            </div>
          );
        })}
        
        {/* Background Grid Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 z-10">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-orange-500/20 to-red-500/20 rounded-3xl backdrop-blur-sm border border-orange-500/30 mb-8">
              <GraduationCap className="w-10 h-10 text-orange-400" />
            </div>
            <h1 className="text-4xl sm:text-6xl font-bold text-white mb-6">
              Welcome to{" "}
              <span className="bg-gradient-to-r from-orange-400 to-red-400 bg-clip-text text-transparent">
                EduConnect
              </span>
            </h1>
            <p className="text-xl text-slate-300 max-w-3xl mx-auto mb-10 leading-relaxed">
              A comprehensive school management platform designed for African schools. 
              Manage classes, track progress, and foster communication between parents, 
              teachers, and students.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button 
                size="xl"
                onClick={() => navigate("/login")}
                className="min-w-48 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300"
              >
                <GraduationCap className="w-5 h-5 mr-2" />
                Get Started
              </Button>
              <Button 
                variant="outline" 
                size="xl"
                className="min-w-48 border-slate-600 text-slate-200 bg-slate-800/50 hover:bg-slate-700 hover:border-slate-400 hover:text-white transition-all duration-300 backdrop-blur-sm"
              >
                Learn More
              </Button>
            </div>
          </div>
        </div>
        
        {/* Additional floating elements */}
        <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-orange-400/40 rounded-full animate-pulse" />
        <div className="absolute top-3/4 right-1/4 w-1 h-1 bg-red-400/40 rounded-full animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/6 w-1.5 h-1.5 bg-orange-400/30 rounded-full animate-pulse" style={{ animationDelay: '2s' }} />
      </section>

      {/* Features Section */}
      <section className="py-24 bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 relative overflow-hidden">
        {/* Background Elements */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.05),transparent_50%)] dark:bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.1),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(245,101,101,0.05),transparent_50%)] dark:bg-[radial-gradient(circle_at_70%_80%,rgba(245,101,101,0.1),transparent_50%)]" />
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center mb-20">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500/20 to-red-500/20 rounded-2xl backdrop-blur-sm border border-blue-500/20 mb-6">
              <BookOpen className="w-8 h-8 text-blue-500" />
            </div>
            <h2 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-slate-900 via-slate-700 to-slate-900 dark:from-white dark:via-slate-200 dark:to-white bg-clip-text text-transparent mb-6">
              Built for Modern Education
            </h2>
            <p className="text-xl text-slate-600 dark:text-slate-300 max-w-3xl mx-auto leading-relaxed">
              Everything you need to manage school operations efficiently, 
              with features designed specifically for African educational institutions.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => {
              const IconComponent = feature.icon;
              return (
                <div
                  key={index}
                  className="group relative"
                  style={{
                    animationDelay: `${index * 0.1}s`,
                  }}
                >
                  <Card className="h-full bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border border-white/20 dark:border-slate-700/50 shadow-xl hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 group-hover:bg-white/80 dark:group-hover:bg-slate-800/80">
                    <CardHeader className="pb-4">
                      <div className="relative mb-6">
                        <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-red-500 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                          <IconComponent className="w-8 h-8 text-white" />
                        </div>
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-red-500 rounded-2xl opacity-20 group-hover:opacity-30 transition-opacity duration-300 blur-xl" />
                      </div>
                      <CardTitle className="text-xl font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors duration-300">
                        {feature.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <CardDescription className="text-slate-600 dark:text-slate-300 leading-relaxed text-base">
                        {feature.description}
                      </CardDescription>
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative overflow-hidden">
        {/* Floating Interactive Elements */}
        {floatingIcons.slice(0, 4).map((item, index) => {
          const IconComponent = item.icon;
          const moveX = mousePosition.x * (8 + index * 2);
          const moveY = mousePosition.y * (6 + index * 1.5);
          
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
                  size={item.size * 0.8} 
                  className="text-orange-400/40"
                />
              </div>
            </div>
          );
        })}
        
        {/* Background Grid Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
        
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-orange-500/20 to-red-500/20 rounded-3xl backdrop-blur-sm border border-orange-500/30 mb-8">
            <GraduationCap className="w-10 h-10 text-orange-400" />
          </div>
          
          <h2 className="text-4xl sm:text-6xl font-bold text-white mb-8 leading-tight">
            Ready to{" "}
            <span className="bg-gradient-to-r from-orange-400 to-red-400 bg-clip-text text-transparent">
              Transform
            </span>{" "}
            Your School?
          </h2>
          
          <p className="text-xl text-slate-300 mb-12 leading-relaxed max-w-3xl mx-auto">
            Join thousands of schools already using EduConnect to improve 
            educational outcomes and streamline operations across Africa.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
            <Button 
              size="xl"
              onClick={() => navigate("/login")}
              className="min-w-56 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white border-0 shadow-2xl hover:shadow-orange-500/25 transition-all duration-300 hover:scale-105"
            >
              <GraduationCap className="w-6 h-6 mr-3" />
              Get Started Today
            </Button>
            
            <Button 
              variant="outline"
              size="xl"
              className="min-w-56 border-slate-600 text-slate-200 bg-slate-800/50 hover:bg-slate-700 hover:border-slate-400 hover:text-white transition-all duration-300 backdrop-blur-sm hover:scale-105"
            >
              <BookOpen className="w-6 h-6 mr-3" />
              View Demo
            </Button>
          </div>
          
          {/* Stats Section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-20 pt-16 border-t border-slate-700/50">
            <div className="text-center">
              <div className="text-3xl sm:text-4xl font-bold text-white mb-2">10,000+</div>
              <div className="text-slate-400">Students Enrolled</div>
            </div>
            <div className="text-center">
              <div className="text-3xl sm:text-4xl font-bold text-white mb-2">500+</div>
              <div className="text-slate-400">Schools Using EduConnect</div>
            </div>
            <div className="text-center">
              <div className="text-3xl sm:text-4xl font-bold text-white mb-2">25+</div>
              <div className="text-slate-400">African Countries</div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-t border-slate-700 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-red-500 rounded-2xl flex items-center justify-center">
                <GraduationCap className="w-7 h-7 text-white" />
              </div>
              <span className="text-2xl font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                EduConnect
              </span>
            </div>
            <p className="text-slate-400 text-lg mb-8">
              © 2024 EduConnect. Empowering education across Africa.
            </p>
            
            {/* Social Links Placeholder */}
            <div className="flex justify-center gap-6">
              <div className="w-10 h-10 bg-slate-800 hover:bg-slate-700 rounded-full flex items-center justify-center transition-colors duration-300 cursor-pointer">
                <Globe className="w-5 h-5 text-slate-400 hover:text-white" />
              </div>
              <div className="w-10 h-10 bg-slate-800 hover:bg-slate-700 rounded-full flex items-center justify-center transition-colors duration-300 cursor-pointer">
                <Smartphone className="w-5 h-5 text-slate-400 hover:text-white" />
              </div>
              <div className="w-10 h-10 bg-slate-800 hover:bg-slate-700 rounded-full flex items-center justify-center transition-colors duration-300 cursor-pointer">
                <Shield className="w-5 h-5 text-slate-400 hover:text-white" />
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
