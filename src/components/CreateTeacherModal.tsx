import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { UserPlus, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

interface CreateTeacherModalProps {
  onTeacherCreated: () => void;
  selectedSchoolId?: string;
}

export function CreateTeacherModal({ onTeacherCreated, selectedSchoolId }: CreateTeacherModalProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Form fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [schoolId, setSchoolId] = useState(selectedSchoolId || "");
  const [staffNo, setStaffNo] = useState("");
  const [qualifications, setQualifications] = useState("");
  
  // Data
  const [schools, setSchools] = useState<any[]>([]);
  const [classSections, setClassSections] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [selectedClassSections, setSelectedClassSections] = useState<string[]>([]);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open, selectedSchoolId]);

  // Update classes/subjects when school selection changes
  useEffect(() => {
    if (schoolId) {
      updateSchoolData(schoolId);
    }
  }, [schoolId]);

  const fetchData = async () => {
    try {
      const [schoolsRes, classSectionsRes, subjectsRes] = await Promise.all([
        supabase.from('schools').select('*').eq('active', true),
        supabase.from('class_sections').select('*'),
        supabase.from('subjects').select('*')
      ]);

      if (schoolsRes.data) setSchools(schoolsRes.data);
      if (classSectionsRes.data) {
        const filteredSections = selectedSchoolId 
          ? classSectionsRes.data.filter(cs => cs.school_id === selectedSchoolId)
          : classSectionsRes.data;
        setClassSections(filteredSections);
      }
      if (subjectsRes.data) {
        const filteredSubjects = selectedSchoolId 
          ? subjectsRes.data.filter(s => !s.school_id || s.school_id === selectedSchoolId)
          : subjectsRes.data;
        setSubjects(filteredSubjects);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: "Error",
        description: "Failed to load form data.",
        variant: "destructive",
      });
    }
  };

  const updateSchoolData = async (selectedSchool: string) => {
    try {
      const [classSectionsRes, subjectsRes] = await Promise.all([
        supabase.from('class_sections').select('*').eq('school_id', selectedSchool),
        supabase.from('subjects').select('*').or(`school_id.is.null,school_id.eq.${selectedSchool}`)
      ]);

      if (classSectionsRes.data) {
        setClassSections(classSectionsRes.data);
        setSelectedClassSections([]); // Reset selections
      }
      if (subjectsRes.data) {
        setSubjects(subjectsRes.data);
        setSelectedSubjects([]); // Reset selections
      }
    } catch (error) {
      console.error('Error updating school data:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName || !lastName || !email || !schoolId) {
      toast({
        title: "Missing fields",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);

      // Use the RPC function to create teacher
      const { data: result, error: rpcError } = await supabase.rpc('create_teacher_account', {
        teacher_email: email,
        teacher_first_name: firstName,
        teacher_last_name: lastName,
        teacher_school_id: schoolId,
        teacher_phone: phone || null,
        teacher_staff_no: staffNo || null,
        teacher_qualifications: qualifications ? qualifications.split(',').map(q => q.trim()) : null,
        class_section_ids: selectedClassSections,
        subject_ids: selectedSubjects
      });

      if (rpcError) throw rpcError;

      // Type assertion for the result since RPC returns Json type
      const typedResult = result as { success: boolean; magic_token: string; user_id: string } | null;

      if (typedResult?.success) {
        toast({
          title: "Teacher created successfully!",
          description: `Magic link token: ${typedResult.magic_token} (In production, this would be sent via email)`,
        });

        // Reset form
        setFirstName("");
        setLastName("");
        setEmail("");
        setPhone("");
        setSchoolId(selectedSchoolId || "");
        setStaffNo("");
        setQualifications("");
        setSelectedClassSections([]);
        setSelectedSubjects([]);
        
        setOpen(false);
        onTeacherCreated();
      }
    } catch (error: any) {
      console.error('Error creating teacher:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create teacher.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClassSectionChange = (classSectionId: string, checked: boolean) => {
    if (checked) {
      setSelectedClassSections(prev => [...prev, classSectionId]);
    } else {
      setSelectedClassSections(prev => prev.filter(id => id !== classSectionId));
    }
  };

  const handleSubjectChange = (subjectId: string, checked: boolean) => {
    if (checked) {
      setSelectedSubjects(prev => [...prev, subjectId]);
    } else {
      setSelectedSubjects(prev => prev.filter(id => id !== subjectId));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-green-600 hover:bg-green-700 text-white">
          <UserPlus className="w-4 h-4 mr-2" />
          Create Teacher
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Teacher</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <Label htmlFor="lastName">Last Name *</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="school">School *</Label>
              <Select value={schoolId} onValueChange={setSchoolId} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select school" />
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
            <div className="space-y-2">
              <Label htmlFor="staffNo">Staff Number</Label>
              <Input
                id="staffNo"
                value={staffNo}
                onChange={(e) => setStaffNo(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="qualifications">Qualifications (comma-separated)</Label>
            <Input
              id="qualifications"
              value={qualifications}
              onChange={(e) => setQualifications(e.target.value)}
              placeholder="Bachelor of Education, Master of Science, etc."
            />
          </div>

          {/* Class Assignments */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <Label>Assign Classes</Label>
              <div className="max-h-40 overflow-y-auto space-y-2 border rounded-md p-3">
                {classSections.map((classSection) => (
                  <div key={classSection.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`class-${classSection.id}`}
                      checked={selectedClassSections.includes(classSection.id)}
                      onCheckedChange={(checked) => 
                        handleClassSectionChange(classSection.id, checked as boolean)
                      }
                    />
                    <Label 
                      htmlFor={`class-${classSection.id}`} 
                      className="text-sm font-normal cursor-pointer"
                    >
                      {classSection.name} - {classSection.grade_level}
                    </Label>
                  </div>
                ))}
                {classSections.length === 0 && (
                  <p className="text-sm text-muted-foreground">No classes available</p>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <Label>Assign Subjects</Label>
              <div className="max-h-40 overflow-y-auto space-y-2 border rounded-md p-3">
                {subjects.map((subject) => (
                  <div key={subject.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`subject-${subject.id}`}
                      checked={selectedSubjects.includes(subject.id)}
                      onCheckedChange={(checked) => 
                        handleSubjectChange(subject.id, checked as boolean)
                      }
                    />
                    <Label 
                      htmlFor={`subject-${subject.id}`} 
                      className="text-sm font-normal cursor-pointer"
                    >
                      {subject.name} {subject.code && `(${subject.code})`}
                    </Label>
                  </div>
                ))}
                {subjects.length === 0 && (
                  <p className="text-sm text-muted-foreground">No subjects available</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Teacher
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}