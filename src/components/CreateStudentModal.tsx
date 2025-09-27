import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Eye, EyeOff, RefreshCw } from "lucide-react";

interface CreateStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  selectedSchoolId?: string | null;
}

export const CreateStudentModal = ({ isOpen, onClose, onSuccess, selectedSchoolId }: CreateStudentModalProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [autoGenerate, setAutoGenerate] = useState(true);
  const [schools, setSchools] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);

  // Form fields
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [schoolId, setSchoolId] = useState(selectedSchoolId || "");
  const [classId, setClassId] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [studentNo, setStudentNo] = useState("");

  useEffect(() => {
    if (isOpen) {
      fetchSchools();
      if (autoGenerate) {
        generateTempPassword();
      }
    }
  }, [isOpen, autoGenerate]);

  useEffect(() => {
    if (schoolId) {
      fetchClasses();
    } else {
      setClasses([]);
      setClassId("");
    }
  }, [schoolId]);

  useEffect(() => {
    if (firstName && lastName) {
      const middle = middleName ? middleName.charAt(0).toLowerCase() : '';
      const generatedUsername = `${firstName.charAt(0).toLowerCase()}${middle}${lastName.toLowerCase()}`.replace(/[^a-z]/g, '');
      setUsername(generatedUsername);
    }
  }, [firstName, middleName, lastName]);

  const fetchClasses = async () => {
    if (!schoolId) return;
    
    try {
      const { data, error } = await supabase
        .from('class_sections')
        .select('id, name, grade_level')
        .eq('school_id', schoolId)
        .order('grade_level, name');
      
      if (error) throw error;
      setClasses(data || []);
    } catch (error) {
      console.error('Error fetching classes:', error);
    }
  };

  const fetchSchools = async () => {
    const { data } = await supabase.from('schools').select('*').eq('active', true);
    if (data) setSchools(data);
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
    if (!firstName || !lastName || !username || !tempPassword || !schoolId || !classId) {
      toast({
        title: "Missing fields",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      // Call edge function to create student with temp credentials
      const { data, error } = await supabase.functions.invoke('create-student-with-temp-creds', {
        body: {
          firstName,
          middleName: middleName || null,
          lastName,
          username,
          tempPassword,
          schoolId,
          classId,
          gradeLevel: gradeLevel || null,
          studentNo: studentNo || null
        }
      });

      if (error) throw error;

      const parentCode = data?.parent_verification_code;
      
      toast({
        title: "Student created successfully",
        description: `Username: ${username}, Temp Password: ${tempPassword}${parentCode ? `, Parent Code: ${parentCode}` : ''}`,
        duration: 10000, // Show longer so admin can copy the codes
      });

      // Reset form
      setFirstName("");
      setMiddleName("");
      setLastName("");
      setUsername("");
      setTempPassword("");
      setClassId("");
      setGradeLevel("");
      setStudentNo("");
      if (autoGenerate) generateTempPassword();
      
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error creating student:', error);
      toast({
        title: "Error creating student",
        description: error.message || "Failed to create student account",
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
          <DialogTitle>Create Student Account</DialogTitle>
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
              <Label htmlFor="middleName">Middle Name</Label>
              <Input
                id="middleName"
                value={middleName}
                onChange={(e) => setMiddleName(e.target.value)}
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
              <SelectTrigger className="bg-slate-700 border-slate-600">
                <SelectValue placeholder="Select a school" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-600 z-50">
                {schools.map((school) => (
                  <SelectItem key={school.id} value={school.id}>
                    {school.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="classId">Class *</Label>
            <Select value={classId} onValueChange={setClassId} disabled={!schoolId || classes.length === 0}>
              <SelectTrigger className="bg-slate-700 border-slate-600">
                <SelectValue placeholder={schoolId ? "Select class" : "Select school first"} />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-600 z-50">
                {classes.map((classSection) => (
                  <SelectItem key={classSection.id} value={classSection.id}>
                    {classSection.name} ({classSection.grade_level})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="gradeLevel">Grade Level</Label>
              <Input
                id="gradeLevel"
                value={gradeLevel}
                onChange={(e) => setGradeLevel(e.target.value)}
                placeholder="e.g., Grade 10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="studentNo">Student Number</Label>
              <Input
                id="studentNo"
                value={studentNo}
                onChange={(e) => setStudentNo(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create Student"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};