import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, GraduationCap, BookOpen } from "lucide-react";

interface ClassSection {
  id: string;
  name: string;
  grade_level: string;
  academic_year_id: string;
}

interface Subject {
  id: string;
  name: string;
  code: string;
}

interface AcademicYear {
  id: string;
  name: string;
  active: boolean;
}

const TeacherAssignment = () => {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [classSections, setClassSections] = useState<ClassSection[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [activeAcademicYear, setActiveAcademicYear] = useState<AcademicYear | null>(null);
  const [selectedClassSection, setSelectedClassSection] = useState<string>("");
  const [selectedSubject, setSelectedSubject] = useState<string>("");
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      // Get teacher's school
      const { data: teacherProfile } = await supabase
        .from("teacher_profiles")
        .select("school_id")
        .eq("user_id", user.id)
        .single();

      if (!teacherProfile) {
        toast({
          title: "Error",
          description: "Teacher profile not found",
          variant: "destructive"
        });
        return;
      }

      // Get active academic year
      const { data: academicYear, error: academicYearError } = await supabase
        .from("academic_years")
        .select("*")
        .eq("school_id", teacherProfile.school_id)
        .eq("active", true)
        .maybeSingle();

      if (academicYearError) {
        console.error("Academic year fetch error:", academicYearError);
        toast({
          title: "Error",
          description: "Failed to load academic year information",
          variant: "destructive"
        });
        return;
      }

      if (!academicYear) {
        toast({
          title: "No Active Academic Year",
          description: "Please contact admin to set up the academic year",
          variant: "destructive"
        });
        return;
      }

      setActiveAcademicYear(academicYear);

      // Get class sections for this school and academic year
      const { data: sections } = await supabase
        .from("class_sections")
        .select("*")
        .eq("school_id", teacherProfile.school_id)
        .eq("academic_year_id", academicYear.id);

      setClassSections(sections || []);

      // Get subjects for this school
      const { data: subjectsData } = await supabase
        .from("subjects")
        .select("*")
        .eq("school_id", teacherProfile.school_id);

      setSubjects(subjectsData || []);

    } catch (error) {
      console.error("Error fetching data:", error);
      toast({
        title: "Error",
        description: "Failed to load assignment options",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedClassSection || !selectedSubject || !activeAcademicYear) {
      toast({
        title: "Missing Selection",
        description: "Please select both a class section and subject",
        variant: "destructive"
      });
      return;
    }

    try {
      setSubmitting(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Create teaching assignment
      const { error } = await supabase
        .from("teaching_assignments")
        .insert({
          teacher_user_id: user.id,
          class_section_id: selectedClassSection,
          subject_id: selectedSubject,
          academic_year_id: activeAcademicYear.id
        });

      if (error) throw error;

      toast({
        title: "Assignment Complete",
        description: "Your teaching assignment has been set up successfully"
      });

      navigate("/teacher-dashboard", { replace: true });

    } catch (error) {
      console.error("Error creating assignment:", error);
      toast({
        title: "Assignment Failed",
        description: "Failed to create teaching assignment",
        variant: "destructive"
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Teaching Assignment</CardTitle>
          <CardDescription>
            Select your grade level and subject to complete your setup
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <GraduationCap className="h-4 w-4" />
              Class Section
            </label>
            <Select value={selectedClassSection} onValueChange={setSelectedClassSection}>
              <SelectTrigger>
                <SelectValue placeholder="Select a class section" />
              </SelectTrigger>
              <SelectContent>
                {classSections.map((section) => (
                  <SelectItem key={section.id} value={section.id}>
                    {section.name} - Grade {section.grade_level}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Subject
            </label>
            <Select value={selectedSubject} onValueChange={setSelectedSubject}>
              <SelectTrigger>
                <SelectValue placeholder="Select a subject" />
              </SelectTrigger>
              <SelectContent>
                {subjects.map((subject) => (
                  <SelectItem key={subject.id} value={subject.id}>
                    {subject.name} {subject.code && `(${subject.code})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button 
            onClick={handleSubmit} 
            disabled={submitting || !selectedClassSection || !selectedSubject}
            className="w-full"
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Complete Assignment
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default TeacherAssignment;