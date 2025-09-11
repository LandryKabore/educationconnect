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

      const { data, error } = await supabase
        .from("classes")
        .select("id, name")
        .eq("teacher_id", user.id);

      if (error) throw error;
      setClasses(data || []);
    } catch (error) {
      console.error("Error fetching classes:", error);
    }
  };

  const fetchStudents = async () => {
    try {
      const { data, error } = await supabase
        .from("enrollments")
        .select(`
          student_user_id,
          profiles!enrollments_student_user_id_fkey(first_name, last_name)
        `)
        .eq("class_section_id", selectedClass);

      if (error) throw error;
      
      const formattedStudents = data?.map(enrollment => ({
        id: enrollment.student_user_id,
        name: `${enrollment.profiles?.first_name || ''} ${enrollment.profiles?.last_name || ''}`.trim(),
        user_id: enrollment.student_user_id
      })) || [];

      setStudents(formattedStudents);
      
      // Initialize attendance as present for all students
      const initialAttendance: Record<string, string> = {};
      formattedStudents.forEach(student => {
        initialAttendance[student.user_id] = "present";
      });
      setAttendance(initialAttendance);
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

      // Prepare attendance records
      const attendanceRecords = Object.entries(attendance).map(([studentId, status]) => ({
        student_id: studentId,
        class_id: selectedClass,
        date: selectedDate,
        status,
        recorded_by: user.id
      }));

      // Check if attendance already exists for this date and class
      const { data: existingAttendance } = await supabase
        .from("attendance")
        .select("id, student_id")
        .eq("class_id", selectedClass)
        .eq("date", selectedDate);

      if (existingAttendance && existingAttendance.length > 0) {
        // Update existing attendance
        for (const record of attendanceRecords) {
          const existing = existingAttendance.find(att => att.student_id === record.student_id);
          if (existing) {
            await supabase
              .from("attendance")
              .update({
                status: record.status,
                recorded_by: record.recorded_by
              })
              .eq("id", existing.id);
          } else {
            // Insert new record if student wasn't previously recorded
            await supabase
              .from("attendance")
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
          .from("attendance")
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