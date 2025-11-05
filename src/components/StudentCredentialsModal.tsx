import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface StudentCredentialsModalProps {
  isOpen: boolean;
  onClose: () => void;
  credentials: {
    firstName: string;
    lastName: string;
    username: string;
    tempPassword: string;
    parentCode?: string;
  } | null;
}

export const StudentCredentialsModal = ({ isOpen, onClose, credentials }: StudentCredentialsModalProps) => {
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(true);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: `${label} copied to clipboard`,
    });
  };

  if (!credentials) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Student Account Created</DialogTitle>
          <DialogDescription>
            Save these credentials - the student will need them for first login
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg bg-muted p-4 space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">Student Name</p>
              <p className="font-semibold">{credentials.firstName} {credentials.lastName}</p>
            </div>

            <div className="pt-2 border-t">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm text-muted-foreground">Username</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(credentials.username, "Username")}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="font-mono font-bold text-lg">{credentials.username}</p>
            </div>

            <div className="pt-2 border-t">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm text-muted-foreground">Temporary Password</p>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(credentials.tempPassword, "Password")}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <p className="font-mono font-bold text-lg">
                {showPassword ? credentials.tempPassword : "••••"}
              </p>
            </div>

            {credentials.parentCode && (
              <div className="pt-2 border-t">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm text-muted-foreground">Parent Verification Code</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(credentials.parentCode!, "Parent Code")}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="font-mono font-bold text-lg">{credentials.parentCode}</p>
              </div>
            )}
          </div>

          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
            <p className="text-sm text-blue-400">
              📝 The student will use these credentials for their first login, then they'll be prompted to create their own password.
            </p>
          </div>

          <Button onClick={onClose} className="w-full">
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
