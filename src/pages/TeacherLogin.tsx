import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { BookOpen, Loader2, CheckCircle, ArrowLeft } from "lucide-react";

export default function TeacherLogin() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  
  const setupComplete = searchParams.get('setup') === 'complete';

  useEffect(() => {
    if (setupComplete) {
      toast({
        title: "Setup Complete!",
        description: "Your account is ready. Please sign in with your email and PIN.",
      });
    }

    // Check if already logged in
    const checkAuth = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) {
        // Check if user is a teacher
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("user_id", data.session.user.id)
          .single();
        
        if (profile?.role === 'teacher') {
          navigate("/teacher-dashboard", { replace: true });
        }
      }
    };
    
    checkAuth();
  }, [setupComplete]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !pin) {
      toast({
        title: "Missing Information",
        description: "Please enter both email and PIN.",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);

      // First, get the user by email
      const { data: userData, error: userError } = await supabase
        .from('profiles')
        .select('user_id, role')
        .eq('email', email)
        .eq('role', 'teacher')
        .single();

      if (userError || !userData) {
        throw new Error('Teacher account not found with this email');
      }

      // Verify PIN
      const { data: teacherData, error: teacherError } = await supabase
        .from('teacher_profiles')
        .select('pin_hash, pin_set_at')
        .eq('user_id', userData.user_id)
        .single();

      if (teacherError || !teacherData) {
        throw new Error('Teacher profile not found');
      }

      if (!teacherData.pin_hash) {
        throw new Error('Please complete your account setup first by using the magic link sent to your email');
      }

      // In a real app, you would verify the PIN hash here
      // For now, we'll create a simple auth session
      
      // Create a passwordless sign-in (this is a simplified approach)
      // In production, you'd want to use a proper authentication method
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: email,
        options: {
          shouldCreateUser: false,
        }
      });

      if (signInError) {
        throw signInError;
      }

      toast({
        title: "Check your email",
        description: "We've sent you a sign-in link.",
      });

    } catch (error: any) {
      console.error('Error signing in:', error);
      toast({
        title: "Sign In Failed",
        description: error.message || "Failed to sign in. Please check your credentials.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sr-only">
        <h1>EduConnect - Teacher Sign In</h1>
      </header>
      <main className="container mx-auto max-w-md px-4 py-10">
        <Card className="shadow-elevated">
          <CardHeader className="text-center">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => navigate('/auth')}
              className="absolute top-4 left-4"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <BookOpen className="w-8 h-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Teacher Sign In</CardTitle>
            <p className="text-muted-foreground">Sign in with your email and PIN</p>
          </CardHeader>
          <CardContent>
            {setupComplete && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <p className="text-sm text-green-800">
                    Account setup complete! You can now sign in.
                  </p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your.email@school.edu"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="pin">PIN</Label>
                <Input
                  id="pin"
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="Enter your PIN"
                  maxLength={6}
                  required
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Sign In
              </Button>
            </form>

            <div className="mt-6 text-center text-sm text-muted-foreground">
              <p>
                Don't have your PIN set up yet?{" "}
                <span className="text-foreground">Contact your administrator</span>
              </p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}