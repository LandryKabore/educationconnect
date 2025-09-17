import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Eye, EyeOff } from "lucide-react";

interface StudentFirstLoginProps {
  studentInfo: any;
  onComplete: () => void;
}

export function StudentFirstLogin({ studentInfo, onComplete }: StudentFirstLoginProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
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
      // Call edge function to complete student setup
      const { data, error } = await supabase.functions.invoke('complete-student-setup', {
        body: {
          username: studentInfo.username,
          newPassword: password
        }
      });

      if (error) throw error;

      toast({
        title: "Account setup complete",
        description: "You can now sign in with your username and password",
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
              <strong>Name:</strong> {studentInfo.first_name} {studentInfo.last_name}
            </p>
            <p className="text-sm text-muted-foreground">
              <strong>Username:</strong> {studentInfo.username}
            </p>
          </div>

          <div className="mb-6 p-4 bg-muted rounded-lg">
            <h3 className="font-medium mb-2">Login Credentials</h3>
            <div className="space-y-2">
              <div>
                <Label className="text-sm font-medium">Username</Label>
                <div className="mt-1 p-2 bg-background border rounded-md text-muted-foreground">
                  {studentInfo.username}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Use this username to sign in after setup
                </p>
              </div>
            </div>
          </div>

           <form onSubmit={handleSubmit} className="space-y-4">
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