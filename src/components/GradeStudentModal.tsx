import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";
import { TrendingUp, Search } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface Assignment {
  id: string;
  title: string;
  max_points: number;
  class_id?: string;
}

interface Student {
  id: string;
  name: string;
  user_id: string;
  student_no?: string;
  avatar_url?: string;
}

interface ClassSection {
  id: string;
  name: string;
  grade_level: string;
}

interface GradeStudentModalProps {
  onGradeSubmitted: () => void;
  selectedClassId?: string;
}

export function GradeStudentModal({ onGradeSubmitted, selectedClassId }: GradeStudentModalProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [classes, setClasses] = useState<ClassSection[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [formData, setFormData] = useState({
    assignment_id: "",
    student_id: "",
    points_earned: "",
    feedback: ""
  });

  useEffect(() => {
    if (open) {
      fetchClasses();
      // Use prop if provided, otherwise wait for user selection
      if (selectedClassId && selectedClassId !== "all") {
        setSelectedClass(selectedClassId);
      }
    }
  }, [open, selectedClassId]);

  useEffect(() => {
    if (selectedClass) {
      fetchAssignments();
      fetchStudents();
    }
  }, [selectedClass]);

  const fetchClasses = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("teaching_assignments")
        .select(`
          class_section_id,
          class_sections!inner(id, name, grade_level)
        `)
        .eq("teacher_user_id", user.id);

      if (error) throw error;

      const uniqueClasses = Array.from(
        new Map(
          data?.map(item => [
            item.class_sections.id,
            {
              id: item.class_sections.id,
              name: item.class_sections.name,
              grade_level: item.class_sections.grade_level
            }
          ])
        ).values()
      );

      setClasses(uniqueClasses);
    } catch (error) {
      console.error("Error fetching classes:", error);
    }
  };

  const fetchAssignments = async () => {
    if (!selectedClass) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("assignments")
        .select("id, title, max_points, class_id")
        .eq("teacher_id", user.id)
        .eq("class_id", selectedClass)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAssignments(data || []);
    } catch (error) {
      console.error("Error fetching assignments:", error);
    }
  };

  const fetchStudents = async () => {
    if (!selectedClass) return;
    
    try {
      // First get enrollments with profile data including avatar
      const { data: enrollmentsData, error: enrollmentsError } = await supabase
        .from("enrollments")
        .select(`
          student_user_id,
          profiles!enrollments_student_user_id_fkey(first_name, last_name, avatar_url)
        `)
        .eq("class_section_id", selectedClass);

      if (enrollmentsError) throw enrollmentsError;

      if (!enrollmentsData) {
        setStudents([]);
        return;
      }

      // Get student numbers separately
      const studentUserIds = enrollmentsData.map(e => e.student_user_id);
      const { data: studentProfilesData } = await supabase
        .from("student_profiles")
        .select("user_id, student_no")
        .in("user_id", studentUserIds);

      const studentNoMap = new Map(
        studentProfilesData?.map(sp => [sp.user_id, sp.student_no]) || []
      );
      
      const formattedStudents = enrollmentsData.map(enrollment => ({
        id: enrollment.student_user_id,
        name: `${enrollment.profiles?.first_name || ''} ${enrollment.profiles?.last_name || ''}`.trim(),
        user_id: enrollment.student_user_id,
        student_no: studentNoMap.get(enrollment.student_user_id),
        avatar_url: enrollment.profiles?.avatar_url
      }));

      setStudents(formattedStudents);
    } catch (error) {
      console.error("Error fetching students:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Check if grade already exists
      const { data: existingGrade } = await supabase
        .from("grades")
        .select("id")
        .eq("assignment_id", formData.assignment_id)
        .eq("student_id", formData.student_id)
        .maybeSingle();

      if (existingGrade) {
        // Update existing grade
        const { error } = await supabase
          .from("grades")
          .update({
            points_earned: parseFloat(formData.points_earned),
            feedback: formData.feedback,
            graded_at: new Date().toISOString()
          })
          .eq("id", existingGrade.id);

        if (error) throw error;

        toast({
          title: "Grade Updated",
          description: "Student grade has been updated successfully."
        });
      } else {
        // Insert new grade
        const { error } = await supabase
          .from("grades")
          .insert({
            assignment_id: formData.assignment_id,
            student_id: formData.student_id,
            points_earned: parseFloat(formData.points_earned),
            feedback: formData.feedback,
            graded_at: new Date().toISOString()
          });

        if (error) throw error;

        toast({
          title: "Grade Submitted",
          description: "Student grade has been submitted successfully."
        });
      }

      setFormData({
        assignment_id: "",
        student_id: "",
        points_earned: "",
        feedback: ""
      });
      setOpen(false);
      onGradeSubmitted();
    } catch (error) {
      console.error("Error submitting grade:", error);
      toast({
        title: "Error",
        description: "Failed to submit grade.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const selectedAssignment = assignments.find(a => a.id === formData.assignment_id);

  const filteredStudents = students.filter(student => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      student.name.toLowerCase().includes(query) ||
      student.student_no?.toLowerCase().includes(query)
    );
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white border-0">
          <TrendingUp className="w-4 h-4 mr-2" />
          Grade Student
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Grade Student</DialogTitle>
          <DialogDescription>
            Submit or update a grade for a student's assignment.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="class">Class</Label>
            <Select 
              value={selectedClass} 
              onValueChange={(value) => {
                setSelectedClass(value);
                setFormData({
                  assignment_id: "",
                  student_id: "",
                  points_earned: "",
                  feedback: ""
                });
                setSearchQuery("");
              }}
              disabled={!!selectedClassId && selectedClassId !== "all"}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select class" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((cls) => (
                  <SelectItem key={cls.id} value={cls.id}>
                    {cls.name} - Grade {cls.grade_level}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedClass && (
            <>
              <div className="space-y-2">
                <Label htmlFor="assignment">Assignment</Label>
            <Select value={formData.assignment_id} onValueChange={(value) => setFormData(prev => ({ ...prev, assignment_id: value }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select assignment" />
              </SelectTrigger>
              <SelectContent>
                {assignments.map((assignment) => (
                  <SelectItem key={assignment.id} value={assignment.id}>
                    {assignment.title} (Max: {assignment.max_points} pts)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

              <div className="space-y-2">
                <Label htmlFor="student">Student</Label>
                <Select value={formData.student_id} onValueChange={(value) => setFormData(prev => ({ ...prev, student_id: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select student" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    <div className="flex items-center gap-2 px-2 pb-2 border-b sticky top-0 bg-popover z-50">
                      <div className="relative flex-1">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                        <Input
                          placeholder="Search students..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-8 h-8 bg-background"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        />
                      </div>
                    </div>
                    <div className="max-h-[300px] overflow-y-auto">
                      {filteredStudents.length === 0 ? (
                        <div className="py-6 text-center text-sm text-muted-foreground">
                          {searchQuery ? "No students found" : "No students in this class"}
                        </div>
                    ) : (
                      filteredStudents.map((student) => (
                        <SelectItem key={student.id} value={student.user_id}>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarImage 
                                src={student.avatar_url || undefined} 
                                alt={student.name}
                              />
                              <AvatarFallback className="text-xs">
                                {student.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                              </AvatarFallback>
                            </Avatar>
                            <span>{student.name} {student.student_no ? `(${student.student_no})` : ''}</span>
                          </div>
                        </SelectItem>
                      ))
                    )}
                    </div>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="points_earned">Points Earned</Label>
                <Input
                  id="points_earned"
                  type="number"
                  value={formData.points_earned}
                  onChange={(e) => setFormData(prev => ({ ...prev, points_earned: e.target.value }))}
                  placeholder="Enter points earned"
                  min="0"
                  max={selectedAssignment?.max_points || 100}
                  step="0.5"
                  required
                />
                {selectedAssignment && (
                  <p className="text-sm text-muted-foreground">
                    Max points: {selectedAssignment.max_points}
                  </p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="feedback">Feedback (Optional)</Label>
                <Textarea
                  id="feedback"
                  value={formData.feedback}
                  onChange={(e) => setFormData(prev => ({ ...prev, feedback: e.target.value }))}
                  placeholder="Enter feedback for the student"
                  rows={3}
                />
              </div>
            </>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !selectedClass || !formData.assignment_id || !formData.student_id}>
              {loading ? "Submitting..." : "Submit Grade"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}