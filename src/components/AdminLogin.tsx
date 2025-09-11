import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface AdminLoginProps {
  onSuccess: () => void;
}

export function AdminLogin({ onSuccess }: AdminLoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    role: 'parent' as 'admin' | 'teacher' | 'student' | 'parent',
    schoolId: ''
  });
  const [schools, setSchools] = useState<Array<{id: string, name: string}>>([]);
  const { toast } = useToast();

  useEffect(() => {
    const fetchSchools = async () => {
      const { data } = await supabase
        .from('schools')
        .select('id, name')
        .eq('active', true);
      setSchools(data || []);
    };
    
    if (isSignUp) {
      fetchSchools();
    }
  }, [isSignUp]);

  useEffect(() => {
    // Keep the auth state listener simple per best practices
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        // Do not fetch here to avoid deadlocks; dashboard will handle
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function checkAdmin(): Promise<boolean> {
    const { data, error } = await supabase.rpc('is_admin');
    if (error) throw error;
    return data === true;
  }

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isSignUp) {
        const redirectUrl = `${window.location.origin}/admin-dashboard`;
        // Validate school selection for non-admin roles
        if ((formData.role === 'teacher' || formData.role === 'student' || formData.role === 'parent') && !formData.schoolId) {
          toast({
            title: "School required",
            description: "Please select a school for this role.",
            variant: "destructive",
          });
          return;
        }

        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectUrl,
            data: { 
              first_name: formData.firstName,
              last_name: formData.lastName,
              role: formData.role,
              school_id: formData.schoolId || null // Convert empty string to null
            }
          }
        });
        if (error) throw error;
        toast({
          title: "Confirmation sent",
          description: "Check your email to confirm and complete setup.",
        });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const isAdmin = await checkAdmin();
        if (!isAdmin) {
          toast({
            title: "Access denied",
            description: "This account is not an admin.",
            variant: "destructive",
          });
          return;
        }
        toast({ title: "Welcome", description: "Admin access granted." });
        onSuccess();
      }
    } catch (err: any) {
      console.error('Admin auth error:', err);
      toast({
        title: "Authentication failed",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>{isSignUp ? 'Create Account' : 'Admin Sign In'}</CardTitle>
          <CardDescription>
            {isSignUp
              ? 'Sign up to create an account. A confirmation email will be sent.'
              : 'Sign in with your admin email and password'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAuth} className="space-y-4">
            {isSignUp && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      value={formData.firstName}
                      onChange={(e) => setFormData(prev => ({...prev, firstName: e.target.value}))}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      value={formData.lastName}
                      onChange={(e) => setFormData(prev => ({...prev, lastName: e.target.value}))}
                      required
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="role">Role</Label>
                  <select
                    id="role"
                    value={formData.role}
                    onChange={(e) => setFormData(prev => ({...prev, role: e.target.value as any}))}
                    className="w-full px-3 py-2 border border-input bg-background rounded-md"
                    required
                  >
                    <option value="admin">Admin</option>
                    <option value="teacher">Teacher</option>
                    <option value="student">Student</option>
                    <option value="parent">Parent</option>
                  </select>
                </div>
                {(formData.role === 'teacher' || formData.role === 'student' || formData.role === 'parent') && (
                  <div>
                    <Label htmlFor="school">School *</Label>
                    <select
                      id="school"
                      value={formData.schoolId}
                      onChange={(e) => setFormData(prev => ({...prev, schoolId: e.target.value}))}
                      className="w-full px-3 py-2 border border-input bg-background rounded-md z-50 relative"
                      required
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
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (isSignUp ? 'Creating...' : 'Signing in...') : (isSignUp ? 'Create Account' : 'Access Admin Panel')}
            </Button>
            <button
              type="button"
              onClick={() => setIsSignUp((v) => !v)}
              className="w-full text-sm underline mt-2"
            >
              {isSignUp ? 'Have an account? Sign in' : "First time? Create account"}
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
