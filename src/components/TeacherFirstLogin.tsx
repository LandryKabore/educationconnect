import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Eye, EyeOff } from "lucide-react";

interface TeacherFirstLoginProps {
  teacherInfo: any;
  onComplete: () => void;
}

export function TeacherFirstLogin({ teacherInfo, onComplete }: TeacherFirstLoginProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast({
        title: "Password mismatch",
        description: "Passwords do not match",
        variant: "destructive"
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: "Password too short",
        description: "Password must be at least 6 characters",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      // Call edge function to complete teacher setup
      const { data, error } = await supabase.functions.invoke('complete-teacher-setup', {
        body: {
          email,
          password,
          teacherId: teacherInfo.user_id
        }
      });

      if (error) throw error;

      toast({
        title: "Account setup complete",
        description: "You can now sign in with your email and password",
      });

      // Sign out current session and redirect to login
      await supabase.auth.signOut();
      navigate("/auth", { replace: true });
      
    } catch (error: any) {
      console.error('Error completing setup:', error);
      toast({
        title: "Setup failed",
        description: error.message || "Failed to complete account setup",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-elevated">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Welcome to EduConnect</CardTitle>
          <p className="text-muted-foreground">
            Complete your account setup
          </p>
        </CardHeader>
        <CardContent>
          <div className="mb-6 p-4 bg-muted rounded-lg">
            <h3 className="font-medium mb-2">Your Information</h3>
            <p className="text-sm text-muted-foreground">
              <strong>Name:</strong> {teacherInfo.profile?.first_name} {teacherInfo.profile?.last_name}
            </p>
            <p className="text-sm text-muted-foreground">
              <strong>Username:</strong> {teacherInfo.teacher?.username}
            </p>
            <p className="text-sm text-muted-foreground">
              <strong>School:</strong> {teacherInfo.teacher?.schools?.name}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address *</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email address"
                required
              />
              <p className="text-xs text-muted-foreground">
                This will be your login email for future access
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">New Password *</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a secure password"
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password *</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your password"
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Setting up..." : "Complete Setup"}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <Button
              variant="ghost"
              onClick={() => {
                supabase.auth.signOut();
                navigate("/auth", { replace: true });
              }}
            >
              Sign out and return to login
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}