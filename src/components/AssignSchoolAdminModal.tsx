import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Loader2 } from "lucide-react";

interface AssignSchoolAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface User {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
}

interface School {
  id: string;
  name: string;
}

export function AssignSchoolAdminModal({ isOpen, onClose, onSuccess }: AssignSchoolAdminModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>("");

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch all active users
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, email, first_name, last_name')
        .eq('status', 'active')
        .order('first_name');

      if (profilesError) throw profilesError;

      // Fetch user roles to filter out students, teachers, and parents
      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .eq('active', true)
        .in('role', ['student', 'teacher', 'parent']);

      if (rolesError) throw rolesError;

      // Create a Set of user IDs who are students, teachers, or parents
      const operationalRoleUserIds = new Set(rolesData?.map(r => r.user_id) || []);

      // Filter out users who have operational roles (student, teacher, parent)
      const filteredUsers = (profilesData || []).filter(
        user => !operationalRoleUserIds.has(user.user_id)
      );

      // Fetch all active schools
      const { data: schoolsData, error: schoolsError } = await supabase
        .from('schools')
        .select('id, name')
        .eq('active', true)
        .order('name');

      if (schoolsError) throw schoolsError;

      setUsers(filteredUsers);
      setSchools(schoolsData || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: "Error",
        description: "Failed to load data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedUserId || !selectedSchoolId) {
      toast({
        title: "Missing Information",
        description: "Please select both a user and a school",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Check if already assigned
      const { data: existing, error: checkError } = await supabase
        .from('user_roles')
        .select('id, active')
        .eq('user_id', selectedUserId)
        .eq('role', 'school_admin')
        .eq('school_id', selectedSchoolId)
        .maybeSingle();

      if (checkError) throw checkError;

      if (existing) {
        if (existing.active) {
          toast({
            title: "Already Assigned",
            description: "This user is already a school admin for this school",
            variant: "destructive",
          });
          setLoading(false);
          return;
        } else {
          // Reactivate existing role
          const { error: updateError } = await supabase
            .from('user_roles')
            .update({ active: true })
            .eq('id', existing.id);

          if (updateError) throw updateError;
        }
      } else {
        // Create new role assignment
        const { error: insertError } = await supabase
          .from('user_roles')
          .insert({
            user_id: selectedUserId,
            role: 'school_admin',
            school_id: selectedSchoolId,
            active: true,
          });

        if (insertError) throw insertError;
      }

      const selectedUser = users.find(u => u.user_id === selectedUserId);
      const selectedSchool = schools.find(s => s.id === selectedSchoolId);

      toast({
        title: "School Admin Assigned",
        description: `${selectedUser?.first_name} ${selectedUser?.last_name} is now a school admin for ${selectedSchool?.name}`,
      });

      onSuccess();
      handleClose();
    } catch (error: any) {
      console.error('Error assigning school admin:', error);
      toast({
        title: "Assignment Failed",
        description: error.message || "Failed to assign school admin role",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedUserId("");
    setSelectedSchoolId("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md bg-background border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            Assign School Administrator
          </DialogTitle>
          <DialogDescription>
            Grant school administrator access to a user for a specific school
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* User Selection */}
          <div className="space-y-2">
            <Label htmlFor="user">Select User</Label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger id="user">
                <SelectValue placeholder="Choose a user..." />
              </SelectTrigger>
              <SelectContent>
                {users.map((user) => (
                  <SelectItem key={user.user_id} value={user.user_id}>
                    {user.first_name} {user.last_name} ({user.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* School Selection */}
          <div className="space-y-2">
            <Label htmlFor="school">Select School</Label>
            <Select value={selectedSchoolId} onValueChange={setSelectedSchoolId}>
              <SelectTrigger id="school">
                <SelectValue placeholder="Choose a school..." />
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

          {/* Info Box */}
          <div className="bg-muted p-3 rounded-md text-sm text-muted-foreground">
            <p>School administrators can:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Manage users within their assigned school</li>
              <li>Create and manage classes, subjects, and assignments</li>
              <li>View reports and analytics for their school</li>
              <li>Cannot create or delete schools</li>
            </ul>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleAssign} disabled={loading || !selectedUserId || !selectedSchoolId}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Assign Admin Role
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
