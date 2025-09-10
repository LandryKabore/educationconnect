import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GraduationCap, Users, BookOpen, Shield, Wifi, Globe, Smartphone, Calculator, Brain, Microscope, Code2, Lightbulb, Database } from "lucide-react";
import { useState, useEffect } from "react";

const Index = () => {
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
    { icon: Calculator, x: 15, y: 20, size: 40, delay: 0 },
    { icon: Brain, x: 85, y: 25, size: 50, delay: 0.1 },
    { icon: Microscope, x: 25, y: 70, size: 45, delay: 0.2 },
    { icon: Code2, x: 75, y: 65, size: 35, delay: 0.3 },
    { icon: Lightbulb, x: 10, y: 45, size: 38, delay: 0.4 },
    { icon: Database, x: 90, y: 80, size: 42, delay: 0.5 },
    { icon: Globe, x: 60, y: 15, size: 36, delay: 0.6 },
    { icon: BookOpen, x: 45, y: 85, size: 48, delay: 0.7 },
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
          const moveX = mousePosition.x * (15 + index * 3);
          const moveY = mousePosition.y * (10 + index * 2);
          
          return (
            <div
              key={index}
              className="absolute opacity-20 transition-transform duration-1000 ease-out pointer-events-none"
              style={{
                left: `${item.x}%`,
                top: `${item.y}%`,
                transform: `translate(${moveX}px, ${moveY}px) rotate(${moveX * 0.1}deg)`,
                transitionDelay: `${item.delay}s`,
              }}
            >
              <div className="p-3 rounded-xl bg-gradient-to-br from-orange-500/20 to-red-500/20 backdrop-blur-sm border border-orange-500/20">
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
              Achieve{" "}
              <span className="bg-gradient-to-r from-orange-400 to-red-400 bg-clip-text text-transparent">
                mastery
              </span>
              <br />
              <span className="text-white">through education</span>
            </h1>
            <p className="text-xl text-slate-300 max-w-3xl mx-auto mb-10 leading-relaxed">
              Improve your school management by connecting with powerful tools that continuously 
              challenge and push your educational practice forward.
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
                className="min-w-48 border-slate-600 text-slate-300 hover:bg-slate-800 hover:border-slate-500 hover:text-white transition-all duration-300"
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
      <section className="py-24 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Built for Modern Education
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Everything you need to manage school operations efficiently, 
              with features designed specifically for African educational institutions.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => {
              const IconComponent = feature.icon;
              return (
                <Card key={index} className="shadow-card hover:shadow-elevated transition-all duration-300 border-border">
                  <CardHeader>
                    <div className="w-12 h-12 bg-gradient-primary rounded-xl flex items-center justify-center mb-4">
                      <IconComponent className="w-6 h-6 text-white" />
                    </div>
                    <CardTitle className="text-xl">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-muted-foreground leading-relaxed">
                      {feature.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-muted">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-6">
            Ready to Transform Your School?
          </h2>
          <p className="text-lg text-muted-foreground mb-10 leading-relaxed">
            Join thousands of schools already using EduConnect to improve 
            educational outcomes and streamline operations.
          </p>
          <Button 
            variant="default" 
            size="xl"
            onClick={() => navigate("/login")}
            className="shadow-interactive hover:shadow-elevated"
          >
            <GraduationCap className="w-5 h-5 mr-2" />
            Get Started Today
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-card border-t border-border py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <GraduationCap className="w-6 h-6 text-primary" />
              <span className="text-xl font-bold text-foreground">EduConnect</span>
            </div>
            <p className="text-muted-foreground">
              © 2024 EduConnect. Empowering education across Africa.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
