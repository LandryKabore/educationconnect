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
  const [classSections, setClassSections] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [selectedClassSections, setSelectedClassSections] = useState<string[]>([]);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);

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
      fetchClassSectionsAndSubjects();
    } else {
      setClassSections([]);
      setSubjects([]);
      setSelectedClassSections([]);
      setSelectedSubjects([]);
    }
  }, [schoolId]);

  useEffect(() => {
    if (firstName && lastName) {
      const middle = middleInitial ? `.${middleInitial.toLowerCase()}` : '';
      const generatedUsername = `${firstName.toLowerCase()}${middle}.${lastName.toLowerCase()}`.replace(/[^a-z.]/g, '');
      setUsername(generatedUsername);
    }
  }, [firstName, middleInitial, lastName]);

  const fetchSchools = async () => {
    const { data } = await supabase.from('schools').select('*').eq('active', true);
    if (data) setSchools(data);
  };

  const fetchClassSectionsAndSubjects = async () => {
    if (!schoolId) return;
    
    const [classResponse, subjectResponse] = await Promise.all([
      supabase.from('class_sections').select('id, name, grade_level').eq('school_id', schoolId),
      supabase.from('subjects').select('id, name, code').eq('school_id', schoolId)
    ]);
    
    if (classResponse.data) setClassSections(classResponse.data);
    if (subjectResponse.data) setSubjects(subjectResponse.data);
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
          qualifications: qualifications ? qualifications.split(',').map(q => q.trim()) : [],
          classSectionIds: selectedClassSections,
          subjectIds: selectedSubjects
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
      setSelectedClassSections([]);
      setSelectedSubjects([]);
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

          {schoolId && (
            <>
              <div className="space-y-2">
                <Label>Assign Class Sections</Label>
                <div className="max-h-32 overflow-y-auto border rounded-md p-2 space-y-2">
                  {classSections.map((classSection) => (
                    <div key={classSection.id} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={`class-${classSection.id}`}
                        checked={selectedClassSections.includes(classSection.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedClassSections([...selectedClassSections, classSection.id]);
                          } else {
                            setSelectedClassSections(selectedClassSections.filter(id => id !== classSection.id));
                          }
                        }}
                        className="rounded"
                      />
                      <Label htmlFor={`class-${classSection.id}`} className="text-sm">
                        {classSection.name} ({classSection.grade_level})
                      </Label>
                    </div>
                  ))}
                  {classSections.length === 0 && (
                    <p className="text-sm text-muted-foreground">No class sections available for this school</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Assign Subjects</Label>
                <div className="max-h-32 overflow-y-auto border rounded-md p-2 space-y-2">
                  {subjects.map((subject) => (
                    <div key={subject.id} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={`subject-${subject.id}`}
                        checked={selectedSubjects.includes(subject.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedSubjects([...selectedSubjects, subject.id]);
                          } else {
                            setSelectedSubjects(selectedSubjects.filter(id => id !== subject.id));
                          }
                        }}
                        className="rounded"
                      />
                      <Label htmlFor={`subject-${subject.id}`} className="text-sm">
                        {subject.name} {subject.code && `(${subject.code})`}
                      </Label>
                    </div>
                  ))}
                  {subjects.length === 0 && (
                    <p className="text-sm text-muted-foreground">No subjects available for this school</p>
                  )}
                </div>
              </div>
            </>
          )}

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