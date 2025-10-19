import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PhoneInput } from "@/components/ui/phone-input";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Eye, EyeOff, RefreshCw } from "lucide-react";

interface CreateTeacherModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTeacherCreated: () => void;
  selectedSchoolId?: string;
}

export function CreateTeacherModal({ isOpen, onClose, onTeacherCreated, selectedSchoolId }: CreateTeacherModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [autoGenerate, setAutoGenerate] = useState(true);
  
  // Form fields
  const [firstName, setFirstName] = useState("");
  const [middleInitial, setMiddleInitial] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [staffNo, setStaffNo] = useState("");
  const [schoolId, setSchoolId] = useState(selectedSchoolId || "");
  const [qualifications, setQualifications] = useState("");
  
  // Data
  const [schools, setSchools] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen) {
      fetchSchools();
      if (autoGenerate) {
        generateTempPassword();
      }
    }
  }, [isOpen, autoGenerate]);


  useEffect(() => {
    if (firstName && lastName) {
      const middle = middleInitial ? `.${middleInitial.toLowerCase()}` : '';
      const generatedUsername = `${firstName.toLowerCase()}${middle}.${lastName.toLowerCase()}`.replace(/[^a-z.]/g, '');
      setUsername(generatedUsername);
    }
  }, [firstName, middleInitial, lastName]);

  const fetchSchools = async () => {
    try {
      // Check if user is super admin
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: isSuperAdmin } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'super_admin')
        .eq('active', true)
        .maybeSingle();

      let query = supabase
        .from('schools')
        .select('*')
        .eq('active', true);

      // If not super admin, filter by schools this admin manages
      if (!isSuperAdmin) {
        const { data: adminSchools } = await supabase
          .from('user_roles')
          .select('school_id')
          .eq('user_id', user.id)
          .eq('role', 'school_admin')
          .eq('active', true);

        const schoolIds = adminSchools?.map(r => r.school_id).filter(Boolean) || [];
        if (schoolIds.length > 0) {
          query = query.in('id', schoolIds);
        } else {
          setSchools([]);
          return;
        }
      }

      const { data } = await query;
      if (data) setSchools(data);
    } catch (error) {
      console.error('Error fetching schools:', error);
    }
  };


  const generateTempPassword = () => {
    let result = '';
    for (let i = 0; i < 4; i++) {
      result += Math.floor(Math.random() * 10).toString();
    }
    setTempPassword(result);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName || !lastName || !username || !tempPassword || !schoolId) {
      toast({
        title: "Missing fields",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      // Call edge function to create teacher with temp credentials
      const { data, error } = await supabase.functions.invoke('create-teacher-with-temp-creds', {
        body: {
          firstName,
          middleInitial: middleInitial || null,
          lastName,
          username,
          tempPassword,
          schoolId,
          phone: phone || null,
          staffNo: staffNo || null,
          qualifications: qualifications ? qualifications.split(',').map(q => q.trim()) : []
        }
      });

      if (error) throw error;

      const actualUsername = data?.username || username;
      toast({
        title: "Teacher created successfully",
        description: `Username: ${actualUsername}, Temp Password: ${tempPassword}`,
      });

      // Reset form
      setFirstName("");
      setMiddleInitial("");
      setLastName("");
      setUsername("");
      setTempPassword("");
      setPhone("");
      setStaffNo("");
      setQualifications("");
      if (autoGenerate) generateTempPassword();
      
      onTeacherCreated();
      onClose();
    } catch (error: any) {
      console.error('Error creating teacher:', error);
      toast({
        title: "Error creating teacher",
        description: error.message || "Failed to create teacher account",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Teacher Account</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name *</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="middleInitial">Middle Initial</Label>
              <Input
                id="middleInitial"
                value={middleInitial}
                onChange={(e) => setMiddleInitial(e.target.value.charAt(0).toUpperCase())}
                maxLength={1}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name *</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="username">Username *</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Auto-generated from name"
              required
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="tempPassword">Temporary Password *</Label>
              <div className="flex items-center gap-2">
                <Label htmlFor="autoGenerate" className="text-sm">Auto-generate</Label>
                <Switch
                  id="autoGenerate"
                  checked={autoGenerate}
                  onCheckedChange={setAutoGenerate}
                />
                {autoGenerate && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={generateTempPassword}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
            <div className="relative">
              <Input
                id="tempPassword"
                type={showPassword ? "text" : "password"}
                value={tempPassword}
                onChange={(e) => setTempPassword(e.target.value)}
                disabled={autoGenerate}
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-2 top-1/2 -translate-y-1/2"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="school">School *</Label>
            <Select value={schoolId} onValueChange={setSchoolId}>
              <SelectTrigger>
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

          <div className="grid grid-cols-2 gap-4">
            <PhoneInput
              id="phone"
              value={phone}
              onChange={setPhone}
              placeholder="Optional"
            />
            <div className="space-y-2">
              <Label htmlFor="staffNo">Staff Number</Label>
              <Input
                id="staffNo"
                value={staffNo}
                onChange={(e) => setStaffNo(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="qualifications">Qualifications</Label>
            <Input
              id="qualifications"
              value={qualifications}
              onChange={(e) => setQualifications(e.target.value)}
              placeholder="Comma-separated (e.g., BSc Education, MEd Mathematics)"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create Teacher"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}