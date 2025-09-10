import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";

const title = "Auth | EduConnect";
const description = "Sign in or create an account to access your EduConnect dashboard.";

export default function Auth() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);

  // Shared fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Signup-only fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<"parent" | "teacher" | "student">("student");

  useEffect(() => {
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

  const redirectToRole = async (userId: string) => {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("Profile fetch error", error);
    }

    const r = profile?.role ?? "student";
    if (r === "parent") navigate("/parent-dashboard", { replace: true });
    else if (r === "teacher") navigate("/teacher-dashboard", { replace: true });
    else navigate("/student-dashboard", { replace: true });
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (data.user) {
        toast({ title: "Welcome back", description: "Signed in successfully." });
        redirectToRole(data.user.id);
      }
    } catch (err: any) {
      toast({ title: "Sign in failed", description: err.message ?? "Please check your credentials.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const redirectUrl = `${window.location.origin}/`;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { first_name: firstName, last_name: lastName, role },
          emailRedirectTo: redirectUrl,
        },
      });
      if (error) throw error;
      if (data.user) {
        toast({ title: "Account created", description: "Please check your email to confirm your account." });
        // Optional immediate redirect if confirmation not required
        // redirectToRole(data.user.id);
      }
    } catch (err: any) {
      toast({ title: "Sign up failed", description: err.message ?? "Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sr-only">
        <h1>EduConnect Authentication</h1>
      </header>
      <main className="container mx-auto max-w-md px-4 py-10">
        <Card className="shadow-elevated">
          <CardHeader>
            <CardTitle>{mode === "signin" ? "Sign In" : "Create Account"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 mb-6">
              <Button variant={mode === "signin" ? "default" : "outline"} onClick={() => setMode("signin")}>
                Sign In
              </Button>
              <Button variant={mode === "signup" ? "default" : "outline"} onClick={() => setMode("signup")}>
                Sign Up
              </Button>
            </div>

            {mode === "signin" ? (
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Signing in..." : "Sign In"}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleSignUp} className="space-y-4">
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
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <select
                    id="role"
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={role}
                    onChange={(e) => setRole(e.target.value as any)}
                  >
                    <option value="student">Student</option>
                    <option value="teacher">Teacher</option>
                    <option value="parent">Parent</option>
                  </select>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Creating account..." : "Create Account"}
                </Button>
              </form>
            )}

            <div className="mt-6 text-center text-sm text-muted-foreground">
              <button
                className="underline underline-offset-4 hover:text-foreground"
                onClick={() => setMode((m) => (m === "signin" ? "signup" : "signin"))}
              >
                {mode === "signin" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
              </button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
