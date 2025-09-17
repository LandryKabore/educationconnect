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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Search, Mail, User, Phone, Calendar, Copy, Eye, EyeOff, MoreVertical, Edit, Trash2 } from "lucide-react";

interface UserProfile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  phone?: string;
  created_at: string;
  status: string;
  username?: string;
  tempPassword?: string;
  isVerified?: boolean;
  tempPasswordExpires?: string;
}

interface UserListModalProps {
  isOpen: boolean;
  onClose: () => void;
  userType: 'student' | 'teacher' | 'parent' | 'all';
  title: string;
  selectedSchoolId?: string | null;
  onUserDeleted?: () => void;
}

export function UserListModal({ isOpen, onClose, userType, title, selectedSchoolId, onUserDeleted }: UserListModalProps) {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showPasswords, setShowPasswords] = useState<{[key: string]: boolean}>({});
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null);

  const togglePasswordVisibility = (userId: string) => {
    setShowPasswords(prev => ({
      ...prev,
      [userId]: !prev[userId]
    }));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Copied to clipboard",
    });
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;

    try {
      // For teachers, we need to delete from multiple places
      if (userToDelete.role === 'teacher') {
        // Delete teaching assignments
        await supabase
          .from('teaching_assignments')
          .delete()
          .eq('teacher_user_id', userToDelete.id);

        // Delete teacher profile
        await supabase
          .from('teacher_profiles')
          .delete()
          .eq('user_id', userToDelete.id);

        // Delete temporary credentials if any
        await supabase
          .from('teacher_temp_credentials')
          .delete()
          .eq('teacher_user_id', userToDelete.id);
      }

      // Delete the profile
      await supabase
        .from('profiles')
        .delete()
        .eq('user_id', userToDelete.id);

      // Delete the auth user (this might fail if we don't have service role access)
      try {
        await supabase.auth.admin.deleteUser(userToDelete.id);
      } catch (authError) {
        console.log('Could not delete auth user (admin privileges required):', authError);
      }

      toast({
        title: "User Deleted",
        description: `${userToDelete.first_name} ${userToDelete.last_name} has been deleted successfully.`,
      });

      // Refresh the user list
      fetchUsers();
      
      // Notify parent component to refresh its data
      if (onUserDeleted) {
        onUserDeleted();
      }
      
      setDeleteDialogOpen(false);
      setUserToDelete(null);

    } catch (error) {
      console.error('Error deleting user:', error);
      toast({
        title: "Error",
        description: "Failed to delete user. Please try again.",
        variant: "destructive",
      });
    }
  };

  const confirmDelete = (user: UserProfile) => {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  };

  useEffect(() => {
    if (isOpen) {
      console.log('UserListModal opened with:', { userType, selectedSchoolId });
      fetchUsers();
    }
  }, [isOpen, userType, selectedSchoolId]);

  useEffect(() => {
    const filtered = users.filter(user => 
      user.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.last_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.username?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredUsers(filtered);
  }, [searchTerm, users]);

  const fetchUsers = async () => {
    setLoading(true);
    console.log('Fetching users for:', { userType, selectedSchoolId });
    try {
      if (userType === 'student') {
        console.log('Fetching student data (both completed and temp credentials)');
        // For students, get both completed profiles and temp credentials
        const [completedData, tempCredsData] = await Promise.all([
          // Get completed student profiles
          supabase
            .from('student_profiles')
            .select('*, profiles!inner(*)')
            .then(result => selectedSchoolId ? 
              { ...result, data: result.data?.filter(sp => sp.school_id === selectedSchoolId) } : 
              result
            ),
          // Get temp credentials (pending students) - only those not yet used
          supabase
            .from('student_temp_credentials')
            .select('*')
            .eq('is_used', false)  // Only get unused temp credentials
            .then(result => selectedSchoolId ? 
              { ...result, data: result.data?.filter(stc => stc.school_id === selectedSchoolId) } : 
              result
            )
        ]);

        console.log('Completed students data:', completedData);
        console.log('Temp credentials data:', tempCredsData);
        console.log('Sample temp cred record:', tempCredsData.data?.[0]);

        const completedStudents = completedData.data?.map(item => ({
          ...item.profiles,
          isVerified: true
        })) || [];

        const pendingStudents = tempCredsData.data?.map(item => {
          const student = {
            id: item.id,
            email: `${item.username}@student.local`,
            first_name: item.first_name || '',
            last_name: item.last_name || '',
            role: 'student',
            created_at: item.created_at,
            status: 'pending',
            username: item.username,
            tempPassword: item.temp_password_plain,
            isVerified: item.is_used || false,
            tempPasswordExpires: item.expires_at
          };
          
          // Debug specific students
          if (item.first_name === 'Yasmin' || item.first_name === 'Esther') {
            console.log(`Student ${item.first_name} ${item.last_name}:`, {
              username: item.username,
              temp_password_plain: item.temp_password_plain,
              tempPassword: student.tempPassword,
              hasPassword: !!student.tempPassword
            });
          }
          
          return student;
        }) || [];

        const allStudents = [...completedStudents, ...pendingStudents];
        console.log('Found students:', { 
          completed: completedStudents.length, 
          pending: pendingStudents.length, 
          total: allStudents.length,
          pendingWithPasswords: pendingStudents.filter(s => s.tempPassword).length
        });
        setUsers(allStudents);
        setFilteredUsers(allStudents);
      } else if (selectedSchoolId && userType === 'teacher') {
        // For teachers, filter by school through their profile tables
        const { data, error } = await supabase
          .from('teacher_profiles')
          .select('*, profiles!inner(*)')
          .eq('school_id', selectedSchoolId)
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        const profilesData = data?.map(item => item.profiles) || [];
        setUsers(profilesData);
        setFilteredUsers(profilesData);
      } else {
        // Default behavior - fetch all profiles
        let query = supabase.from('profiles').select('*');
        
        if (userType !== 'all') {
          query = query.eq('role', userType);
        }
        
        const { data, error } = await query.order('created_at', { ascending: false });
        
        if (error) throw error;
        
        setUsers(data || []);
        setFilteredUsers(data || []);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        title: "Error",
        description: "Failed to fetch users",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'student': return 'bg-blue-100 text-blue-800';
      case 'teacher': return 'bg-green-100 text-green-800';
      case 'parent': return 'bg-yellow-100 text-yellow-800';
      case 'admin': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[85vh] bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <User className="w-5 h-5" />
            {title}
          </DialogTitle>
          <DialogDescription className="text-slate-300">
            Manage and view {userType === 'all' ? 'all' : userType} users in the system
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-slate-800 border-slate-600 text-white"
            />
          </div>

          {/* User List */}
          <div className="max-h-96 overflow-y-auto space-y-3">
            {loading ? (
              <div className="text-center py-8 text-slate-400">Loading users...</div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-8 text-slate-400">No users found</div>
            ) : (
              filteredUsers.map((user) => (
                <Card key={user.id} className="bg-slate-800 border-slate-700">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4 flex-1 min-w-0">
                        <div className="w-12 h-12 bg-slate-700 rounded-full flex items-center justify-center flex-shrink-0">
                          <User className="w-6 h-6 text-slate-300" />
                        </div>
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-medium text-white text-lg">
                              {user.first_name} {user.last_name}
                            </h3>
                            <Badge className={getRoleColor(user.role)}>
                              {user.role}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 text-sm text-slate-400">
                            <div className="flex items-center gap-2">
                              <Mail className="w-4 h-4 flex-shrink-0" />
                              <span className="truncate">{user.email}</span>
                            </div>
                            {user.username && (
                              <div className="flex items-center gap-2">
                                <User className="w-4 h-4 flex-shrink-0" />
                                <span>Username: {user.username}</span>
                              </div>
                            )}
                            {user.tempPassword && (
                              <div className="flex items-center gap-2 col-span-full">
                                <span className="text-sm font-medium">Password:</span>
                                <code className="bg-slate-700 px-2 py-1 rounded text-sm font-mono">
                                  {showPasswords[user.id] ? user.tempPassword : '••••'}
                                </code>
                                <button
                                  onClick={() => togglePasswordVisibility(user.id)}
                                  className="text-slate-400 hover:text-white transition-colors"
                                  title={showPasswords[user.id] ? "Hide password" : "Show password"}
                                >
                                  {showPasswords[user.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                                <button
                                  onClick={() => copyToClipboard(user.tempPassword!)}
                                  className="text-slate-400 hover:text-white transition-colors"
                                  title="Copy password"
                                >
                                  <Copy className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                            {user.phone && (
                              <div className="flex items-center gap-2">
                                <Phone className="w-4 h-4 flex-shrink-0" />
                                <span>{user.phone}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4 flex-shrink-0" />
                              <span>{new Date(user.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge variant={user.status === 'active' ? 'default' : 'secondary'}>
                          {user.status}
                        </Badge>
                        {user.role === 'student' && user.isVerified !== undefined && (
                          <Badge variant={user.isVerified ? 'default' : 'destructive'}>
                            {user.isVerified ? 'Verified' : 'Not Verified'}
                          </Badge>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="outline" className="border-slate-600 text-slate-200">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="bg-slate-800 border-slate-700">
                            <DropdownMenuItem className="text-slate-200 hover:bg-slate-700">
                              <Edit className="w-4 h-4 mr-2" />
                              Edit User
                            </DropdownMenuItem>
                            {user.role === 'teacher' && (
                              <DropdownMenuItem 
                                className="text-red-400 hover:bg-slate-700"
                                onClick={() => confirmDelete(user)}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete Teacher
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          <div className="flex justify-between items-center pt-4">
            <p className="text-sm text-slate-400">
              Showing {filteredUsers.length} of {users.length} users
            </p>
            <Button onClick={onClose} variant="outline" className="border-slate-600 text-slate-200">
              Close
            </Button>
          </div>
        </div>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent className="bg-slate-900 border-slate-700">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">Delete Teacher</AlertDialogTitle>
              <AlertDialogDescription className="text-slate-300">
                Are you sure you want to delete {userToDelete?.first_name} {userToDelete?.last_name}? 
                This will remove their profile, teaching assignments, and temporary credentials. 
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-slate-600 text-slate-200 hover:bg-slate-700">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleDeleteUser}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                Delete Teacher
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}