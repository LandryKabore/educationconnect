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
import { Search, Mail, User, Phone, Calendar, Copy, Eye, EyeOff, MoreVertical, Edit, Trash2, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { EditTeacherModal } from "@/components/EditTeacherModal";
import { TeacherProfileModal } from "@/components/TeacherProfileModal";

interface UserProfile {
  id: string;
  user_id?: string; // Add this field for auth user ID
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
  parentVerificationCode?: string;
  className?: string; // Add class name for students
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
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [deletionProgress, setDeletionProgress] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editTeacherModalOpen, setEditTeacherModalOpen] = useState(false);
  const [teacherToEdit, setTeacherToEdit] = useState<string | null>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [teacherToView, setTeacherToView] = useState<string | null>(null);

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

    // Get the correct user_id (auth user id) - use user_id if available, otherwise id
    const userId = userToDelete.user_id || userToDelete.id;
    
    console.log('=== STARTING DELETE PROCESS ===');
    console.log('User to delete:', userToDelete);
    console.log('Using user_id:', userId);
    console.log('User role:', userToDelete.role);

    setIsDeleting(true);
    
    try {
      // Call edge function to delete user with proper service role permissions
      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: { userId }
      });

      if (error) {
        console.error('Error from delete-user function:', error);
        throw new Error(error.message || 'Failed to delete user');
      }

      if (!data?.success) {
        console.error('Delete failed:', data?.error);
        throw new Error(data?.error || 'Failed to delete user');
      }

      console.log('=== DELETION COMPLETED ===');

      toast({
        title: "User Deleted",
        description: `${userToDelete.first_name} ${userToDelete.last_name} has been permanently deleted.`,
      });

      // Refresh the user list
      fetchUsers();
      
      // Notify parent component to refresh its data
      if (onUserDeleted) {
        console.log('Calling onUserDeleted callback...');
        onUserDeleted();
      }
      
      setDeleteDialogOpen(false);
      setUserToDelete(null);

    } catch (error: any) {
      console.error('=== DELETION FAILED ===');
      console.error('Error:', error);
      toast({
        title: "Deletion Failed",
        description: error.message || "Failed to delete user. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const confirmDelete = (user: UserProfile) => {
    console.log('=== DELETE CONFIRMATION ===');
    console.log('User to delete:', user);
    console.log('User ID:', user.id);
    console.log('User role:', user.role);
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  };

  const handleEditUser = (user: UserProfile) => {
    if (user.role === 'teacher' && user.user_id) {
      setTeacherToEdit(user.user_id);
      setEditTeacherModalOpen(true);
    }
  };

  const handleViewProfile = (user: UserProfile) => {
    if (user.role === 'teacher' && user.user_id) {
      setTeacherToView(user.user_id);
      setProfileModalOpen(true);
    }
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUsers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedUsers.size === filteredUsers.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(filteredUsers.map(u => u.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedUsers.size === 0) return;

    const usersToDelete = filteredUsers.filter(u => selectedUsers.has(u.id));
    console.log('=== STARTING BULK DELETE ===');
    console.log('Deleting users:', usersToDelete.length);

    setIsDeleting(true);
    setDeletionProgress(0);
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < usersToDelete.length; i++) {
      const user = usersToDelete[i];
      try {
        const userId = user.user_id || user.id;
        const { data, error } = await supabase.functions.invoke('delete-user', {
          body: { userId }
        });

        if (error || !data?.success) {
          console.error(`Failed to delete ${user.first_name} ${user.last_name}:`, error || data?.error);
          failCount++;
        } else {
          successCount++;
        }
      } catch (error) {
        console.error(`Error deleting ${user.first_name} ${user.last_name}:`, error);
        failCount++;
      }
      
      // Update progress
      const progress = Math.round(((i + 1) / usersToDelete.length) * 100);
      setDeletionProgress(progress);
    }

    console.log('=== BULK DELETE COMPLETED ===');
    console.log(`Success: ${successCount}, Failed: ${failCount}`);

    toast({
      title: successCount > 0 ? "Users Deleted" : "Deletion Failed",
      description: `Successfully deleted ${successCount} user(s). ${failCount > 0 ? `Failed to delete ${failCount} user(s).` : ''}`,
      variant: failCount > 0 ? "destructive" : "default",
    });

    setIsDeleting(false);
    setDeletionProgress(0);
    setSelectedUsers(new Set());
    setBulkDeleteDialogOpen(false);
    fetchUsers();
    
    if (onUserDeleted) {
      onUserDeleted();
    }
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
      // Security check: Verify admin access before fetching
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Access Denied",
          description: "You must be logged in to view users.",
          variant: "destructive",
        });
        return;
      }

      // Check if user is super admin
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'super_admin')
        .eq('active', true)
        .maybeSingle();

      const isSuperAdmin = !!roleData;

      // CRITICAL SECURITY: School admins MUST have a selectedSchoolId
      if (!isSuperAdmin && !selectedSchoolId) {
        console.error('SECURITY: School admin attempted to fetch users without school filter');
        toast({
          title: "Access Denied",
          description: "School selection required to view users.",
          variant: "destructive",
        });
        setUsers([]);
        setFilteredUsers([]);
        return;
      }
      
      if (userType === 'student') {
        console.log('Fetching student data (both completed and temp credentials)');
        // For students, get both completed profiles and temp credentials
        const [completedData, tempCredsData, allTempCredsData, parentLinksData, enrollmentsData, classSectionsData] = await Promise.all([
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
            ),
          // Get ALL temp credentials (including used ones) to show credentials for all students
          supabase
            .from('student_temp_credentials')
            .select('*')
            .then(result => selectedSchoolId ? 
              { ...result, data: result.data?.filter(stc => stc.school_id === selectedSchoolId) } : 
              result
            ),
          // Get parent verification codes
          supabase
            .from('parent_student_links')
            .select('student_user_id, verification_code, status')
            .eq('status', 'pending'),
          // Get enrollments for completed students
          supabase
            .from('enrollments')
            .select('student_user_id, class_section_id')
            .eq('status', 'active'),
          // Get all class sections
          supabase
            .from('class_sections')
            .select('id, name')
        ]);

        console.log('Completed students data:', completedData);
        console.log('Temp credentials data:', tempCredsData);
        console.log('All temp credentials data:', allTempCredsData);
        console.log('Parent links data:', parentLinksData);

        const parentVerificationCodes = new Map();
        parentLinksData.data?.forEach(link => {
          parentVerificationCodes.set(link.student_user_id, link.verification_code);
        });

        const enrollmentMap = new Map();
        enrollmentsData.data?.forEach(enrollment => {
          enrollmentMap.set(enrollment.student_user_id, enrollment.class_section_id);
        });

        const classNameMap = new Map();
        classSectionsData.data?.forEach(cs => {
          classNameMap.set(cs.id, cs.name);
        });

        // Create maps from all temp credentials to show credentials for all students
        const usernameMap = new Map();
        const tempPasswordMap = new Map();
        allTempCredsData.data?.forEach(cred => {
          usernameMap.set(cred.student_user_id, cred.username);
          tempPasswordMap.set(cred.student_user_id, cred.temp_password_plain);
        });

        const completedStudents = completedData.data?.map(item => {
          const classId = enrollmentMap.get(item.profiles.user_id);
          const username = usernameMap.get(item.profiles.user_id);
          const tempPassword = tempPasswordMap.get(item.profiles.user_id);
          return {
            ...item.profiles,
            isVerified: true,
            username: username, // Add username from temp credentials
            tempPassword: tempPassword, // Add temp password for all students
            parentVerificationCode: parentVerificationCodes.get(item.profiles.user_id),
            className: classId ? classNameMap.get(classId) : undefined
          };
        }) || [];

        // Only include pending students who DON'T already have a profile
        const completedStudentIds = new Set(completedStudents.map(s => s.user_id));
        const pendingStudents = tempCredsData.data?.filter(item => !completedStudentIds.has(item.student_user_id)).map(item => {
          const student = {
            id: item.id,
            user_id: item.student_user_id, // Add this for deletion
            email: `${item.username}@student.local`,
            first_name: item.first_name || '',
            last_name: item.last_name || '',
            role: 'student',
            created_at: item.created_at,
            status: 'pending',
            username: item.username,
            tempPassword: item.temp_password_plain,
            isVerified: item.is_used || false,
            tempPasswordExpires: item.expires_at,
            parentVerificationCode: parentVerificationCodes.get(item.student_user_id),
            className: item.class_section_id ? classNameMap.get(item.class_section_id) : undefined
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
        console.log('Fetching teacher data (both completed and temp credentials)');
        // For teachers, get both completed profiles and temp credentials
        const [completedData, tempCredsData] = await Promise.all([
          // Get completed teacher profiles
          supabase
            .from('teacher_profiles')
            .select('*, profiles!inner(*)')
            .eq('school_id', selectedSchoolId)
            .order('created_at', { ascending: false }),
          // Get temp credentials (pending teachers) - only those not yet used
          supabase
            .from('teacher_temp_credentials')
            .select('*')
            .eq('is_used', false)
            .eq('school_id', selectedSchoolId)
            .order('created_at', { ascending: false })
        ]);

        console.log('Completed teachers:', completedData);
        console.log('Temp teacher credentials:', tempCredsData);

        const completedTeachers = completedData.data?.map(item => ({
          ...item.profiles,
          user_id: item.profiles.user_id,
          isVerified: true
        })) || [];

        // Only include pending teachers who DON'T already have a profile
        const completedTeacherIds = new Set(completedTeachers.map(t => t.user_id));
        const pendingTeachers = tempCredsData.data?.filter(item => !completedTeacherIds.has(item.teacher_user_id)).map(item => ({
          id: item.id,
          user_id: item.teacher_user_id,
          email: `${item.username}@teacher.local`,
          first_name: item.first_name || '',
          last_name: item.last_name || '',
          role: 'teacher',
          created_at: item.created_at,
          status: 'pending',
          username: item.username,
          tempPassword: (item as any).temp_password_plain,
          isVerified: item.is_used || false,
          tempPasswordExpires: item.expires_at,
          phone: item.phone,
          prefix: item.prefix,
          gender: item.gender
        })) || [];

        const allTeachers = [...completedTeachers, ...pendingTeachers];
        console.log('Found teachers:', { 
          completed: completedTeachers.length, 
          pending: pendingTeachers.length, 
          total: allTeachers.length
        });
        setUsers(allTeachers);
        setFilteredUsers(allTeachers);
      } else if (selectedSchoolId && userType === 'parent') {
        // For parents, filter by school through their profile tables
        const { data, error } = await supabase
          .from('parent_profiles')
          .select('*, profiles!inner(*)')
          .eq('school_id', selectedSchoolId)
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        const profilesData = data?.map(item => item.profiles) || [];
        setUsers(profilesData);
        setFilteredUsers(profilesData);
      } else if (selectedSchoolId && userType === 'all') {
        // For "all users", combine data from all role-specific profile tables for the selected school
        // PLUS pending temp credentials
        const [studentsData, tempStudentsData, teachersData, tempTeachersData, parentsData] = await Promise.all([
          // Get completed students from student_profiles
          supabase
            .from('student_profiles')
            .select('*, profiles!inner(*)')
            .eq('school_id', selectedSchoolId),
          // Get pending students from temp credentials
          supabase
            .from('student_temp_credentials')
            .select('*')
            .eq('school_id', selectedSchoolId)
            .eq('is_used', false),
          // Get completed teachers from teacher_profiles
          supabase
            .from('teacher_profiles')
            .select('*, profiles!inner(*)')
            .eq('school_id', selectedSchoolId),
          // Get pending teachers from temp credentials
          supabase
            .from('teacher_temp_credentials')
            .select('*')
            .eq('school_id', selectedSchoolId)
            .eq('is_used', false),
          // Get parents from parent_profiles
          supabase
            .from('parent_profiles')
            .select('*, profiles!inner(*)')
            .eq('school_id', selectedSchoolId)
        ]);

        // Process pending students
        const pendingStudents = tempStudentsData.data?.map(item => ({
          id: item.id,
          user_id: item.student_user_id,
          email: `${item.username}@student.local`,
          first_name: item.first_name || '',
          last_name: item.last_name || '',
          role: 'student',
          created_at: item.created_at,
          status: 'pending',
          username: item.username,
          tempPassword: '••••',
          isVerified: false
        })) || [];

        // Process pending teachers
        const pendingTeachers = tempTeachersData.data?.map(item => ({
          id: item.id,
          user_id: item.teacher_user_id,
          email: `${item.username}@teacher.local`,
          first_name: item.first_name || '',
          last_name: item.last_name || '',
          role: 'teacher',
          created_at: item.created_at,
          status: 'pending',
          username: item.username,
          tempPassword: '••••',
          isVerified: false
        })) || [];

        const allUsers = [
          ...(studentsData.data?.map(item => item.profiles) || []),
          ...pendingStudents,
          ...(teachersData.data?.map(item => item.profiles) || []),
          ...pendingTeachers,
          ...(parentsData.data?.map(item => item.profiles) || [])
        ];

        console.log('All users for school:', {
          completedStudents: studentsData.data?.length || 0,
          pendingStudents: pendingStudents.length,
          completedTeachers: teachersData.data?.length || 0,
          pendingTeachers: pendingTeachers.length,
          parents: parentsData.data?.length || 0,
          total: allUsers.length
        });

        setUsers(allUsers);
        setFilteredUsers(allUsers);
      } else {
        // No school filter - should only happen for super admin viewing all users
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
          {/* Search and Bulk Actions */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-slate-800 border-slate-600 text-white"
              />
            </div>
            
            {filteredUsers.length > 0 && (
              <div className="flex items-center justify-between gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleSelectAll}
                  className="border-slate-600 text-slate-300 hover:bg-slate-700"
                >
                  {selectedUsers.size === filteredUsers.length ? 'Deselect All' : 'Select All'}
                </Button>
                
                {selectedUsers.size > 0 && (
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-400">
                      {selectedUsers.size} selected
                    </span>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setBulkDeleteDialogOpen(true)}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Selected
                    </Button>
                  </div>
                )}
              </div>
            )}
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
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <input
                          type="checkbox"
                          checked={selectedUsers.has(user.id)}
                          onChange={() => toggleUserSelection(user.id)}
                          className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
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
                            {user.className && (
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">
                                  {user.className}
                                </Badge>
                              </div>
                            )}
                            {user.username && (
                              <div className="flex items-center gap-2">
                                <User className="w-4 h-4 flex-shrink-0" />
                                <span>Username: {user.username}</span>
                              </div>
                            )}
                            {user.parentVerificationCode && (
                              <div className="flex items-center gap-2 col-span-full">
                                <span className="text-sm font-medium">Parent Code:</span>
                                <code className="bg-slate-700 px-2 py-1 rounded text-sm font-mono">
                                  {user.parentVerificationCode}
                                </code>
                                <button
                                  onClick={() => copyToClipboard(user.parentVerificationCode!)}
                                  className="text-slate-400 hover:text-white transition-colors"
                                  title="Copy parent code"
                                >
                                  <Copy className="w-4 h-4" />
                                </button>
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
                            {user.role === 'teacher' && user.user_id && (
                              <DropdownMenuItem 
                                className="text-slate-200 hover:bg-slate-700"
                                onClick={() => handleViewProfile(user)}
                              >
                                <User className="w-4 h-4 mr-2" />
                                View Profile
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem 
                              className="text-slate-200 hover:bg-slate-700"
                              onClick={() => handleEditUser(user)}
                              disabled={user.role !== 'teacher' || !user.user_id}
                            >
                              <Edit className="w-4 h-4 mr-2" />
                              Edit User
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-red-400 hover:bg-slate-700"
                              onClick={() => confirmDelete(user)}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete User
                            </DropdownMenuItem>
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
        <AlertDialog open={deleteDialogOpen} onOpenChange={(open) => !isDeleting && setDeleteDialogOpen(open)}>
          <AlertDialogContent className="bg-slate-900 border-slate-700">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">
                Delete {userToDelete?.role === 'teacher' ? 'Teacher' : userToDelete?.role === 'student' ? 'Student' : userToDelete?.role === 'parent' ? 'Parent' : 'User'}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-slate-300">
                Are you sure you want to delete {userToDelete?.first_name} {userToDelete?.last_name}? 
                This will permanently remove all their data from the system.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel 
                disabled={isDeleting}
                className="border-slate-600 text-slate-200 hover:bg-slate-700 disabled:opacity-50"
              >
                Cancel
              </AlertDialogCancel>
              <Button
                onClick={(e) => {
                  e.preventDefault();
                  handleDeleteUser();
                }}
                disabled={isDeleting}
                className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  `Delete ${userToDelete?.role === 'teacher' ? 'Teacher' : userToDelete?.role === 'student' ? 'Student' : userToDelete?.role === 'parent' ? 'Parent' : 'User'}`
                )}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Bulk Delete Confirmation Dialog */}
        <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={(open) => !isDeleting && setBulkDeleteDialogOpen(open)}>
          <AlertDialogContent className="bg-slate-900 border-slate-700">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-red-500" />
                Delete {selectedUsers.size} User(s)?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-slate-300">
                {isDeleting ? (
                  <div className="space-y-3">
                    <p>Deleting users, please wait...</p>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span>Progress</span>
                        <span className="font-medium">{deletionProgress}%</span>
                      </div>
                      <Progress value={deletionProgress} className="h-2" />
                    </div>
                  </div>
                ) : (
                  `This action cannot be undone. This will permanently delete ${selectedUsers.size} user(s) and all their associated data from the system.`
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel 
                disabled={isDeleting}
                className="bg-slate-800 text-white border-slate-600 hover:bg-slate-700 disabled:opacity-50"
              >
                Cancel
              </AlertDialogCancel>
              <Button
                onClick={(e) => {
                  e.preventDefault();
                  handleBulkDelete();
                }}
                disabled={isDeleting}
                className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  `Delete ${selectedUsers.size} User(s)`
                )}
              </Button>
            </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Edit Teacher Modal */}
          <EditTeacherModal
            isOpen={editTeacherModalOpen}
            onClose={() => {
              setEditTeacherModalOpen(false);
              setTeacherToEdit(null);
            }}
            onSuccess={() => {
              fetchUsers();
              if (onUserDeleted) {
                onUserDeleted();
              }
            }}
            teacherId={teacherToEdit}
          />

          {/* Teacher Profile Modal */}
          {teacherToView && (
            <TeacherProfileModal
              isOpen={profileModalOpen}
              onClose={() => {
                setProfileModalOpen(false);
                setTeacherToView(null);
              }}
              teacherId={teacherToView}
            />
          )}
        </DialogContent>
      </Dialog>
    );
  }