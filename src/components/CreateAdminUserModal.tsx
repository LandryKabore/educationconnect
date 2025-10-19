import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Shield } from "lucide-react";

interface School {
  id: string;
  name: string;
}

interface CreateAdminUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateAdminUserModal({ isOpen, onClose, onSuccess }: CreateAdminUserModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [schools, setSchools] = useState<School[]>([]);
  const [formData, setFormData] = useState({
    email: "",
    firstName: "",
    lastName: "",
    schoolId: "",
  });

  // Fetch schools when modal opens
  useState(() => {
    if (isOpen) {
      fetchSchools();
    }
  });

  const fetchSchools = async () => {
    try {
      const { data, error } = await supabase
        .from('schools')
        .select('id, name')
        .eq('active', true)
        .order('name');

      if (error) throw error;
      setSchools(data || []);
    } catch (error) {
      console.error('Error fetching schools:', error);
    }
  };

  const handleCreate = async () => {
    // Validation
    if (!formData.email || !formData.firstName || !formData.lastName || !formData.schoolId) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Call edge function to create admin user and send invitation
      const { data, error } = await supabase.functions.invoke('create-admin-user', {
        body: {
          email: formData.email,
          firstName: formData.firstName,
          lastName: formData.lastName,
          schoolId: formData.schoolId,
        },
      });

      if (error) throw error;

      toast({
        title: "Invitation Sent!",
        description: `An email has been sent to ${formData.email} with instructions to set up their account.`,
      });

      // Reset form
      setFormData({
        email: "",
        firstName: "",
        lastName: "",
        schoolId: "",
      });

      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error creating admin user:', error);
      toast({
        title: "Failed to Create Admin",
        description: error.message || "An error occurred while creating the admin user.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      email: "",
      firstName: "",
      lastName: "",
      schoolId: "",
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Create New Admin User
          </DialogTitle>
          <DialogDescription>
            Send a secure invitation email to create a school administrator account
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name *</Label>
              <Input
                id="firstName"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                placeholder="John"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name *</Label>
              <Input
                id="lastName"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                placeholder="Doe"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email Address *</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="admin@school.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="school">Assign to School *</Label>
            <Select
              value={formData.schoolId}
              onValueChange={(value) => setFormData({ ...formData, schoolId: value })}
            >
              <SelectTrigger id="school">
                <SelectValue placeholder="Select a school" />
              </SelectTrigger>
              <SelectContent>
                {schools.map((school) => (
                  <SelectItem key={school.id} value={school.id}>
                    {school.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="bg-muted p-3 rounded-lg text-sm">
            <p className="font-medium mb-1">What happens next:</p>
            <ul className="text-muted-foreground space-y-1 text-xs">
              <li>✉️ An invitation email is sent to the admin</li>
              <li>🔐 They set their own secure password</li>
              <li>✅ They gain access to manage their school</li>
              <li>🔒 You never see their password (secure!)</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sending Invitation...
              </>
            ) : (
              "Send Invitation"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
