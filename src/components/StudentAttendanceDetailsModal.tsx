import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { User, Calendar, TrendingUp, Clock, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface Student {
  id: string;
  name: string;
}

interface AttendanceRecord {
  date: string;
  status: string;
  notes?: string;
}

interface AttendanceStats {
  totalDays: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  attendanceRate: number;
}

interface StudentAttendanceDetailsModalProps {
  selectedClassId?: string;
}

export function StudentAttendanceDetailsModal({ selectedClassId }: StudentAttendanceDetailsModalProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState("");
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [stats, setStats] = useState<AttendanceStats | null>(null);
  const [className, setClassName] = useState<string>("");

  useEffect(() => {
    if (open) {
      fetchClassName();
      fetchStudents();
      // Refetch attendance data when modal reopens
      if (selectedStudent) {
        fetchStudentAttendance();
      }
    }
  }, [open, selectedClassId]);

  const fetchClassName = async () => {
    if (!selectedClassId || selectedClassId === "all") {
      setClassName("");
      return;
    }

    try {
      const { data, error } = await supabase
        .from("class_sections")
        .select("name, grade_level")
        .eq("id", selectedClassId)
        .single();

      if (error) throw error;
      setClassName(data ? `${data.grade_level} - ${data.name}` : "");
    } catch (error) {
      console.error("Error fetching class name:", error);
      setClassName("");
    }
  };

  useEffect(() => {
    if (selectedStudent) {
      fetchStudentAttendance();
    }
  }, [selectedStudent]);

  const fetchStudents = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get class sections the teacher is assigned to
      const { data: assignments } = await supabase
        .from("teaching_assignments")
        .select("class_section_id")
        .eq("teacher_user_id", user.id);

      if (!assignments?.length) return;

      let classSectionIds = assignments.map(a => a.class_section_id);

      // Filter by selected class if specified
      if (selectedClassId && selectedClassId !== "all") {
        classSectionIds = classSectionIds.filter(id => id === selectedClassId);
      }

      if (classSectionIds.length === 0) {
        setStudents([]);
        return;
      }

      // Get students enrolled in the filtered classes
      const { data: enrollments, error } = await supabase
        .from("enrollments")
        .select(`
          student_user_id,
          profiles!enrollments_student_user_id_fkey(first_name, last_name)
        `)
        .in("class_section_id", classSectionIds);

      if (error) throw error;

      // Remove duplicates and format
      const uniqueStudents = new Map<string, Student>();
      enrollments?.forEach(enrollment => {
        if (enrollment.profiles && !uniqueStudents.has(enrollment.student_user_id)) {
          uniqueStudents.set(enrollment.student_user_id, {
            id: enrollment.student_user_id,
            name: `${enrollment.profiles.first_name || ''} ${enrollment.profiles.last_name || ''}`.trim()
          });
        }
      });

      setStudents(Array.from(uniqueStudents.values()).sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error) {
      console.error("Error fetching students:", error);
    }
  };

  const fetchStudentAttendance = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get the teacher's subject assignment for this class
      let teacherSubjectId = null;
      if (selectedClassId && selectedClassId !== "all") {
        const { data: assignment } = await supabase
          .from("teaching_assignments")
          .select("subject_id")
          .eq("teacher_user_id", user.id)
          .eq("class_section_id", selectedClassId)
          .single();
        
        teacherSubjectId = assignment?.subject_id;
      }

      // Fetch attendance records for the student (last 90 days)
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const startDate = format(ninetyDaysAgo, 'yyyy-MM-dd');

      // Build query - filter by student, date, class, subject, and teacher
      let query = supabase
        .from("enhanced_attendance")
        .select("date, status, notes, class_section_id, subject_id")
        .eq("student_user_id", selectedStudent)
        .eq("taken_by", user.id) // Only show attendance records this teacher created
        .gte("date", startDate);

      // Filter by selected class if specified
      if (selectedClassId && selectedClassId !== "all") {
        query = query.eq("class_section_id", selectedClassId);
        
        // Also filter by teacher's subject in this class
        if (teacherSubjectId) {
          query = query.eq("subject_id", teacherSubjectId);
        }
      }

      const { data: attendanceData, error } = await query.order("date", { ascending: false });

      if (error) throw error;

      setAttendanceRecords(attendanceData || []);

      // Calculate stats
      const present = attendanceData?.filter(a => a.status === "present").length || 0;
      const absent = attendanceData?.filter(a => a.status === "absent").length || 0;
      const late = attendanceData?.filter(a => a.status === "late").length || 0;
      const excused = attendanceData?.filter(a => a.status === "excused").length || 0;
      const total = attendanceData?.length || 0;

      // Calculate attendance rate: Present + Late + Excused count as attending
      const attending = present + late + excused;
      
      setStats({
        totalDays: total,
        present,
        absent,
        late,
        excused,
        attendanceRate: total > 0 ? (attending / total) * 100 : 0
      });

    } catch (error) {
      console.error("Error fetching student attendance:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { variant: "default" | "destructive" | "secondary" | "outline", className?: string }> = {
      present: { variant: "outline", className: "bg-green-500 text-white border-green-500" },
      absent: { variant: "destructive" },
      late: { variant: "outline", className: "bg-yellow-500 text-black border-yellow-500" },
      excused: { variant: "outline" }
    };
    
    const config = statusConfig[status] || { variant: "outline" };
    
    return (
      <Badge variant={config.variant} className={`capitalize ${config.className || ""}`}>
        {status}
      </Badge>
    );
  };

  // Parse date string as local date to avoid timezone issues
  const parseLocalDate = (dateString: string) => {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  // Prepare chart data (last 30 days)
  const chartData = attendanceRecords
    .slice(0, 30)
    .reverse()
    .map(record => ({
      date: format(parseLocalDate(record.date), "MMM dd"),
      value: record.status === "present" ? 1 : 0
    }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-slate-600 text-white hover:bg-slate-700 text-xs h-auto py-2.5 px-3">
          <User className="w-4 h-4 mr-1.5 flex-shrink-0" />
          <span className="whitespace-normal leading-tight">Student Attendance Details</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            <div className="flex flex-col">
              <span>Student Attendance History</span>
              {className && (
                <span className="text-sm font-normal text-muted-foreground">
                  Class: {className}
                </span>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Student Selector with Refresh Button */}
          <div className="flex gap-2">
            <div className="flex-1 space-y-2">
              <label className="text-sm font-medium">Select Student</label>
              <Select value={selectedStudent} onValueChange={setSelectedStudent}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a student" />
                </SelectTrigger>
                <SelectContent>
                  {students.map((student) => (
                    <SelectItem key={student.id} value={student.id}>
                      {student.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedStudent && (
              <div className="flex items-end">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={fetchStudentAttendance}
                  disabled={loading}
                  title="Refresh attendance data"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            )}
          </div>

          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading attendance data...</div>
          ) : !selectedStudent ? (
            <div className="text-center py-8 text-muted-foreground">Select a student to view their attendance history</div>
          ) : stats ? (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-5 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" />
                      Attendance Rate
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-500">{stats.attendanceRate.toFixed(1)}%</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      Total Days
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.totalDays}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Present</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-500">{stats.present}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Absent</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-500">{stats.absent}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Late/Excused
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-orange-500">{stats.late + stats.excused}</div>
                  </CardContent>
                </Card>
              </div>

              {/* Attendance Trend Chart */}
              {chartData.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Attendance Pattern (Last 30 Days)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" style={{ fontSize: '12px' }} />
                        <YAxis domain={[0, 1]} ticks={[0, 1]} style={{ fontSize: '12px' }} />
                        <Tooltip 
                          formatter={(value: number) => value === 1 ? "Present" : "Absent"}
                        />
                        <Line type="stepAfter" dataKey="value" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Detailed Records Table */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Detailed Attendance Records (Last 90 Days)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-[400px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Day</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Notes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {attendanceRecords.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground">
                              No attendance records found
                            </TableCell>
                          </TableRow>
                        ) : (
                          attendanceRecords.map((record, index) => (
                            <TableRow key={index}>
                              <TableCell className="font-medium">
                                {format(parseLocalDate(record.date), "MMM dd, yyyy")}
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {format(parseLocalDate(record.date), "EEEE")}
                              </TableCell>
                              <TableCell>{getStatusBadge(record.status)}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {record.notes || "-"}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">No attendance data available</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
