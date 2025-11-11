import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PhoneInput } from "@/components/ui/phone-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { CalendarIcon, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { AvatarUpload } from "@/components/AvatarUpload";

interface EditTeacherModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  teacherId: string | null;
}

export function EditTeacherModal({ isOpen, onClose, onSuccess, teacherId }: EditTeacherModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [loadingTeacher, setLoadingTeacher] = useState(false);
  
  // Form fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [prefix, setPrefix] = useState("");
  const [gender, setGender] = useState("");
  const [dob, setDob] = useState<Date>();
  const [phone, setPhone] = useState("");
  const [staffNo, setStaffNo] = useState("");
  const [qualifications, setQualifications] = useState("");
  const [subjectsTaught, setSubjectsTaught] = useState("");
  const [schoolId, setSchoolId] = useState<string>("");
  const [avatarUrl, setAvatarUrl] = useState<string>("");

  useEffect(() => {
    if (isOpen && teacherId) {
      fetchTeacherData();
    }
  }, [isOpen, teacherId]);

  const fetchTeacherData = async () => {
    if (!teacherId) return;
    
    setLoadingTeacher(true);
    try {
      // Try to fetch from profiles and teacher_profiles first (verified teachers)
      const { data: profileData } = await supabase
        .from('profiles')
        .select('first_name, last_name, avatar_url')
        .eq('user_id', teacherId)
        .maybeSingle();

      const { data: teacherData } = await supabase
        .from('teacher_profiles')
        .select('*')
        .eq('user_id', teacherId)
        .maybeSingle();

      if (profileData && teacherData) {
        // Verified teacher - populate from profiles and teacher_profiles
        setFirstName(profileData.first_name || "");
        setLastName(profileData.last_name || "");
        setAvatarUrl(profileData.avatar_url || "");
        setPrefix(teacherData.prefix || "");
        setGender(teacherData.gender || "");
        setDob(teacherData.dob ? new Date(teacherData.dob) : undefined);
        setPhone(teacherData.phone || "");
        setStaffNo(teacherData.staff_no || "");
        setQualifications(teacherData.qualifications?.join(", ") || "");
        setSubjectsTaught(teacherData.subjects_taught || "");
        setSchoolId(teacherData.school_id || "");
      } else {
        // Unverified teacher - fetch from teacher_temp_credentials
        const { data: tempData, error: tempError } = await supabase
          .from('teacher_temp_credentials')
          .select('*')
          .eq('teacher_user_id', teacherId)
          .maybeSingle();

        if (tempError) throw tempError;
        if (!tempData) throw new Error("Teacher not found");

        // Populate form from temp credentials
        setFirstName(tempData.first_name || "");
        setLastName(tempData.last_name || "");
        setPrefix(tempData.prefix || "");
        setGender(tempData.gender || "");
        setDob(tempData.dob ? new Date(tempData.dob) : undefined);
        setPhone(tempData.phone || "");
        setStaffNo(tempData.staff_no || "");
        setQualifications(tempData.qualifications?.join(", ") || "");
        setSubjectsTaught(tempData.subjects_taught || "");
        setSchoolId(tempData.school_id || "");
      }
    } catch (error) {
      console.error('Error fetching teacher data:', error);
      toast({
        title: "Error",
        description: "Failed to load teacher data",
        variant: "destructive"
      });
    } finally {
      setLoadingTeacher(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherId || !firstName || !lastName || !prefix || !gender || !dob) {
      toast({
        title: "Missing fields",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      // Check if teacher is verified (has profile entry)
      const { data: profileData } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('user_id', teacherId)
        .maybeSingle();

      if (profileData) {
        // Verified teacher - update profiles and teacher_profiles
        const { error: profileError } = await supabase
          .from('profiles')
          .update({
            first_name: firstName,
            last_name: lastName,
          })
          .eq('user_id', teacherId);

        if (profileError) throw profileError;

        // Check if teacher_profiles entry exists
        const { data: existingTeacherProfile } = await supabase
          .from('teacher_profiles')
          .select('user_id')
          .eq('user_id', teacherId)
          .maybeSingle();

        if (existingTeacherProfile) {
          // Update existing teacher_profiles
          const { error: teacherError } = await supabase
            .from('teacher_profiles')
            .update({
              prefix,
              gender,
              dob: dob ? format(dob, 'yyyy-MM-dd') : null,
              phone: phone || null,
              staff_no: staffNo || null,
              qualifications: qualifications ? qualifications.split(',').map(q => q.trim()) : [],
              subjects_taught: subjectsTaught || null
            })
            .eq('user_id', teacherId);

          if (teacherError) throw teacherError;
        } else {
          // Create new teacher_profiles entry
          const { error: teacherError } = await supabase
            .from('teacher_profiles')
            .insert({
              user_id: teacherId,
              school_id: schoolId,
              prefix,
              gender,
              dob: dob ? format(dob, 'yyyy-MM-dd') : null,
              phone: phone || null,
              staff_no: staffNo || null,
              qualifications: qualifications ? qualifications.split(',').map(q => q.trim()) : [],
              subjects_taught: subjectsTaught || null
            });

          if (teacherError) throw teacherError;
        }
      } else {
        // Unverified teacher - update teacher_temp_credentials
        const { error: tempError } = await supabase
          .from('teacher_temp_credentials')
          .update({
            first_name: firstName,
            last_name: lastName,
            prefix,
            gender,
            dob: dob ? format(dob, 'yyyy-MM-dd') : null,
            phone: phone || null,
            staff_no: staffNo || null,
            qualifications: qualifications ? qualifications.split(',').map(q => q.trim()) : [],
            subjects_taught: subjectsTaught || null
          })
          .eq('teacher_user_id', teacherId);

        if (tempError) throw tempError;
      }

      toast({
        title: "Success",
        description: "Teacher profile updated successfully"
      });

      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error updating teacher:', error);
      toast({
        title: "Error updating teacher",
        description: error.message || "Failed to update teacher profile",
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
          <DialogTitle>Edit Teacher Profile</DialogTitle>
        </DialogHeader>
        
        {loadingTeacher ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {teacherId && (
              <AvatarUpload
                currentAvatarUrl={avatarUrl}
                userId={teacherId}
                userName={`${firstName} ${lastName}`}
                onAvatarUpdate={(newUrl) => setAvatarUrl(newUrl)}
              />
            )}
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="prefix">Prefix *</Label>
                <Select value={prefix} onValueChange={setPrefix} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select prefix" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Mr">Mr</SelectItem>
                    <SelectItem value="Mrs">Mrs</SelectItem>
                    <SelectItem value="Ms">Ms</SelectItem>
                    <SelectItem value="Dr">Dr</SelectItem>
                    <SelectItem value="Prof">Prof</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="gender">Gender *</Label>
                <Select value={gender} onValueChange={setGender} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
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

            <div className="space-y-2">
              <Label>Date of Birth *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !dob && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dob ? format(dob, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dob}
                    onSelect={setDob}
                    disabled={(date) =>
                      date > new Date() || date < new Date("1940-01-01")
                    }
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
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

            <div className="space-y-2">
              <Label htmlFor="subjectsTaught">Subjects Taught (Specialization)</Label>
              <Textarea
                id="subjectsTaught"
                value={subjectsTaught}
                onChange={(e) => setSubjectsTaught(e.target.value)}
                placeholder="e.g., Mathematics, Physics, Chemistry"
                className="min-h-[60px]"
              />
              <p className="text-xs text-muted-foreground">
                This will appear after the teacher's name when assigning subjects
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : "Save Changes"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
