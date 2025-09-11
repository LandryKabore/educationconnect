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
  const { toast } = useToast();

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
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectUrl,
            data: { role: 'admin' }
          }
        });
        if (error) throw error;
        toast({
          title: "Confirmation sent",
          description: "Check your email to confirm and complete admin setup.",
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
          <CardTitle>{isSignUp ? 'Create Admin Account' : 'Admin Sign In'}</CardTitle>
          <CardDescription>
            {isSignUp
              ? 'Sign up to create the first admin. A confirmation email will be sent.'
              : 'Sign in with your admin email and password'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAuth} className="space-y-4">
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
              {loading ? (isSignUp ? 'Creating...' : 'Signing in...') : (isSignUp ? 'Create Admin' : 'Access Admin Panel')}
            </Button>
            <button
              type="button"
              onClick={() => setIsSignUp((v) => !v)}
              className="w-full text-sm underline mt-2"
            >
              {isSignUp ? 'Have an account? Sign in' : "First time? Create admin account"}
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}