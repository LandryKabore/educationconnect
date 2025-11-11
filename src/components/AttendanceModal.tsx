import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";
import { CheckSquare, Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

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
  selectedClassId?: string;
}

export function AttendanceModal({ onAttendanceSubmitted, selectedClassId }: AttendanceModalProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [classes, setClasses] = useState<Class[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedClass, setSelectedClass] = useState("");
  // Use local date instead of UTC to avoid timezone issues
  const now = new Date();
  const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const [selectedDate, setSelectedDate] = useState(localDate);
  const [attendance, setAttendance] = useState<Record<string, string>>({});
  const [attendanceDates, setAttendanceDates] = useState<Set<string>>(new Set());
  const [datePickerDate, setDatePickerDate] = useState<Date>(now);

  useEffect(() => {
    if (open) {
      fetchClasses();
    }
  }, [open]);

  // Auto-select class when selectedClassId is provided and not "all"
  useEffect(() => {
    if (open && selectedClassId && selectedClassId !== "all" && classes.length > 0) {
      // Extract the actual class section ID from the formatted class names
      const matchingClass = classes.find(cls => cls.id.includes(selectedClassId));
      if (matchingClass) {
        setSelectedClass(matchingClass.id);
      }
    }
  }, [open, selectedClassId, classes]);

  useEffect(() => {
    if (selectedClass) {
      fetchStudents();
      fetchAttendanceDates();
    }
  }, [selectedClass]);

  useEffect(() => {
    if (selectedClass && selectedDate) {
      loadExistingAttendance();
    }
  }, [selectedClass, selectedDate]);

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
      const allStudents: Student[] = [];
      const initialAttendance: Record<string, string> = {};

      // 1. Fetch enrolled students (those who completed first login)
      const { data: enrollments, error: enrollmentsError } = await supabase
        .from("enrollments")
        .select("student_user_id")
        .eq("class_section_id", selectedClass)
        .eq("status", "active");

      if (enrollmentsError) throw enrollmentsError;

      if (enrollments && enrollments.length > 0) {
        const { data: { user } } = await supabase.auth.getUser();
        const studentIds = enrollments.map(e => e.student_user_id);
        
        // Get student names using RPC function
        const { data: studentNames, error: namesError } = await supabase
          .rpc('get_student_names_for_teacher' as any, {
            student_ids: studentIds,
            teacher_id: user?.id
          });

        if (!namesError && Array.isArray(studentNames)) {
          const nameMap = new Map();
          studentNames.forEach((item: any) => {
            nameMap.set(item.user_id, item);
          });

          enrollments.forEach(enrollment => {
            const nameData = nameMap.get(enrollment.student_user_id);
            const studentName = nameData 
              ? `${nameData.first_name || ''} ${nameData.last_name || ''}`.trim()
              : `Student ${enrollment.student_user_id.slice(0, 8)}`;

            allStudents.push({
              id: enrollment.student_user_id,
              name: studentName || 'Unknown Student',
              user_id: enrollment.student_user_id
            });
            // Don't set initial attendance here - load it based on selected date
          });
        }
      }

      // 2. Fetch unverified students from temp credentials
      const { data: tempStudents, error: tempError } = await supabase
        .from("student_temp_credentials")
        .select("student_user_id, first_name, last_name, username")
        .eq("class_section_id", selectedClass);

      if (!tempError && tempStudents && tempStudents.length > 0) {
        tempStudents.forEach(tempStudent => {
          // Check if student is already in the list (enrolled)
          if (!allStudents.find(s => s.user_id === tempStudent.student_user_id)) {
            const studentName = tempStudent.first_name && tempStudent.last_name
              ? `${tempStudent.first_name} ${tempStudent.last_name}`.trim()
              : tempStudent.username || `Student ${tempStudent.student_user_id.slice(0, 8)}`;

            allStudents.push({
              id: tempStudent.student_user_id,
              name: studentName,
              user_id: tempStudent.student_user_id
            });
          }
        });
      }

      setStudents(allStudents);
    } catch (error) {
      console.error("Error fetching students:", error);
      setStudents([]);
      setAttendance({});
    }
  };

  const fetchAttendanceDates = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("enhanced_attendance")
        .select("date")
        .eq("class_section_id", selectedClass)
        .eq("taken_by", user.id);

      if (error) throw error;

      const dates = new Set(data?.map(record => record.date) || []);
      setAttendanceDates(dates);
    } catch (error) {
      console.error("Error fetching attendance dates:", error);
    }
  };

  const loadExistingAttendance = async () => {
    try {
      const { data, error } = await supabase
        .from("enhanced_attendance")
        .select("student_user_id, status")
        .eq("class_section_id", selectedClass)
        .eq("date", selectedDate);

      if (error) throw error;

      if (data && data.length > 0) {
        const existingAttendance: Record<string, string> = {};
        data.forEach(record => {
          existingAttendance[record.student_user_id] = record.status;
        });
        
        // Set existing attendance or default to present for students not in records
        const fullAttendance: Record<string, string> = {};
        students.forEach(student => {
          fullAttendance[student.user_id] = existingAttendance[student.user_id] || "present";
        });
        
        setAttendance(fullAttendance);
      } else {
        // No existing attendance, default all to present
        const defaultAttendance: Record<string, string> = {};
        students.forEach(student => {
          defaultAttendance[student.user_id] = "present";
        });
        setAttendance(defaultAttendance);
      }
    } catch (error) {
      console.error("Error loading existing attendance:", error);
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
        <Button className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white border-0 text-xs h-auto py-2.5 px-3">
          <CheckSquare className="w-4 h-4 mr-1.5 flex-shrink-0" />
          <span className="whitespace-normal leading-tight">Take Attendance</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5" />
            Take Attendance - {format(new Date(selectedDate), 'EEEE, MMMM d, yyyy')}
          </DialogTitle>
          <DialogDescription>
            Record attendance for your class on {format(new Date(selectedDate), 'MMMM d, yyyy')}.
            {attendanceDates.has(selectedDate) && (
              <span className="text-orange-400 ml-2">• Editing existing attendance</span>
            )}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {(!selectedClassId || selectedClassId === "all") ? (
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
            ) : (
              <div className="space-y-2">
                <Label htmlFor="class">Class</Label>
                <div className="flex h-9 w-full rounded-md border border-input bg-muted px-3 py-1 text-sm items-center">
                  {classes.find(cls => cls.id === selectedClass)?.name || "Loading..."}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !datePickerDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(datePickerDate, "PPP")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={datePickerDate}
                    onSelect={(date) => {
                      if (date) {
                        setDatePickerDate(date);
                        const formattedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                        setSelectedDate(formattedDate);
                      }
                    }}
                    disabled={(date) => date > new Date()}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                    modifiers={{
                      hasAttendance: (date) => {
                        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                        return attendanceDates.has(dateStr);
                      }
                    }}
                    modifiersClassNames={{
                      hasAttendance: "relative after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:rounded-full after:bg-green-500"
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {students.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Students</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const allPresent: Record<string, string> = {};
                      students.forEach(student => {
                        allPresent[student.user_id] = "present";
                      });
                      setAttendance(allPresent);
                    }}
                    className="text-xs"
                  >
                    Mark All Present
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const allAbsent: Record<string, string> = {};
                      students.forEach(student => {
                        allAbsent[student.user_id] = "absent";
                      });
                      setAttendance(allAbsent);
                    }}
                    className="text-xs"
                  >
                    Mark All Absent
                  </Button>
                </div>
              </div>
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
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`excused-${student.id}`}
                          checked={attendance[student.user_id] === "excused"}
                          onCheckedChange={(checked) => 
                            handleAttendanceChange(student.user_id, checked ? "excused" : "present")
                          }
                        />
                        <Label htmlFor={`excused-${student.id}`} className="text-sm">Excused</Label>
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