import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";
import { TrendingUp } from "lucide-react";

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
}

interface GradeStudentModalProps {
  onGradeSubmitted: () => void;
  selectedClassId?: string;
}

export function GradeStudentModal({ onGradeSubmitted, selectedClassId }: GradeStudentModalProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [formData, setFormData] = useState({
    assignment_id: "",
    student_id: "",
    points_earned: "",
    feedback: ""
  });

  useEffect(() => {
    if (open) {
      fetchAssignments();
      fetchStudents();
    }
  }, [open]);

  const fetchAssignments = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let query = supabase
        .from("assignments")
        .select("id, title, max_points, class_id")
        .eq("teacher_id", user.id)
        .order("created_at", { ascending: false });

      // Filter by class if a specific class is selected
      if (selectedClassId && selectedClassId !== "all") {
        query = query.eq("class_id", selectedClassId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setAssignments(data || []);
    } catch (error) {
      console.error("Error fetching assignments:", error);
    }
  };

  const fetchStudents = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get students from teacher's teaching assignments
      let query = supabase
        .from("teaching_assignments")
        .select("class_section_id")
        .eq("teacher_user_id", user.id);

      // Filter by class if a specific class is selected
      if (selectedClassId && selectedClassId !== "all") {
        query = query.eq("class_section_id", selectedClassId);
      }

      const { data: assignments } = await query;

      if (assignments && assignments.length > 0) {
        const classSectionIds = assignments.map(a => a.class_section_id);
        
        let enrollmentQuery = supabase
          .from("enrollments")
          .select(`
            student_user_id,
            profiles!enrollments_student_user_id_fkey(first_name, last_name)
          `)
          .in("class_section_id", classSectionIds);

        const { data, error } = await enrollmentQuery;

        if (error) throw error;
        
        const formattedStudents = data?.map(enrollment => ({
          id: enrollment.student_user_id,
          name: `${enrollment.profiles?.first_name || ''} ${enrollment.profiles?.last_name || ''}`.trim(),
          user_id: enrollment.student_user_id
        })) || [];

        setStudents(formattedStudents);
      }
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
              <SelectContent>
                {students.map((student) => (
                  <SelectItem key={student.id} value={student.user_id}>
                    {student.name}
                  </SelectItem>
                ))}
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

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !formData.assignment_id || !formData.student_id}>
              {loading ? "Submitting..." : "Submit Grade"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}