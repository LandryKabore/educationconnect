import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Search, Mail, User, Shield, Building2, Trash2, UserPlus } from "lucide-react";
import { AssignSchoolAdminModal } from "./AssignSchoolAdminModal";

interface SchoolAdmin {
  id: string;
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  school_id: string;
  school_name: string;
  assigned_at: string;
  role: string;
}

interface SchoolAdminManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SchoolAdminManagementModal({ isOpen, onClose }: SchoolAdminManagementModalProps) {
  const { toast } = useToast();
  const [admins, setAdmins] = useState<SchoolAdmin[]>([]);
  const [filteredAdmins, setFilteredAdmins] = useState<SchoolAdmin[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [adminToRemove, setAdminToRemove] = useState<SchoolAdmin | null>(null);
  const [assignModalOpen, setAssignModalOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchSchoolAdmins();
    }
  }, [isOpen]);

  useEffect(() => {
    const filtered = admins.filter(admin => 
      admin.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      admin.last_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      admin.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      admin.school_name?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredAdmins(filtered);
  }, [searchTerm, admins]);

  const fetchSchoolAdmins = async () => {
    setLoading(true);
    try {
      // First get user_roles for school_admin
      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('id, user_id, school_id, assigned_at, role')
        .eq('role', 'school_admin')
        .eq('active', true);

      if (rolesError) throw rolesError;

      if (!rolesData || rolesData.length === 0) {
        setAdmins([]);
        setFilteredAdmins([]);
        setLoading(false);
        return;
      }

      // Get user IDs
      const userIds = rolesData.map(r => r.user_id);
      const schoolIds = [...new Set(rolesData.map(r => r.school_id).filter(Boolean))];

      // Fetch profiles
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, email, first_name, last_name')
        .in('user_id', userIds);

      if (profilesError) throw profilesError;

      // Fetch schools
      const { data: schoolsData, error: schoolsError } = await supabase
        .from('schools')
        .select('id, name')
        .in('id', schoolIds);

      if (schoolsError) throw schoolsError;

      // Combine data
      const profilesMap = new Map(profilesData?.map(p => [p.user_id, p]) || []);
      const schoolsMap = new Map(schoolsData?.map(s => [s.id, s]) || []);

      const adminsData = rolesData.map(role => {
        const profile = profilesMap.get(role.user_id);
        const school = schoolsMap.get(role.school_id!);
        
        return {
          id: role.id,
          user_id: role.user_id,
          email: profile?.email || '',
          first_name: profile?.first_name || '',
          last_name: profile?.last_name || '',
          school_id: role.school_id!,
          school_name: school?.name || '',
          assigned_at: role.assigned_at,
          role: role.role,
        };
      });

      setAdmins(adminsData);
      setFilteredAdmins(adminsData);
    } catch (error) {
      console.error('Error fetching school admins:', error);
      toast({
        title: "Error",
        description: "Failed to fetch school administrators",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveAdmin = async () => {
    if (!adminToRemove) return;

    try {
      const { error } = await supabase
        .from('user_roles')
        .update({ active: false })
        .eq('id', adminToRemove.id);

      if (error) throw error;

      toast({
        title: "Access Removed",
        description: `${adminToRemove.first_name} ${adminToRemove.last_name} is no longer a school admin for ${adminToRemove.school_name}.`,
      });

      fetchSchoolAdmins();
      setRemoveDialogOpen(false);
      setAdminToRemove(null);
    } catch (error: any) {
      console.error('Error removing admin:', error);
      toast({
        title: "Failed to Remove",
        description: error.message || "Failed to remove school admin access.",
        variant: "destructive",
      });
    }
  };

  const confirmRemove = (admin: SchoolAdmin) => {
    setAdminToRemove(admin);
    setRemoveDialogOpen(true);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-5xl max-h-[85vh] bg-background border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              School Administrator Management
            </DialogTitle>
            <DialogDescription>
              Manage school administrator roles and permissions
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Actions Bar */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, email, or school..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button onClick={() => setAssignModalOpen(true)}>
                <UserPlus className="w-4 h-4 mr-2" />
                Assign School Admin
              </Button>
            </div>

            {/* Admin List */}
            <div className="max-h-96 overflow-y-auto space-y-3">
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading administrators...</div>
              ) : filteredAdmins.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {searchTerm ? 'No administrators found matching your search' : 'No school administrators assigned yet'}
                </div>
              ) : (
                filteredAdmins.map((admin) => (
                  <Card key={admin.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4 flex-1 min-w-0">
                          <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                            <Shield className="w-6 h-6 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0 space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-medium text-lg">
                                {admin.first_name} {admin.last_name}
                              </h3>
                              <Badge variant="secondary">
                                School Admin
                              </Badge>
                            </div>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 text-sm text-muted-foreground">
                              <div className="flex items-center gap-2">
                                <Mail className="w-4 h-4 flex-shrink-0" />
                                <span className="truncate">{admin.email}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Building2 className="w-4 h-4 flex-shrink-0" />
                                <span className="truncate">{admin.school_name}</span>
                              </div>
                              <div className="flex items-center gap-2 text-xs">
                                <span>Assigned: {new Date(admin.assigned_at).toLocaleDateString()}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <Button 
                          size="sm" 
                          variant="destructive"
                          onClick={() => confirmRemove(admin)}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Remove
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>

            {/* Stats */}
            <div className="pt-4 border-t border-border flex items-center justify-between text-sm text-muted-foreground">
              <span>Total School Administrators: {filteredAdmins.length}</span>
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Remove Confirmation Dialog */}
      <AlertDialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove School Admin Access?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove school admin access for{' '}
              <span className="font-semibold">{adminToRemove?.first_name} {adminToRemove?.last_name}</span>
              {' '}at <span className="font-semibold">{adminToRemove?.school_name}</span>?
              <br /><br />
              They will no longer be able to manage this school, but their user account will remain active.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveAdmin} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove Access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Assign Admin Modal */}
      <AssignSchoolAdminModal 
        isOpen={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        onSuccess={fetchSchoolAdmins}
      />
    </>
  );
}
