import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface CreateStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  selectedSchoolId?: string | null;
}

export const CreateStudentModal = ({ isOpen, onClose, onSuccess, selectedSchoolId }: CreateStudentModalProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [schools, setSchools] = useState<any[]>([]);
  const [schoolsLoading, setSchoolsLoading] = useState(false);

  const [formData, setFormData] = useState({
    firstName: "",
    middleName: "",
    lastName: "",
    schoolId: selectedSchoolId || "",
    gradeLevel: "",
    studentNo: "",
    tempPassword: "",
  });

  // Fetch schools when modal opens if no school is selected
  useState(() => {
    if (isOpen && !selectedSchoolId) {
      fetchSchools();
    }
  });

  const fetchSchools = async () => {
    setSchoolsLoading(true);
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
      toast({
        title: "Error",
        description: "Failed to load schools.",
        variant: "destructive",
      });
    } finally {
      setSchoolsLoading(false);
    }
  };

  const generateUsername = (firstName: string, middleName: string, lastName: string) => {
    // Generate username: first letter of first name + middle initial + last name (lowercase, no spaces)
    const firstInitial = firstName.charAt(0).toLowerCase();
    const middleInitial = middleName ? middleName.charAt(0).toLowerCase() : '';
    const lastNameFormatted = lastName.toLowerCase().replace(/\s+/g, '');
    
    return firstInitial + middleInitial + lastNameFormatted;
  };

  const generateTempPassword = () => {
    // Generate a simple temporary password (could be improved with more complexity)
    return Math.random().toString(36).slice(-8);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.firstName || !formData.lastName || !formData.schoolId) {
      toast({
        title: "Error",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    
    try {
      // Generate username and temp password
      const username = generateUsername(formData.firstName, formData.middleName, formData.lastName);
      const tempPassword = generateTempPassword();

      // Call edge function to create student with temp credentials
      const { data, error } = await supabase.functions.invoke('create-student-with-temp-creds', {
        body: {
          firstName: formData.firstName,
          middleName: formData.middleName || null,
          lastName: formData.lastName,
          schoolId: formData.schoolId,
          gradeLevel: formData.gradeLevel,
          studentNo: formData.studentNo || null,
          username: username,
          tempPassword: tempPassword
        }
      });

      if (error) throw error;

      toast({
        title: "Student Created Successfully",
        description: `Username: ${username}\nTemporary Password: ${tempPassword}\nStudent can now login and complete their setup.`,
      });

      // Reset form
      setFormData({
        firstName: "",
        middleName: "",
        lastName: "",
        schoolId: selectedSchoolId || "",
        gradeLevel: "",
        studentNo: "",
        tempPassword: "",
      });

      onSuccess();
      onClose();
      
    } catch (error: any) {
      console.error('Error creating student:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create student.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] bg-slate-800 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle>Create New Student</DialogTitle>
          <DialogDescription className="text-slate-300">
            Enter student information to create an account with temporary credentials.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName" className="text-slate-200">First Name *</Label>
              <Input
                id="firstName"
                value={formData.firstName}
                onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                className="bg-slate-700 border-slate-600 text-white"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName" className="text-slate-200">Last Name *</Label>
              <Input
                id="lastName"
                value={formData.lastName}
                onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                className="bg-slate-700 border-slate-600 text-white"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="middleName" className="text-slate-200">Middle Name (Optional)</Label>
            <Input
              id="middleName"
              value={formData.middleName}
              onChange={(e) => setFormData(prev => ({ ...prev, middleName: e.target.value }))}
              className="bg-slate-700 border-slate-600 text-white"
            />
          </div>

          {!selectedSchoolId && (
            <div className="space-y-2">
              <Label htmlFor="school" className="text-slate-200">School *</Label>
              <Select value={formData.schoolId} onValueChange={(value) => setFormData(prev => ({ ...prev, schoolId: value }))}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                  <SelectValue placeholder={schoolsLoading ? "Loading schools..." : "Select a school"} />
                </SelectTrigger>
                <SelectContent className="bg-slate-700 border-slate-600">
                  {schools.map((school) => (
                    <SelectItem key={school.id} value={school.id} className="text-white hover:bg-slate-600">
                      {school.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="gradeLevel" className="text-slate-200">Grade Level</Label>
              <Input
                id="gradeLevel"
                value={formData.gradeLevel}
                onChange={(e) => setFormData(prev => ({ ...prev, gradeLevel: e.target.value }))}
                className="bg-slate-700 border-slate-600 text-white"
                placeholder="e.g., Grade 10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="studentNo" className="text-slate-200">Student Number</Label>
              <Input
                id="studentNo"
                value={formData.studentNo}
                onChange={(e) => setFormData(prev => ({ ...prev, studentNo: e.target.value }))}
                className="bg-slate-700 border-slate-600 text-white"
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="border-slate-600 text-slate-200 hover:bg-slate-700">
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white">
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Student
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};