import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, User, Lock, GraduationCap, Users, Loader2, Key } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const UsernameLogin = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'signin' | 'firsttime'>('signin');
  const [formData, setFormData] = useState({
    username: "",
    password: "",
  });
  const [firstTimeData, setFirstTimeData] = useState({
    username: "",
    tempPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [userType, setUserType] = useState<'teacher' | 'student'>('student');

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.username || !formData.password) {
      toast({
        title: "Error",
        description: "Please enter both username and password.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    
    try {
      if (userType === 'teacher') {
        const { data, error } = await supabase.functions.invoke('verify-teacher-temp-login', {
          body: {
            username: formData.username,
            password: formData.password
          }
        });

        if (error) throw error;

        if (data.temporary_login) {
          toast({
            title: "First Time Login",
            description: "Please use the 'First Time' tab to set your permanent password.",
            variant: "destructive",
          });
          return;
        }

        if (data.success && data.session) {
          await supabase.auth.setSession(data.session);
          navigate('/teacher-dashboard');
        }
      } else {
        const { data, error } = await supabase.functions.invoke('verify-student-login', {
          body: {
            username: formData.username,
            password: formData.password
          }
        });

        if (error) throw error;

        if (data.temporary_login) {
          toast({
            title: "First Time Login",
            description: "Please use the 'First Time' tab to set your permanent password.",
            variant: "destructive",
          });
          return;
        }

        if (data.success && data.session) {
          await supabase.auth.setSession(data.session);
          
          const { data: enrollments, error: enrollmentError } = await supabase
            .from('enrollments')
            .select('*')
            .eq('student_user_id', data.user.id)
            .eq('status', 'active');

          if (enrollmentError) throw enrollmentError;

          if (!enrollments || enrollments.length === 0) {
            navigate('/student-class-selection');
          } else {
            navigate('/student-dashboard');
          }
        }
      }
      
    } catch (error: any) {
      console.error('Login error:', error);
      toast({
        title: "Login Failed",
        description: error.message || "Invalid username or password.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFirstTime = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!firstTimeData.username || !firstTimeData.tempPassword || !firstTimeData.newPassword || !firstTimeData.confirmPassword) {
      toast({
        title: "Error",
        description: "Please fill in all fields.",
        variant: "destructive",
      });
      return;
    }

    if (firstTimeData.newPassword !== firstTimeData.confirmPassword) {
      toast({
        title: "Error",
        description: "Passwords do not match.",
        variant: "destructive",
      });
      return;
    }

    if (firstTimeData.newPassword.length < 6) {
      toast({
        title: "Error",
        description: "Password must be at least 6 characters.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    
    try {
      if (userType === 'teacher') {
        const { data, error } = await supabase.functions.invoke('verify-teacher-temp-login', {
          body: {
            username: firstTimeData.username,
            tempPassword: firstTimeData.tempPassword
          }
        });

        if (error) throw error;

        if (data.temporary_login) {
          navigate('/teacher-first-login', { 
            state: { 
              username: firstTimeData.username,
              teacherId: data.teacher_id,
              firstName: data.first_name,
              lastName: data.last_name
            } 
          });
        } else {
          toast({
            title: "Error",
            description: "Invalid temporary credentials or already used.",
            variant: "destructive",
          });
        }
      } else {
        const { data, error } = await supabase.functions.invoke('verify-student-login', {
          body: {
            username: firstTimeData.username,
            password: firstTimeData.tempPassword
          }
        });

        if (error) throw error;

        if (data.temporary_login) {
          navigate('/complete-student-setup', { 
            state: { 
              username: firstTimeData.username,
              studentId: data.student_id,
              firstName: data.first_name,
              lastName: data.last_name
            } 
          });
        } else {
          toast({
            title: "Error",
            description: "Invalid temporary credentials or already used.",
            variant: "destructive",
          });
        }
      }
      
    } catch (error: any) {
      console.error('First time login error:', error);
      toast({
        title: "Login Failed",
        description: error.message || "Invalid temporary credentials.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="bg-slate-800/50 border-b border-slate-700/50 shadow-xl backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Button 
                variant="outline" 
                size="icon"
                onClick={() => navigate("/login")}
                className="shrink-0 border-slate-600 text-slate-200 bg-slate-800/50 hover:bg-slate-700"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold text-white">Login</h1>
                <p className="text-sm text-slate-300">Enter your username and password</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-md mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Card className="bg-slate-800/50 border-slate-700 shadow-xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 p-3 bg-orange-500/10 rounded-full w-fit">
              <User className="w-8 h-8 text-orange-400" />
            </div>
            <CardTitle className="text-2xl text-white">
              {userType === 'teacher' ? 'Teacher' : 'Student'} Login
            </CardTitle>
            <CardDescription className="text-slate-300">
              Sign in or complete your first time setup
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* User Type Selection */}
            <div className="space-y-3">
              <Label className="text-slate-200">I am a:</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={userType === 'student' ? 'default' : 'outline'}
                  onClick={() => setUserType('student')}
                  className={userType === 'student' 
                    ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                    : 'border-slate-600 text-slate-200 hover:bg-slate-700'
                  }
                >
                  <GraduationCap className="w-4 h-4 mr-2" />
                  Student
                </Button>
                <Button
                  type="button"
                  variant={userType === 'teacher' ? 'default' : 'outline'}
                  onClick={() => setUserType('teacher')}
                  className={userType === 'teacher' 
                    ? 'bg-green-600 hover:bg-green-700 text-white' 
                    : 'border-slate-600 text-slate-200 hover:bg-slate-700'
                  }
                >
                  <Users className="w-4 h-4 mr-2" />
                  Teacher
                </Button>
              </div>
            </div>

            {/* Tabs for Sign In / First Time */}
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'signin' | 'firsttime')} className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-slate-700/50">
                <TabsTrigger value="signin" className="data-[state=active]:bg-blue-600">
                  Sign In
                </TabsTrigger>
                <TabsTrigger value="firsttime" className="data-[state=active]:bg-green-600">
                  First Time
                </TabsTrigger>
              </TabsList>

              {/* Sign In Tab */}
              <TabsContent value="signin" className="space-y-4 mt-4">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signin-username" className="text-slate-200">Username</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                      <Input
                        id="signin-username"
                        type="text"
                        value={formData.username}
                        onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                        className="bg-slate-700 border-slate-600 text-white pl-10"
                        placeholder="Enter your username"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signin-password" className="text-slate-200">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                      <Input
                        id="signin-password"
                        type="password"
                        value={formData.password}
                        onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                        className="bg-slate-700 border-slate-600 text-white pl-10"
                        placeholder="Enter your password"
                        required
                      />
                    </div>
                  </div>

                  <Button 
                    type="submit" 
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white"
                  >
                    {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Sign In
                  </Button>
                </form>
              </TabsContent>

              {/* First Time Tab */}
              <TabsContent value="firsttime" className="space-y-4 mt-4">
                <form onSubmit={handleFirstTime} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="firsttime-username" className="text-slate-200">Username</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                      <Input
                        id="firsttime-username"
                        type="text"
                        value={firstTimeData.username}
                        onChange={(e) => setFirstTimeData(prev => ({ ...prev, username: e.target.value }))}
                        className="bg-slate-700 border-slate-600 text-white pl-10"
                        placeholder="Enter your temporary username"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="firsttime-temp-password" className="text-slate-200">Temporary Password</Label>
                    <div className="relative">
                      <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                      <Input
                        id="firsttime-temp-password"
                        type="password"
                        value={firstTimeData.tempPassword}
                        onChange={(e) => setFirstTimeData(prev => ({ ...prev, tempPassword: e.target.value }))}
                        className="bg-slate-700 border-slate-600 text-white pl-10"
                        placeholder="Enter your temporary password"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="firsttime-new-password" className="text-slate-200">New Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                      <Input
                        id="firsttime-new-password"
                        type="password"
                        value={firstTimeData.newPassword}
                        onChange={(e) => setFirstTimeData(prev => ({ ...prev, newPassword: e.target.value }))}
                        className="bg-slate-700 border-slate-600 text-white pl-10"
                        placeholder="Enter your new password"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="firsttime-confirm-password" className="text-slate-200">Confirm New Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                      <Input
                        id="firsttime-confirm-password"
                        type="password"
                        value={firstTimeData.confirmPassword}
                        onChange={(e) => setFirstTimeData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                        className="bg-slate-700 border-slate-600 text-white pl-10"
                        placeholder="Confirm your new password"
                        required
                      />
                    </div>
                  </div>

                  <Button 
                    type="submit" 
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white"
                  >
                    {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Complete First Time Setup
                  </Button>
                </form>
              </TabsContent>
            </Tabs>

            <div className="text-center">
              <Button
                variant="link"
                onClick={() => navigate("/login")}
                className="text-slate-400 hover:text-slate-200"
              >
                Back to role selection
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default UsernameLogin;