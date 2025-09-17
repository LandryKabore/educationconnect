import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, GraduationCap, School, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface School {
  id: string;
  name: string;
}

interface ClassSection {
  id: string;
  name: string;
  grade_level: string;
}

const StudentClassSelection = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [schools, setSchools] = useState<School[]>([]);
  const [classSections, setClassSections] = useState<ClassSection[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const [selectedClassSectionId, setSelectedClassSectionId] = useState("");
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    checkUserAndFetchData();
  }, []);

  useEffect(() => {
    if (selectedSchoolId) {
      fetchClassSections(selectedSchoolId);
    } else {
      setClassSections([]);
    }
  }, [selectedSchoolId]);

  const checkUserAndFetchData = async () => {
    setLoading(true);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;

      if (!user) {
        navigate('/login');
        return;
      }

      setUser(user);

      // Check if student already has enrollments
      const { data: enrollments, error: enrollmentError } = await supabase
        .from('enrollments')
        .select('*')
        .eq('student_user_id', user.id)
        .eq('status', 'active');

      if (enrollmentError) throw enrollmentError;

      if (enrollments && enrollments.length > 0) {
        // Student already enrolled, redirect to dashboard
        navigate('/student-dashboard');
        return;
      }

      // Fetch schools
      const { data: schoolsData, error: schoolsError } = await supabase
        .from('schools')
        .select('id, name')
        .eq('active', true)
        .order('name');

      if (schoolsError) throw schoolsError;
      setSchools(schoolsData || []);

    } catch (error: any) {
      console.error('Error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to load data.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchClassSections = async (schoolId: string) => {
    try {
      const { data, error } = await supabase
        .from('class_sections')
        .select('id, name, grade_level')
        .eq('school_id', schoolId)
        .order('grade_level, name');

      if (error) throw error;
      setClassSections(data || []);
    } catch (error: any) {
      console.error('Error fetching class sections:', error);
      toast({
        title: "Error",
        description: "Failed to load class sections.",
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async () => {
    if (!selectedSchoolId || !selectedClassSectionId) {
      toast({
        title: "Error",
        description: "Please select both school and class section.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      // Get current active academic year for the school
      const { data: academicYear, error: yearError } = await supabase
        .from('academic_years')
        .select('id')
        .eq('school_id', selectedSchoolId)
        .eq('active', true)
        .single();

      if (yearError || !academicYear) {
        throw new Error('No active academic year found for this school');
      }

      // Create enrollment
      const { error: enrollmentError } = await supabase
        .from('enrollments')
        .insert({
          student_user_id: user.id,
          class_section_id: selectedClassSectionId,
          academic_year_id: academicYear.id,
          status: 'active'
        });

      if (enrollmentError) throw enrollmentError;

      // Create or update student profile
      const { error: profileError } = await supabase
        .from('student_profiles')
        .upsert({
          user_id: user.id,
          school_id: selectedSchoolId,
        });

      if (profileError) throw profileError;

      toast({
        title: "Success",
        description: "Successfully enrolled in class!",
      });

      navigate('/student-dashboard');

    } catch (error: any) {
      console.error('Error enrolling student:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to enroll in class.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="flex items-center gap-2 text-white">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="bg-slate-800/50 border-b border-slate-700/50 shadow-xl backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Button 
                variant="outline" 
                size="icon"
                onClick={() => navigate("/login")}
                className="shrink-0 border-slate-600 text-slate-200 bg-slate-800/50 hover:bg-slate-700"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold text-white">Class Selection</h1>
                <p className="text-sm text-slate-300">Choose your school and class</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Card className="bg-slate-800/50 border-slate-700 shadow-xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 p-3 bg-blue-500/10 rounded-full w-fit">
              <GraduationCap className="w-8 h-8 text-blue-400" />
            </div>
            <CardTitle className="text-2xl text-white">Welcome, Student!</CardTitle>
            <CardDescription className="text-slate-300">
              Please select your school and class to get started with your dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="school" className="text-slate-200">School *</Label>
              <Select value={selectedSchoolId} onValueChange={setSelectedSchoolId}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                  <SelectValue placeholder="Select your school">
                    <div className="flex items-center gap-2">
                      <School className="w-4 h-4" />
                      <span>{schools.find(s => s.id === selectedSchoolId)?.name || "Select your school"}</span>
                    </div>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-slate-700 border-slate-600">
                  {schools.map((school) => (
                    <SelectItem key={school.id} value={school.id} className="text-white hover:bg-slate-600">
                      <div className="flex items-center gap-2">
                        <School className="w-4 h-4" />
                        {school.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="class" className="text-slate-200">Class Section *</Label>
              <Select 
                value={selectedClassSectionId} 
                onValueChange={setSelectedClassSectionId}
                disabled={!selectedSchoolId}
              >
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                  <SelectValue placeholder={selectedSchoolId ? "Select your class" : "First select a school"}>
                    <div className="flex items-center gap-2">
                      <GraduationCap className="w-4 h-4" />
                      <span>
                        {classSections.find(c => c.id === selectedClassSectionId)?.name || 
                         (selectedSchoolId ? "Select your class" : "First select a school")}
                      </span>
                    </div>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-slate-700 border-slate-600">
                  {classSections.map((classSection) => (
                    <SelectItem key={classSection.id} value={classSection.id} className="text-white hover:bg-slate-600">
                      <div className="flex items-center gap-2">
                        <GraduationCap className="w-4 h-4" />
                        {classSection.name} ({classSection.grade_level})
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-3 pt-6">
              <Button 
                variant="outline" 
                onClick={() => navigate("/login")}
                className="flex-1 border-slate-600 text-slate-200 hover:bg-slate-700"
              >
                Back to Login
              </Button>
              <Button 
                onClick={handleSubmit}
                disabled={!selectedSchoolId || !selectedClassSectionId || submitting}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              >
                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Continue to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default StudentClassSelection;