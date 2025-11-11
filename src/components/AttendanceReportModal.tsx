import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import { BarChart3, Calendar, Users, TrendingUp } from "lucide-react";
import { format, subDays, startOfWeek, endOfWeek, eachDayOfInterval } from "date-fns";

interface Class {
  id: string;
  name: string;
}

interface AttendanceStats {
  totalDays: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  excusedCount: number;
  attendanceRate: number;
}

interface DailyAttendance {
  date: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
  total: number;
  rate: number;
}

interface StudentAttendance {
  studentName: string;
  present: number;
  absent: number;
  late: number;
  rate: number;
}

const COLORS = ['#10b981', '#ef4444', '#f59e0b', '#3b82f6'];

export function AttendanceReportModal() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [timeRange, setTimeRange] = useState<"7days" | "30days" | "thisWeek" | "thisMonth">("7days");
  const [stats, setStats] = useState<AttendanceStats | null>(null);
  const [dailyData, setDailyData] = useState<DailyAttendance[]>([]);
  const [studentData, setStudentData] = useState<StudentAttendance[]>([]);

  useEffect(() => {
    if (open) {
      fetchClasses();
    }
  }, [open]);

  useEffect(() => {
    if (selectedClass) {
      fetchAttendanceData();
    }
  }, [selectedClass, timeRange]);

  const fetchClasses = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

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

      const uniqueClasses = new Map();
      data?.forEach(assignment => {
        if (assignment.class_sections) {
          uniqueClasses.set(assignment.class_sections.id, {
            id: assignment.class_sections.id,
            name: assignment.class_sections.name
          });
        }
      });

      setClasses(Array.from(uniqueClasses.values()));
    } catch (error) {
      console.error("Error fetching classes:", error);
    }
  };

  const getDateRange = () => {
    const now = new Date();
    let startDate: Date;

    switch (timeRange) {
      case "7days":
        startDate = subDays(now, 7);
        break;
      case "30days":
        startDate = subDays(now, 30);
        break;
      case "thisWeek":
        startDate = startOfWeek(now);
        break;
      case "thisMonth":
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      default:
        startDate = subDays(now, 7);
    }

    return {
      startDate: `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`,
      endDate: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    };
  };

  const fetchAttendanceData = async () => {
    setLoading(true);
    try {
      const { startDate, endDate } = getDateRange();

      // Fetch attendance records
      const { data: attendanceData, error } = await supabase
        .from("enhanced_attendance")
        .select(`
          date,
          status,
          student_user_id,
          profiles!enhanced_attendance_student_user_id_fkey(first_name, last_name)
        `)
        .eq("class_section_id", selectedClass)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: true });

      if (error) throw error;

      // Calculate overall stats
      const presentCount = attendanceData?.filter(a => a.status === "present").length || 0;
      const absentCount = attendanceData?.filter(a => a.status === "absent").length || 0;
      const lateCount = attendanceData?.filter(a => a.status === "late").length || 0;
      const excusedCount = attendanceData?.filter(a => a.status === "excused").length || 0;
      const totalRecords = attendanceData?.length || 0;

      setStats({
        totalDays: new Set(attendanceData?.map(a => a.date)).size,
        presentCount,
        absentCount,
        lateCount,
        excusedCount,
        attendanceRate: totalRecords > 0 ? (presentCount / totalRecords) * 100 : 0
      });

      // Group by date for daily chart
      const dailyMap = new Map<string, { present: number; absent: number; late: number; excused: number; total: number }>();
      
      attendanceData?.forEach(record => {
        if (!dailyMap.has(record.date)) {
          dailyMap.set(record.date, { present: 0, absent: 0, late: 0, excused: 0, total: 0 });
        }
        const day = dailyMap.get(record.date)!;
        day.total++;
        if (record.status === "present") day.present++;
        else if (record.status === "absent") day.absent++;
        else if (record.status === "late") day.late++;
        else if (record.status === "excused") day.excused++;
      });

      const dailyChartData: DailyAttendance[] = Array.from(dailyMap.entries())
        .map(([date, counts]) => ({
          date: format(new Date(date), "MMM dd"),
          ...counts,
          rate: counts.total > 0 ? (counts.present / counts.total) * 100 : 0
        }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      setDailyData(dailyChartData);

      // Group by student for student attendance
      const studentMap = new Map<string, { present: number; absent: number; late: number; total: number }>();
      
      attendanceData?.forEach(record => {
        const studentName = record.profiles 
          ? `${record.profiles.first_name || ''} ${record.profiles.last_name || ''}`.trim()
          : 'Unknown Student';
        
        if (!studentMap.has(studentName)) {
          studentMap.set(studentName, { present: 0, absent: 0, late: 0, total: 0 });
        }
        const student = studentMap.get(studentName)!;
        student.total++;
        if (record.status === "present") student.present++;
        else if (record.status === "absent") student.absent++;
        else if (record.status === "late") student.late++;
      });

      const studentChartData: StudentAttendance[] = Array.from(studentMap.entries())
        .map(([studentName, counts]) => ({
          studentName,
          ...counts,
          rate: counts.total > 0 ? (counts.present / counts.total) * 100 : 0
        }))
        .sort((a, b) => b.rate - a.rate)
        .slice(0, 10); // Top 10 students

      setStudentData(studentChartData);

    } catch (error) {
      console.error("Error fetching attendance data:", error);
    } finally {
      setLoading(false);
    }
  };

  const pieChartData = stats ? [
    { name: "Present", value: stats.presentCount, color: COLORS[0] },
    { name: "Absent", value: stats.absentCount, color: COLORS[1] },
    { name: "Late", value: stats.lateCount, color: COLORS[2] },
    { name: "Excused", value: stats.excusedCount, color: COLORS[3] },
  ].filter(item => item.value > 0) : [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-slate-600 text-white hover:bg-slate-700">
          <BarChart3 className="w-4 h-4 mr-2" />
          Attendance Report
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Attendance Report & Analytics
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Filters */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Class</label>
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
              <label className="text-sm font-medium">Time Range</label>
              <Select value={timeRange} onValueChange={(value: any) => setTimeRange(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7days">Last 7 Days</SelectItem>
                  <SelectItem value="30days">Last 30 Days</SelectItem>
                  <SelectItem value="thisWeek">This Week</SelectItem>
                  <SelectItem value="thisMonth">This Month</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading data...</div>
          ) : !selectedClass ? (
            <div className="text-center py-8 text-muted-foreground">Select a class to view attendance report</div>
          ) : stats ? (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Overall Rate</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-500">{stats.attendanceRate.toFixed(1)}%</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Present</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-500">{stats.presentCount}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Absent</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-500">{stats.absentCount}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Late/Excused</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-orange-500">{stats.lateCount + stats.excusedCount}</div>
                  </CardContent>
                </Card>
              </div>

              {/* Charts */}
              <div className="grid grid-cols-2 gap-6">
                {/* Daily Attendance Trend */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Daily Attendance Trend</CardTitle>
                    <CardDescription>Attendance rate over time</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <LineChart data={dailyData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" style={{ fontSize: '12px' }} />
                        <YAxis style={{ fontSize: '12px' }} />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="rate" stroke="#10b981" name="Attendance Rate %" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Status Distribution */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Status Distribution</CardTitle>
                    <CardDescription>Breakdown of attendance statuses</CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-center justify-center">
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie
                          data={pieChartData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={(entry) => `${entry.name}: ${entry.value}`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {pieChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Daily Breakdown Bar Chart */}
                <Card className="col-span-2">
                  <CardHeader>
                    <CardTitle className="text-base">Daily Status Breakdown</CardTitle>
                    <CardDescription>Count of each status per day</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={dailyData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" style={{ fontSize: '12px' }} />
                        <YAxis style={{ fontSize: '12px' }} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="present" fill={COLORS[0]} name="Present" />
                        <Bar dataKey="absent" fill={COLORS[1]} name="Absent" />
                        <Bar dataKey="late" fill={COLORS[2]} name="Late" />
                        <Bar dataKey="excused" fill={COLORS[3]} name="Excused" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Student Attendance Comparison */}
                {studentData.length > 0 && (
                  <Card className="col-span-2">
                    <CardHeader>
                      <CardTitle className="text-base">Student Attendance Rates (Top 10)</CardTitle>
                      <CardDescription>Individual student attendance percentages</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={studentData} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" domain={[0, 100]} style={{ fontSize: '12px' }} />
                          <YAxis dataKey="studentName" type="category" width={120} style={{ fontSize: '12px' }} />
                          <Tooltip />
                          <Bar dataKey="rate" fill="#3b82f6" name="Attendance Rate %" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">No data available</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
