import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Shield, CheckCircle } from "lucide-react";

export default function TeacherMagicLink() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  
  const token = searchParams.get('token');

  useEffect(() => {
    if (!token) {
      toast({
        title: "Invalid Link",
        description: "This magic link is invalid or has expired.",
        variant: "destructive",
      });
      navigate('/auth');
      return;
    }

    // Verify token exists and is valid (not expired/used)
    verifyToken();
  }, [token]);

  const verifyToken = async () => {
    try {
      const { data, error } = await supabase
        .from('magic_links')
        .select('id, expires_at, used_at')
        .eq('token', token)
        .single();

      if (error || !data) {
        throw new Error('Invalid token');
      }

      if (data.used_at) {
        throw new Error('This magic link has already been used');
      }

      if (new Date(data.expires_at) < new Date()) {
        throw new Error('This magic link has expired');
      }

      setTokenValid(true);
    } catch (error: any) {
      toast({
        title: "Invalid Link",
        description: error.message || "This magic link is invalid or has expired.",
        variant: "destructive",
      });
      navigate('/auth');
    } finally {
      setVerifying(false);
    }
  };

  const handleSetPin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (pin.length < 4 || pin.length > 6) {
      toast({
        title: "Invalid PIN",
        description: "PIN must be 4-6 digits long.",
        variant: "destructive",
      });
      return;
    }

    if (pin !== confirmPin) {
      toast({
        title: "PIN Mismatch",
        description: "PINs don't match. Please try again.",
        variant: "destructive",
      });
      return;
    }

    if (!/^\d+$/.test(pin)) {
      toast({
        title: "Invalid PIN",
        description: "PIN must contain only numbers.",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase
        .rpc('verify_magic_link_and_set_pin', {
          token_value: token,
          new_pin: pin
        });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; user_id?: string };

      if (!result.success) {
        throw new Error(result.error || 'Failed to set PIN');
      }

      toast({
        title: "Success!",
        description: "Your PIN has been set successfully. You can now sign in.",
      });

      // Redirect to teacher login with success message
      navigate('/teacher-login?setup=complete');
    } catch (error: any) {
      console.error('Error setting PIN:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to set PIN. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (verifying) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Verifying magic link...</span>
        </div>
      </div>
    );
  }

  if (!tokenValid) {
    return null; // Will be redirected by useEffect
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sr-only">
        <h1>EduConnect - Set Your PIN</h1>
      </header>
      <main className="container mx-auto max-w-md px-4 py-10">
        <Card className="shadow-elevated">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Set Your PIN</CardTitle>
            <p className="text-muted-foreground">
              Create a 4-6 digit PIN for secure access to your teacher dashboard
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSetPin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pin">Create PIN (4-6 digits)</Label>
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
              
              <div className="space-y-2">
                <Label htmlFor="confirmPin">Confirm PIN</Label>
                <Input
                  id="confirmPin"
                  type="password"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                  placeholder="Confirm your PIN"
                  maxLength={6}
                  required
                />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-blue-600 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-blue-800 mb-1">Security Note</p>
                    <p className="text-blue-700">
                      Your PIN will be used for future logins along with your email. 
                      Keep it secure and don't share it with others.
                    </p>
                  </div>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Set PIN & Continue
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}