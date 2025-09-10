import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GraduationCap, Users, BookOpen, Shield, Wifi, Globe, Smartphone } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

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
      <section className="relative overflow-hidden bg-gradient-primary">
        <div className="absolute inset-0 bg-gradient-hero opacity-90" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-white/10 rounded-3xl backdrop-blur-sm border border-white/20 mb-8">
              <GraduationCap className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-4xl sm:text-6xl font-bold text-white mb-6">
              Welcome to{" "}
              <span className="bg-gradient-accent bg-clip-text text-transparent">
                EduConnect
              </span>
            </h1>
            <p className="text-xl text-white/90 max-w-3xl mx-auto mb-10 leading-relaxed">
              A comprehensive school management platform designed for African schools. 
              Manage classes, track progress, and foster communication between parents, 
              teachers, and students.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button 
                variant="hero" 
                size="xl"
                onClick={() => navigate("/login")}
                className="min-w-48"
              >
                <GraduationCap className="w-5 h-5 mr-2" />
                Access Platform
              </Button>
              <Button 
                variant="outline" 
                size="xl"
                className="min-w-48 bg-white/10 border-white/30 text-white hover:bg-white hover:text-primary"
              >
                Learn More
              </Button>
            </div>
          </div>
        </div>
        
        {/* Decorative Elements */}
        <div className="absolute top-20 left-10 w-32 h-32 bg-white/5 rounded-full blur-xl" />
        <div className="absolute bottom-20 right-10 w-48 h-48 bg-white/5 rounded-full blur-xl" />
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
