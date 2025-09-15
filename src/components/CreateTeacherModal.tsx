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

      // Create auth user (admin creates the user)
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        email_confirm: true, // Auto-confirm email
        user_metadata: {
          first_name: firstName,
          last_name: lastName,
          role: 'teacher',
          school_id: schoolId
        }
      });

      if (authError) throw authError;

      if (authData.user) {
        // Create teacher profile
        const { error: profileError } = await supabase
          .from('teacher_profiles')
          .insert({
            user_id: authData.user.id,
            school_id: schoolId,
            staff_no: staffNo || null,
            qualifications: qualifications ? qualifications.split(',').map(q => q.trim()) : null,
            phone,
            hire_date: new Date().toISOString().split('T')[0]
          });

        if (profileError) throw profileError;

        // Get current academic year for assignments
        const { data: academicYear } = await supabase
          .from('academic_years')
          .select('id')
          .eq('school_id', schoolId)
          .eq('active', true)
          .single();

        // Create teaching assignments
        if (selectedClassSections.length > 0 && selectedSubjects.length > 0 && academicYear) {
          const assignments = [];
          for (const classSectionId of selectedClassSections) {
            for (const subjectId of selectedSubjects) {
              assignments.push({
                teacher_user_id: authData.user.id,
                class_section_id: classSectionId,
                subject_id: subjectId,
                academic_year_id: academicYear.id
              });
            }
          }

          const { error: assignmentError } = await supabase
            .from('teaching_assignments')
            .insert(assignments);

          if (assignmentError) {
            console.error('Error creating teaching assignments:', assignmentError);
            // Don't fail the entire process if assignments fail
          }
        }

        // Generate and send magic link
        try {
          const { data: tokenData, error: tokenError } = await supabase
            .rpc('generate_magic_link', { teacher_user_id: authData.user.id });

          if (tokenError) throw tokenError;

          // In a real app, you would send this via email/SMS
          // For now, we'll show it in the toast
          toast({
            title: "Teacher created successfully!",
            description: `Magic link token: ${tokenData} (In production, this would be sent via email)`,
          });
        } catch (linkError) {
          console.error('Error generating magic link:', linkError);
          toast({
            title: "Teacher created",
            description: "Teacher created successfully, but failed to generate magic link. You can create one later.",
          });
        }

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