import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { Users, GraduationCap, BookOpen } from "lucide-react";

const title = "Auth | EduConnect";
const description = "Sign in or create an account to access your EduConnect dashboard.";

type UserRole = "parent" | "teacher" | "student" | "admin";
type AuthStep = "role-selection" | "auth-form";

export default function Auth() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState<AuthStep>("role-selection");
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"signin" | "firsttime">("signin");

  // Shared fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");

  // First time setup fields
  const [tempPassword, setTempPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Signup-only fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [selectedSchool, setSelectedSchool] = useState("");
  const [schools, setSchools] = useState<any[]>([]);

  // Parent verification code fields
  const [verificationCode, setVerificationCode] = useState("");
  const [parentLinkMode, setParentLinkMode] = useState<"existing" | "code">("existing");

  // Sync parent link mode with sign in/sign up mode
  useEffect(() => {
    if (selectedRole === "parent") {
      setParentLinkMode(mode === "signin" ? "existing" : "code");
    }
  }, [mode, selectedRole]);

  useEffect(() => {
    // Fetch schools for signup
    const fetchSchools = async () => {
      const { data } = await supabase.from('schools').select('*').eq('active', true);
      if (data) setSchools(data);
    };
    fetchSchools();

    // SEO: title + description + canonical
    document.title = title;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute("content", description);
    else {
      const m = document.createElement("meta");
      m.name = "description";
      m.content = description;
      document.head.appendChild(m);
    }
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", window.location.href);

    // If already logged in, redirect to their dashboard
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (session?.user) {
        redirectToRole(session.user.id);
      }
    };

    // Listen to auth changes as well
    const { data: auth } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setTimeout(() => redirectToRole(session.user!.id), 0);
      }
    });

    init();
    return () => auth.subscription.unsubscribe();
  }, []);

  const redirectToRole = async (userId: string, expectedRole?: UserRole) => {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("Profile fetch error", error);
      return;
    }

    const userRole = profile?.role as UserRole;
    
    // Check if the user's role matches the expected role (if provided)
    if (expectedRole && userRole !== expectedRole) {
      // Sign out the user since they used wrong credentials for this role
      await supabase.auth.signOut();
      toast({
        title: "Access Denied",
        description: `This ${expectedRole} login cannot be used for a ${userRole} account. Please use the correct role.`,
        variant: "destructive"
      });
      return;
    }

    // Check if admin needs to change password
    const { data: { user } } = await supabase.auth.getUser();
    if (userRole === "admin" && user?.user_metadata?.needs_password_change) {
      navigate("/admin-first-login", { replace: true });
      return;
    }

    // Redirect based on user's actual role
    if (userRole === "parent") {
      navigate("/parent-dashboard", { replace: true });
    } else if (userRole === "teacher") {
      navigate("/teacher-dashboard", { replace: true });
    } else if (userRole === "student") {
      navigate("/student-dashboard", { replace: true });
    } else if (userRole === "admin") {
      navigate("/admin-dashboard", { replace: true });
    } else {
      // Unknown role - redirect to home
      navigate("/", { replace: true });
      toast({
        title: "Unknown Role",
        description: "Your account role is not recognized. Please contact support.",
        variant: "destructive"
      });
    }
  };

  const handleFirstTimeSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username || !tempPassword || !newPassword || !confirmPassword) {
      toast({
        title: "Error",
        description: "Please fill in all fields.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Error",
        description: "Passwords do not match.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: "Error",
        description: "Password must be at least 6 characters.",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      
      if (selectedRole === 'teacher') {
        const { data, error } = await supabase.functions.invoke('verify-teacher-temp-login', {
          body: { username, tempPassword }
        });

        if (error) throw error;

        if (data.temporary_login) {
          navigate('/teacher-first-login', { 
            state: { 
              username,
              teacherId: data.teacher_id,
              firstName: data.first_name,
              lastName: data.last_name
            } 
          });
        } else {
          throw new Error("Invalid temporary credentials or already used.");
        }
      } else if (selectedRole === 'student') {
        const { data, error } = await supabase.functions.invoke('verify-student-login', {
          body: { username, password: tempPassword }
        });

        if (error) throw error;

        if (data.temporary_login) {
          navigate('/complete-student-setup', { 
            state: { 
              username,
              studentId: data.student_id,
              firstName: data.first_name,
              lastName: data.last_name
            } 
          });
        } else {
          throw new Error("Invalid temporary credentials or already used.");
        }
      }
      
    } catch (err: any) {
      toast({ 
        title: "First time setup failed", 
        description: err.message ?? "Invalid temporary credentials.", 
        variant: "destructive" 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStudentTempLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      
      // Call edge function to verify temp credentials
      const { data, error } = await supabase.functions.invoke('verify-student-login', {
        body: { username, password }
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

      if (data.success) {
        // Set session and redirect to dashboard
        if (data.session) {
          await supabase.auth.setSession(data.session);
        }
        navigate('/student-dashboard', { replace: true });
      }
    } catch (err: any) {
      toast({ 
        title: "Login failed", 
        description: err.message ?? "Invalid username or password.", 
        variant: "destructive" 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTeacherTempLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      
      // Call edge function to verify temp credentials
      const { data, error } = await supabase.functions.invoke('verify-teacher-temp-login', {
        body: { username, tempPassword: password }
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
        navigate('/teacher-dashboard', { replace: true });
      }
    } catch (err: any) {
      toast({ 
        title: "Login failed", 
        description: err.message ?? "Invalid username or password.", 
        variant: "destructive" 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleParentVerificationCode = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      
      // Find the parent-student link with this verification code (must be pending and available)
      const { data: linkData, error: linkError } = await supabase
        .from('parent_student_links')
        .select('*')
        .eq('verification_code', verificationCode)
        .eq('status', 'pending')
        .is('parent_user_id', null)
        .maybeSingle();

      if (linkError || !linkData) {
        throw new Error("Invalid or expired verification code");
      }

      // Fetch student info from temp credentials (including school_id)
      const { data: studentData, error: studentError } = await supabase
        .from('student_temp_credentials')
        .select('first_name, last_name, student_user_id, school_id')
        .eq('student_user_id', linkData.student_user_id)
        .single();

      if (studentError || !studentData) {
        throw new Error("Student information not found");
      }

      // Create parent account or sign in
      if (mode === "signup") {
        const redirectUrl = `${window.location.origin}/`;
        const { data: authData, error: signupError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { 
              first_name: firstName, 
              last_name: lastName, 
              role: "parent",
              school_id: studentData.school_id 
            },
            emailRedirectTo: redirectUrl,
          },
        });
        
        if (signupError) throw signupError;
        
        if (authData.user) {
          // Call edge function to link parent to student
          const { error: linkError } = await supabase.functions.invoke('link-parent-to-student', {
            body: {
              linkId: linkData.id,
              parentUserId: authData.user.id,
              verificationCode: verificationCode,
              parentEmail: email,
              parentFirstName: firstName,
              parentLastName: lastName,
              schoolId: studentData.school_id
            }
          });

          if (linkError) {
            console.error('Error linking parent:', linkError);
            toast({
              title: "Account created but linking failed",
              description: "Your account was created but we couldn't link it to the student. Please contact support.",
              variant: "destructive"
            });
            return;
          }

          toast({
            title: "Account created and linked!",
            description: `Successfully linked to ${studentData.first_name} ${studentData.last_name}. Please check your email to confirm your account.`,
          });
        }
      } else {
        // Sign in existing parent
        const { data: authData, error: signinError } = await supabase.auth.signInWithPassword({ 
          email, 
          password 
        });
        
        if (signinError) throw signinError;
        
        if (authData.user) {
          // Call edge function to link parent to student (no firstName/lastName needed for existing account)
          const { error: linkError } = await supabase.functions.invoke('link-parent-to-student', {
            body: {
              linkId: linkData.id,
              parentUserId: authData.user.id,
              verificationCode: verificationCode,
              parentEmail: email,
              schoolId: studentData.school_id
            }
          });

          if (linkError) {
            console.error('Error linking parent:', linkError);
            toast({
              title: "Linking failed",
              description: "We couldn't link your account to the student. Please try again.",
              variant: "destructive"
            });
            return;
          }

          toast({
            title: "Successfully linked!",
            description: `Connected to ${studentData.first_name} ${studentData.last_name}`,
          });
          
          redirectToRole(authData.user.id, "parent");
        }
      }
    } catch (err: any) {
      toast({ 
        title: "Verification failed", 
        description: err.message, 
        variant: "destructive" 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRole) return;
    
    // Handle parent verification code flow
    if (selectedRole === "parent" && parentLinkMode === "code") {
      await handleParentVerificationCode(e);
      return;
    }
    
    try {
      setLoading(true);
      
      // Check for hardcoded admin credentials
      if (email === "blooster@gmail.com" && password === "8691") {
        localStorage.setItem("admin_access", "true");
        toast({
          title: "Admin Access Granted",
          description: "Welcome to the admin panel",
        });
        navigate("/admin-dashboard", { replace: true });
        return;
      }

      // For students, check if they're using temp credentials first
      if (selectedRole === "student" && username) {
        await handleStudentTempLogin(e);
        return;
      }
      
      // For teachers, check if they're using temp credentials first
      if (selectedRole === "teacher" && username) {
        await handleTeacherTempLogin(e);
        return;
      }
      
      // For students who completed setup, try username-based login
      if (selectedRole === "student" && !username && !email.includes('@')) {
        // If they entered a username instead of email, convert it to system email format
        const systemEmail = `${email}@student.local`;
        const { data, error } = await supabase.auth.signInWithPassword({ 
          email: systemEmail, 
          password 
        });
        if (error) throw error;
        if (data.user) {
          const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("role")
            .eq("user_id", data.user.id)
            .maybeSingle();

          if (profileError) {
            console.error("Profile fetch error", profileError);
            await supabase.auth.signOut();
            throw new Error("Failed to validate user role");
          }

          const userRole = profile?.role as UserRole;
          
          if (userRole !== selectedRole) {
            await supabase.auth.signOut();
            toast({
              title: "Access Denied",
              description: `These credentials belong to a ${userRole} account. Please select the correct role.`,
              variant: "destructive"
            });
            return;
          }

          toast({ title: "Welcome back", description: "Signed in successfully." });
          redirectToRole(data.user.id, selectedRole);
        }
        return;
      }
      
      // For teachers who completed setup, try username-based login
      if (selectedRole === "teacher" && !username && !email.includes('@')) {
        // If they entered a username instead of email, convert it to system email format
        const systemEmail = `${email}@system.internal`;
        const { data, error } = await supabase.auth.signInWithPassword({ 
          email: systemEmail, 
          password 
        });
        if (error) throw error;
        if (data.user) {
          const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("role")
            .eq("user_id", data.user.id)
            .maybeSingle();

          if (profileError) {
            console.error("Profile fetch error", profileError);
            await supabase.auth.signOut();
            throw new Error("Failed to validate user role");
          }

          const userRole = profile?.role as UserRole;
          
          if (userRole !== selectedRole) {
            await supabase.auth.signOut();
            toast({
              title: "Access Denied",
              description: `These credentials belong to a ${userRole} account. Please select the correct role.`,
              variant: "destructive"
            });
            return;
          }

          toast({ title: "Welcome back", description: "Signed in successfully." });
          redirectToRole(data.user.id, selectedRole);
        }
        return;
      }
      
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (data.user) {
        // Validate role first before showing success message
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("role")
          .eq("user_id", data.user.id)
          .maybeSingle();

        if (profileError) {
          console.error("Profile fetch error", profileError);
          await supabase.auth.signOut();
          throw new Error("Failed to validate user role");
        }

        const userRole = profile?.role as UserRole;
        
        // Check if the user's role matches the expected role
        if (userRole !== selectedRole) {
          await supabase.auth.signOut();
          toast({
            title: "Access Denied",
            description: `These credentials belong to a ${userRole} account. Please select the correct role.`,
            variant: "destructive"
          });
          return;
        }

        // Only show success message if role is correct
        toast({ title: "Welcome back", description: "Signed in successfully." });
        redirectToRole(data.user.id, selectedRole);
      }
    } catch (err: any) {
      toast({ title: "Sign in failed", description: err.message ?? "Please check your credentials.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRole) return;
    
    // Handle parent verification code flow
    if (selectedRole === "parent" && parentLinkMode === "code") {
      await handleParentVerificationCode(e);
      return;
    }
    
    try {
      setLoading(true);
      const redirectUrl = `${window.location.origin}/`;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { 
            first_name: firstName, 
            last_name: lastName, 
            role: selectedRole,
            school_id: selectedSchool 
          },
          emailRedirectTo: redirectUrl,
        },
      });
      if (error) throw error;
      if (data.user) {
        toast({ title: "Account created", description: "Please check your email to confirm your account." });
        // Optional immediate redirect if confirmation not required
        // redirectToRole(data.user.id, selectedRole);
      }
    } catch (err: any) {
      toast({ title: "Sign up failed", description: err.message ?? "Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const roles = [
    {
      id: "student" as UserRole,
      title: "Student",
      description: "Access your assignments, grades, and course materials",
      icon: GraduationCap,
      color: "from-blue-500 to-blue-600"
    },
    {
      id: "teacher" as UserRole,
      title: "Teacher",
      description: "Manage classes, assignments, and student progress",
      icon: BookOpen,
      color: "from-green-500 to-green-600"
    },
    {
      id: "parent" as UserRole,
      title: "Parent",
      description: "Monitor your child's academic progress and school communication",
      icon: Users,
      color: "from-purple-500 to-purple-600"
    }
  ];

  const handleRoleSelect = (role: UserRole) => {
    setSelectedRole(role);
    setStep("auth-form");
    setMode("signin"); // Default to signin when role is selected
  };

  const goBackToRoleSelection = () => {
    setStep("role-selection");
    setSelectedRole(null);
    setEmail("");
    setPassword("");
    setFirstName("");
    setLastName("");
    setSelectedSchool("");
  };

  if (step === "role-selection") {
    return (
      <div className="min-h-screen bg-background">
        <header className="sr-only">
          <h1>EduConnect - Select Your Role</h1>
        </header>
        <main className="container mx-auto max-w-4xl px-4 py-10">
          <div className="flex justify-center mb-6">
            <Button 
              variant="ghost" 
              onClick={() => navigate("/")}
              className="gap-2"
            >
              ← Back to Home
            </Button>
          </div>
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4">Welcome to EduConnect</h1>
            <p className="text-muted-foreground text-lg">Please select your role to continue</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {roles.map((role) => {
              const IconComponent = role.icon;
              return (
                <Card
                  key={role.id}
                  className="cursor-pointer transition-all duration-300 hover:shadow-elevated hover:-translate-y-2 group"
                  onClick={() => handleRoleSelect(role.id)}
                >
                  <CardContent className="p-8 text-center">
                    <div className={`w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br ${role.color} flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
                      <IconComponent className="w-10 h-10 text-white" />
                    </div>
                    <h3 className="text-2xl font-bold mb-3">{role.title}</h3>
                    <p className="text-muted-foreground">{role.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </main>
      </div>
    );
  }

  const selectedRoleInfo = roles.find(r => r.id === selectedRole);

  return (
    <div className="min-h-screen bg-background">
      <header className="sr-only">
        <h1>EduConnect Authentication</h1>
      </header>
      <main className="container mx-auto max-w-md px-4 py-10">
        <div className="flex justify-center mb-6">
          <Button 
            variant="ghost" 
            onClick={() => navigate("/")}
            className="gap-2"
          >
            ← Back to Home
          </Button>
        </div>
        <Card className="shadow-elevated">
          <CardHeader>
            <div className="flex items-center gap-3 mb-4">
              <Button variant="ghost" size="sm" onClick={goBackToRoleSelection}>
                ← Back
              </Button>
              {selectedRoleInfo && (
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${selectedRoleInfo.color} flex items-center justify-center`}>
                    <selectedRoleInfo.icon className="w-4 h-4 text-white" />
                  </div>
                  <span className="font-medium">{selectedRoleInfo.title}</span>
                </div>
              )}
            </div>
            <CardTitle>
              {mode === "signin" ? `Sign In as ${selectedRoleInfo?.title}` : `Create ${selectedRoleInfo?.title} Account`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Show tabs for teachers and students, toggle for parents */}
            {(selectedRole === "teacher" || selectedRole === "student") ? (
              <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "signin" | "firsttime")} className="w-full mb-6">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="signin">Sign In</TabsTrigger>
                  <TabsTrigger value="firsttime">First Time</TabsTrigger>
                </TabsList>
              </Tabs>
            ) : (
              <div className="flex gap-2 mb-6">
                <Button variant={mode === "signin" ? "default" : "outline"} onClick={() => setMode("signin")}>
                  Sign In
                </Button>
                <Button variant={mode === "signup" ? "default" : "outline"} onClick={() => setMode("signup")}>
                  Sign Up
                </Button>
              </div>
            )}

            {/* Teacher/Student First Time Setup Form */}
            {(selectedRole === "teacher" || selectedRole === "student") && activeTab === "firsttime" ? (
              <form onSubmit={handleFirstTimeSetup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="firsttime-username">Username</Label>
                  <Input 
                    id="firsttime-username" 
                    value={username} 
                    onChange={(e) => setUsername(e.target.value)} 
                    placeholder="Enter your username"
                    required 
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="firsttime-temp-password">Temporary Password</Label>
                  <Input 
                    id="firsttime-temp-password" 
                    type="password"
                    value={tempPassword} 
                    onChange={(e) => setTempPassword(e.target.value)} 
                    placeholder="Enter your temporary password"
                    required 
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="firsttime-new-password">New Password</Label>
                  <Input 
                    id="firsttime-new-password" 
                    type="password"
                    value={newPassword} 
                    onChange={(e) => setNewPassword(e.target.value)} 
                    placeholder="Enter your new password"
                    required 
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="firsttime-confirm-password">Confirm New Password</Label>
                  <Input 
                    id="firsttime-confirm-password" 
                    type="password"
                    value={confirmPassword} 
                    onChange={(e) => setConfirmPassword(e.target.value)} 
                    placeholder="Confirm your new password"
                    required 
                  />
                </div>
                
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Setting up..." : "Complete First Time Setup"}
                </Button>
              </form>
            ) : mode === "signin" || activeTab === "signin" ? (
              <form onSubmit={handleSignIn} className="space-y-4">
                {selectedRole === "parent" && parentLinkMode === "code" && (
                  <div className="space-y-2">
                    <Label htmlFor="verificationCode">Student Verification Code</Label>
                    <Input 
                      id="verificationCode" 
                      value={verificationCode} 
                      onChange={(e) => setVerificationCode(e.target.value)} 
                      placeholder="Enter 6-digit code"
                      maxLength={6}
                      required 
                    />
                    <p className="text-sm text-muted-foreground">
                      Enter the code provided when your child's student account was created.
                    </p>
                  </div>
                )}
                
                <div className="space-y-2">
                  <Label htmlFor="email">
                    {(selectedRole === "teacher" || selectedRole === "student") ? "Username or Email" : "Email"}
                  </Label>
                  <Input 
                    id="email" 
                    type={(selectedRole === "teacher" || selectedRole === "student") ? "text" : "email"} 
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)} 
                    placeholder={(selectedRole === "teacher" || selectedRole === "student") ? "Enter username or email" : "Enter your email"}
                    required 
                  />
                </div>
                
                {!(selectedRole === "parent" && parentLinkMode === "code") && (
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                  </div>
                )}
                
                {selectedRole === "parent" && parentLinkMode === "code" && (
                  <div className="space-y-2">
                    <Label htmlFor="password">Create Password</Label>
                    <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                  </div>
                )}
                
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 
                    (selectedRole === "parent" && parentLinkMode === "code" ? "Linking..." : "Signing in...") : 
                    (selectedRole === "parent" && parentLinkMode === "code" ? "Link Account" : `Sign In as ${selectedRoleInfo?.title}`)
                  }
                </Button>
              </form>
            ) : (
              <form onSubmit={handleSignUp} className="space-y-4">
                {selectedRole === "parent" && parentLinkMode === "code" && (
                  <div className="space-y-2">
                    <Label htmlFor="verificationCode">Student Verification Code</Label>
                    <Input 
                      id="verificationCode" 
                      value={verificationCode} 
                      onChange={(e) => setVerificationCode(e.target.value)} 
                      placeholder="Enter 6-digit code"
                      maxLength={6}
                      required 
                    />
                    <p className="text-sm text-muted-foreground">
                      Enter the code provided when your child's student account was created.
                    </p>
                  </div>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First name</Label>
                    <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last name</Label>
                    <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
                {(selectedRole === 'student' || selectedRole === 'teacher' || selectedRole === 'parent') && 
                 !(selectedRole === "parent" && parentLinkMode === "code") && (
                  <div className="space-y-2">
                    <Label htmlFor="school">School</Label>
                    <select 
                      id="school"
                      value={selectedSchool} 
                      onChange={(e) => setSelectedSchool(e.target.value)}
                      className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                      required={selectedRole === 'student' || selectedRole === 'teacher' || selectedRole === 'parent'}
                    >
                      <option value="">Select a school</option>
                      {schools.map((school) => (
                        <option key={school.id} value={school.id}>
                          {school.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 
                    (selectedRole === "parent" && parentLinkMode === "code" ? "Creating & Linking..." : "Creating account...") : 
                    (selectedRole === "parent" && parentLinkMode === "code" ? "Create & Link Account" : `Create ${selectedRoleInfo?.title} Account`)
                  }
                </Button>
              </form>
            )}

            {/* Only show toggle for parents */}
            {selectedRole === "parent" && (
              <div className="mt-6 text-center text-sm text-muted-foreground">
                <button
                  className="underline underline-offset-4 hover:text-foreground"
                  onClick={() => setMode((m) => (m === "signin" ? "signup" : "signin"))}
                >
                  {mode === "signin" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
