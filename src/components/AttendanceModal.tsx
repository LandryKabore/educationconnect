import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";
import { CheckSquare } from "lucide-react";

interface Student {
  id: string;
  name: string;
  user_id: string;
}

interface Class {
  id: string;
  name: string;
}

interface AttendanceModalProps {
  onAttendanceSubmitted: () => void;
}

export function AttendanceModal({ onAttendanceSubmitted }: AttendanceModalProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [classes, setClasses] = useState<Class[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendance, setAttendance] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      fetchClasses();
    }
  }, [open]);

  useEffect(() => {
    if (selectedClass) {
      fetchStudents();
    }
  }, [selectedClass]);

  const fetchClasses = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch classes from teaching assignments instead of the old classes table
      const { data, error } = await supabase
        .from("teaching_assignments")
        .select(`
          class_sections(
            id,
            name,
            grade_level
          ),
          subjects(
            name
          )
        `)
        .eq("teacher_user_id", user.id);

      if (error) throw error;
      
      // Format the data to match the expected Class interface
      const formattedClasses = data?.map(assignment => ({
        id: assignment.class_sections?.id || '',
        name: `${assignment.class_sections?.name} - ${assignment.subjects?.name}`
      })) || [];
      
      setClasses(formattedClasses);
    } catch (error) {
      console.error("Error fetching classes:", error);
    }
  };

  const fetchStudents = async () => {
    try {
      // First get enrollments
      const { data: enrollments, error: enrollmentsError } = await supabase
        .from("enrollments")
        .select("student_user_id")
        .eq("class_section_id", selectedClass)
        .eq("status", "active");

      if (enrollmentsError) throw enrollmentsError;

      if (enrollments && enrollments.length > 0) {
        // Get current teacher user
        const { data: { user } } = await supabase.auth.getUser();
        const studentIds = enrollments.map(e => e.student_user_id);
        
        // Use our RPC function to get student names
        const { data: studentNames, error: namesError } = await supabase
          .rpc('get_student_names_for_teacher' as any, {
            student_ids: studentIds,
            teacher_id: user?.id
          });

        console.log("Student names for attendance:", studentNames);

        if (namesError) {
          console.error("Error fetching student names:", namesError);
          // Fallback: use student IDs
          const fallbackStudents = enrollments.map(enrollment => ({
            id: enrollment.student_user_id,
            name: `Student ${enrollment.student_user_id.slice(0, 8)}`,
            user_id: enrollment.student_user_id
          }));
          setStudents(fallbackStudents);
        } else if (Array.isArray(studentNames)) {
          // Create map for quick lookup
          const nameMap = new Map();
          studentNames.forEach((item: any) => {
            nameMap.set(item.user_id, item);
          });

          const formattedStudents = enrollments.map(enrollment => {
            const nameData = nameMap.get(enrollment.student_user_id);
            const studentName = nameData 
              ? `${nameData.first_name || ''} ${nameData.last_name || ''}`.trim()
              : `Student ${enrollment.student_user_id.slice(0, 8)}`;

            return {
              id: enrollment.student_user_id,
              name: studentName || 'Unknown Student',
              user_id: enrollment.student_user_id
            };
          });

          setStudents(formattedStudents);
        }

        // Initialize attendance as present for all students
        const initialAttendance: Record<string, string> = {};
        enrollments.forEach(enrollment => {
          initialAttendance[enrollment.student_user_id] = "present";
        });
        setAttendance(initialAttendance);
      } else {
        setStudents([]);
        setAttendance({});
      }
    } catch (error) {
      console.error("Error fetching students:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Prepare attendance records for the enhanced_attendance table
      const attendanceRecords = Object.entries(attendance).map(([studentId, status]) => ({
        student_user_id: studentId,
        class_section_id: selectedClass,
        date: selectedDate,
        status,
        taken_by: user.id
      }));

      // Check if attendance already exists for this date and class
      const { data: existingAttendance } = await supabase
        .from("enhanced_attendance")
        .select("id, student_user_id")
        .eq("class_section_id", selectedClass)
        .eq("date", selectedDate);

      if (existingAttendance && existingAttendance.length > 0) {
        // Update existing attendance
        for (const record of attendanceRecords) {
          const existing = existingAttendance.find(att => att.student_user_id === record.student_user_id);
          if (existing) {
            await supabase
              .from("enhanced_attendance")
              .update({
                status: record.status,
                taken_by: record.taken_by
              })
              .eq("id", existing.id);
          } else {
            // Insert new record if student wasn't previously recorded
            await supabase
              .from("enhanced_attendance")
              .insert(record);
          }
        }

        toast({
          title: "Attendance Updated",
          description: "Attendance has been updated successfully."
        });
      } else {
        // Insert new attendance records
        const { error } = await supabase
          .from("enhanced_attendance")
          .insert(attendanceRecords);

        if (error) throw error;

        toast({
          title: "Attendance Recorded",
          description: "Attendance has been recorded successfully."
        });
      }

      setOpen(false);
      onAttendanceSubmitted();
    } catch (error) {
      console.error("Error recording attendance:", error);
      toast({
        title: "Error",
        description: "Failed to record attendance.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAttendanceChange = (studentId: string, status: string) => {
    setAttendance(prev => ({
      ...prev,
      [studentId]: status
    }));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white border-0">
          <CheckSquare className="w-4 h-4 mr-2" />
          Take Attendance
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Take Attendance</DialogTitle>
          <DialogDescription>
            Record attendance for your class.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="class">Class</Label>
              <Select value={selectedClass} onValueChange={setSelectedClass}>
                <SelectTrigger>
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id}>
                      {cls.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                required
              />
            </div>
          </div>

          {students.length > 0 && (
            <div className="space-y-2">
              <Label>Students</Label>
              <div className="space-y-3 max-h-60 overflow-y-auto border rounded-md p-3">
                {students.map((student) => (
                  <div key={student.id} className="flex items-center justify-between p-2 bg-muted/20 rounded">
                    <span className="font-medium">{student.name}</span>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`present-${student.id}`}
                          checked={attendance[student.user_id] === "present"}
                          onCheckedChange={(checked) => 
                            handleAttendanceChange(student.user_id, checked ? "present" : "absent")
                          }
                        />
                        <Label htmlFor={`present-${student.id}`} className="text-sm">Present</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`absent-${student.id}`}
                          checked={attendance[student.user_id] === "absent"}
                          onCheckedChange={(checked) => 
                            handleAttendanceChange(student.user_id, checked ? "absent" : "present")
                          }
                        />
                        <Label htmlFor={`absent-${student.id}`} className="text-sm">Absent</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`late-${student.id}`}
                          checked={attendance[student.user_id] === "late"}
                          onCheckedChange={(checked) => 
                            handleAttendanceChange(student.user_id, checked ? "late" : "present")
                          }
                        />
                        <Label htmlFor={`late-${student.id}`} className="text-sm">Late</Label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !selectedClass || students.length === 0}>
              {loading ? "Recording..." : "Record Attendance"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}