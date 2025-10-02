import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GraduationCap, Users, BookOpen, Shield, Wifi, Globe, Smartphone } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageToggle } from "@/components/LanguageToggle";
import { motion, stagger, useAnimate } from "motion/react";
import Floating, { FloatingElement } from "@/components/ui/parallax-floating";

const Index = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [scope, animate] = useAnimate();

  useEffect(() => {
    animate(".floating-icon", { opacity: [0, 0.3] }, { duration: 0.5, delay: stagger(0.15) });
  }, []);

  const floatingImages = [
    {
      url: "https://images.unsplash.com/photo-1727341554370-80e0fe9ad082?q=80&w=2276&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
      className: "w-16 h-16 md:w-24 md:h-24",
      depth: 0.5,
      x: "11%",
      y: "8%"
    },
    {
      url: "https://images.unsplash.com/photo-1640680608781-2e4199dd1579?q=80&w=3087&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
      className: "w-20 h-20 md:w-28 md:h-28",
      depth: 1,
      x: "32%",
      y: "10%"
    },
    {
      url: "https://images.unsplash.com/photo-1726083085160-feeb4e1e5b00?q=80&w=3024&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
      className: "w-28 h-40 md:w-40 md:h-52",
      depth: 2,
      x: "53%",
      y: "2%"
    },
    {
      url: "https://images.unsplash.com/photo-1562016600-ece13e8ba570?q=80&w=2838&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
      className: "w-24 h-24 md:w-32 md:h-32",
      depth: 1,
      x: "83%",
      y: "0%"
    },
    {
      url: "https://images.unsplash.com/photo-1624344965199-ed40391d20f2?q=80&w=2960&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
      className: "w-28 h-28 md:w-36 md:h-36",
      depth: 1,
      x: "2%",
      y: "40%"
    },
    {
      url: "https://images.unsplash.com/photo-1677338354108-223e807fb1bd?q=80&w=3087&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
      className: "w-28 h-28 md:w-36 md:h-48",
      depth: 2,
      x: "77%",
      y: "70%"
    },
    {
      url: "https://images.unsplash.com/photo-1689553079282-45df1b35741b?q=80&w=3087&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
      className: "w-40 md:w-52 h-full",
      depth: 4,
      x: "15%",
      y: "73%"
    },
    {
      url: "https://images.unsplash.com/photo-1721968317938-cf8c60fccd1a?q=80&w=2728&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
      className: "w-24 h-24 md:w-32 md:h-32",
      depth: 1,
      x: "50%",
      y: "80%"
    },
  ];

  const features = [
    {
      icon: Users,
      title: t('features.multiRole.title'),
      description: t('features.multiRole.description'),
    },
    {
      icon: Wifi,
      title: t('features.offline.title'),
      description: t('features.offline.description'),
    },
    {
      icon: Globe,
      title: t('features.multiLanguage.title'),
      description: t('features.multiLanguage.description'),
    },
    {
      icon: Smartphone,
      title: t('features.mobile.title'),
      description: t('features.mobile.description'),
    },
    {
      icon: Shield,
      title: t('features.secure.title'),
      description: t('features.secure.description'),
    },
    {
      icon: BookOpen,
      title: t('features.studyGroups.title'),
      description: t('features.studyGroups.description'),
    },
  ];

  return (
    <div className="min-h-screen bg-background" ref={scope}>
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 light:from-slate-50 light:via-white light:to-slate-100 min-h-screen flex items-center">
        {/* Theme and Language Controls */}
        <div className="absolute top-4 right-4 z-20 flex gap-2">
          <LanguageToggle />
          <ThemeToggle />
        </div>
        
        {/* Background Grid Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
        
        {/* Parallax Floating Elements */}
        <Floating sensitivity={-1} className="overflow-hidden">
          {floatingImages.map((item, index) => (
            <FloatingElement 
              key={index} 
              depth={item.depth} 
              className="floating-icon"
            >
              <motion.img
                initial={{ opacity: 0 }}
                src={item.url}
                alt=""
                className={`${item.className} object-cover hover:scale-105 duration-200 cursor-pointer transition-transform`}
                style={{ position: 'absolute', left: item.x, top: item.y }}
              />
            </FloatingElement>
          ))}
        </Floating>
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 z-10">
          <motion.div 
            className="text-center"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.88, delay: 1.5 }}
          >
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-orange-500/20 to-red-500/20 rounded-3xl backdrop-blur-sm border border-orange-500/30 mb-8">
              <GraduationCap className="w-10 h-10 text-orange-400" />
            </div>
            <h1 className="text-4xl sm:text-6xl font-bold text-white dark:text-white light:text-slate-900 mb-6">
              {t('welcome')}{" "}
              <span className="bg-gradient-to-r from-orange-400 to-red-400 bg-clip-text text-transparent">
                {t('appName')}
              </span>
            </h1>
            <p className="text-xl text-slate-300 dark:text-slate-300 light:text-slate-600 max-w-3xl mx-auto mb-10 leading-relaxed">
              {t('description')}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button 
                size="xl"
                onClick={() => navigate("/auth")}
                className="min-w-48 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300"
              >
                <GraduationCap className="w-5 h-5 mr-2" />
                {t('getStarted')}
              </Button>
              <Button 
                variant="outline" 
                size="xl"
                className="min-w-48 border-slate-600 text-slate-200 bg-slate-800/50 hover:bg-slate-700 hover:border-slate-400 hover:text-white transition-all duration-300 backdrop-blur-sm dark:border-slate-600 dark:text-slate-200 dark:bg-slate-800/50 dark:hover:bg-slate-700 light:border-slate-300 light:text-slate-700 light:bg-white/50 light:hover:bg-slate-50"
              >
                {t('learnMore')}
              </Button>
            </div>
          </motion.div>
        </div>
        
        {/* Additional floating elements */}
        <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-orange-400/40 rounded-full animate-pulse" />
        <div className="absolute top-3/4 right-1/4 w-1 h-1 bg-red-400/40 rounded-full animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/6 w-1.5 h-1.5 bg-orange-400/30 rounded-full animate-pulse" style={{ animationDelay: '2s' }} />
      </section>

      {/* Features Section */}
      <section className="py-24 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative overflow-hidden">
        {/* Background Grid Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:64px_64px]" />
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center mb-20">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-orange-500/20 to-red-500/20 rounded-2xl backdrop-blur-sm border border-orange-500/20 mb-6">
              <BookOpen className="w-8 h-8 text-orange-400" />
            </div>
            <h2 className="text-4xl sm:text-5xl font-bold text-white dark:text-white light:text-slate-900 mb-6">
              {t('builtForEducation')}{" "}
              <span className="bg-gradient-to-r from-orange-400 to-red-400 bg-clip-text text-transparent">
                {t('modernEducation')}
              </span>
            </h2>
            <p className="text-xl text-slate-300 dark:text-slate-300 light:text-slate-600 max-w-3xl mx-auto leading-relaxed">
              {t('educationDescription')}
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
                  <Card className="h-full bg-slate-800/60 backdrop-blur-sm border border-slate-600/50 shadow-xl hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 group-hover:bg-slate-800/80">
                    <CardHeader className="pb-4">
                      <div className="relative mb-6">
                        <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-red-500 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                          <IconComponent className="w-8 h-8 text-white" />
                        </div>
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-red-500 rounded-2xl opacity-20 group-hover:opacity-30 transition-opacity duration-300 blur-xl" />
                      </div>
                      <CardTitle className="text-xl font-bold text-white group-hover:text-orange-400 transition-colors duration-300">
                        {feature.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <CardDescription className="text-slate-300 leading-relaxed text-base">
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
        {/* Background Grid Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
        
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-orange-500/20 to-red-500/20 rounded-3xl backdrop-blur-sm border border-orange-500/30 mb-8">
            <GraduationCap className="w-10 h-10 text-orange-400" />
          </div>
          
          <h2 className="text-4xl sm:text-6xl font-bold text-white mb-8 leading-tight">
            {t('cta.title')}
          </h2>
          
          <p className="text-xl text-slate-300 mb-12 leading-relaxed max-w-3xl mx-auto">
            {t('cta.description')}
          </p>
          
          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
            <Button 
              size="xl"
              onClick={() => navigate("/auth")}
              className="min-w-56 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white border-0 shadow-2xl hover:shadow-orange-500/25 transition-all duration-300 hover:scale-105"
            >
              <GraduationCap className="w-6 h-6 mr-3" />
              {t('cta.getStartedToday')}
            </Button>
            
            <Button 
              variant="outline"
              size="xl"
              className="min-w-56 border-slate-600 text-slate-200 bg-slate-800/50 hover:bg-slate-700 hover:border-slate-400 hover:text-white transition-all duration-300 backdrop-blur-sm hover:scale-105"
            >
              <BookOpen className="w-6 h-6 mr-3" />
              {t('cta.viewDemo')}
            </Button>
          </div>
          
          {/* Stats Section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-20 pt-16 border-t border-slate-700/50">
            <div className="text-center">
              <div className="text-3xl sm:text-4xl font-bold text-white mb-2">10,000+</div>
              <div className="text-slate-400">{t('stats.students')}</div>
            </div>
            <div className="text-center">
              <div className="text-3xl sm:text-4xl font-bold text-white mb-2">500+</div>
              <div className="text-slate-400">{t('stats.schools')}</div>
            </div>
            <div className="text-center">
              <div className="text-3xl sm:text-4xl font-bold text-white mb-2">25+</div>
              <div className="text-slate-400">{t('stats.countries')}</div>
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
              {t('footer.copyright')}
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
