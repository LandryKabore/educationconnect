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
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Search, Mail, User, Phone, Calendar } from "lucide-react";

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
  isVerified?: boolean;
  tempPasswordExpires?: string;
}

interface UserListModalProps {
  isOpen: boolean;
  onClose: () => void;
  userType: 'student' | 'teacher' | 'parent' | 'all';
  title: string;
  selectedSchoolId?: string | null;
}

export function UserListModal({ isOpen, onClose, userType, title, selectedSchoolId }: UserListModalProps) {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
    }
  }, [isOpen, userType]);

  useEffect(() => {
    const filtered = users.filter(user => 
      user.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.last_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredUsers(filtered);
  }, [searchTerm, users]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      if (userType === 'student') {
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
          // Get temp credentials (pending students)
          supabase
            .from('student_temp_credentials')
            .select('*')
            .then(result => selectedSchoolId ? 
              { ...result, data: result.data?.filter(stc => stc.school_id === selectedSchoolId) } : 
              result
            )
        ]);

        const completedStudents = completedData.data?.map(item => ({
          ...item.profiles,
          isVerified: true
        })) || [];

        const pendingStudents = tempCredsData.data?.map(item => ({
          id: item.id,
          email: `${item.username}@student.local`,
          first_name: item.first_name || '',
          last_name: item.last_name || '',
          role: 'student',
          created_at: item.created_at,
          status: 'pending',
          username: item.username,
          isVerified: item.is_used || false,
          tempPasswordExpires: item.expires_at
        })) || [];

        const allStudents = [...completedStudents, ...pendingStudents];
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
      <DialogContent className="max-w-4xl max-h-[80vh] bg-slate-900 border-slate-700">
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
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-700 rounded-full flex items-center justify-center">
                          <User className="w-5 h-5 text-slate-300" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium text-white">
                              {user.first_name} {user.last_name}
                            </h3>
                            <Badge className={getRoleColor(user.role)}>
                              {user.role}
                            </Badge>
                          </div>
                           <div className="flex items-center gap-4 mt-1 text-sm text-slate-400">
                             <div className="flex items-center gap-1">
                               <Mail className="w-3 h-3" />
                               {user.email}
                             </div>
                             {user.username && (
                               <div className="flex items-center gap-1">
                                 <User className="w-3 h-3" />
                                 Username: {user.username}
                               </div>
                             )}
                             {user.phone && (
                               <div className="flex items-center gap-1">
                                 <Phone className="w-3 h-3" />
                                 {user.phone}
                               </div>
                             )}
                             <div className="flex items-center gap-1">
                               <Calendar className="w-3 h-3" />
                               {new Date(user.created_at).toLocaleDateString()}
                             </div>
                           </div>
                        </div>
                      </div>
                       <div className="flex items-center gap-2">
                         <Badge variant={user.status === 'active' ? 'default' : 'secondary'}>
                           {user.status}
                         </Badge>
                         {user.role === 'student' && user.isVerified !== undefined && (
                           <Badge variant={user.isVerified ? 'default' : 'destructive'}>
                             {user.isVerified ? 'Verified' : 'Not Verified'}
                           </Badge>
                         )}
                         <Button size="sm" variant="outline" className="border-slate-600 text-slate-200">
                           Edit
                         </Button>
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
      </DialogContent>
    </Dialog>
  );
}