import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, TrendingDown, Bell, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, subDays } from "date-fns";

interface Class {
  id: string;
  name: string;
  subject_id: string;
  subject_name: string;
}

interface AtRiskStudent {
  studentId: string;
  studentName: string;
  attendanceRate: number;
  totalDays: number;
  presentDays: number;
  absentDays: number;
  trend: "declining" | "stable" | "improving";
  recentRate: number;
  overallRate: number;
  riskLevel: "critical" | "high" | "moderate";
  lastAbsentDate?: string;
}

export function AttendanceRiskAnalysisModal() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [atRiskStudents, setAtRiskStudents] = useState<AtRiskStudent[]>([]);
  const [sendingAlerts, setSendingAlerts] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetchClasses();
    }
  }, [open]);

  useEffect(() => {
    if (selectedClass && selectedSubjectId) {
      analyzeAttendanceRisk();
    }
  }, [selectedClass, selectedSubjectId]);

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
            id,
            name
          )
        `)
        .eq("teacher_user_id", user.id);

      if (error) throw error;

      // Format classes with subject information
      const formattedClasses = data?.map(assignment => ({
        id: assignment.class_sections?.id || '',
        name: `${assignment.class_sections?.name} - ${assignment.subjects?.name}`,
        subject_id: (assignment.subjects as any)?.id || '',
        subject_name: assignment.subjects?.name || ''
      })) || [];

      setClasses(formattedClasses);
    } catch (error) {
      console.error("Error fetching classes:", error);
    }
  };

  const analyzeAttendanceRisk = async () => {
    setLoading(true);
    try {
      // Get attendance data for last 90 days
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const startDate = `${ninetyDaysAgo.getFullYear()}-${String(ninetyDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(ninetyDaysAgo.getDate()).padStart(2, '0')}`;

      // Get last 30 days for trend analysis
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const recentStartDate = `${thirtyDaysAgo.getFullYear()}-${String(thirtyDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(thirtyDaysAgo.getDate()).padStart(2, '0')}`;

      const now = new Date();
      const endDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      // Fetch all attendance records for this specific subject
      const { data: attendanceData, error: attendanceError } = await supabase
        .from("enhanced_attendance")
        .select(`
          date,
          status,
          student_user_id,
          profiles!enhanced_attendance_student_user_id_fkey(first_name, last_name)
        `)
        .eq("class_section_id", selectedClass)
        .eq("subject_id", selectedSubjectId)
        .gte("date", startDate)
        .lte("date", endDate);

      if (attendanceError) throw attendanceError;

      // Analyze each student
      const studentMap = new Map<string, {
        name: string;
        totalDays: number;
        presentDays: number;
        absentDays: number;
        recentTotalDays: number;
        recentPresentDays: number;
        lastAbsentDate?: string;
      }>();

      attendanceData?.forEach(record => {
        const studentName = record.profiles 
          ? `${record.profiles.first_name || ''} ${record.profiles.last_name || ''}`.trim()
          : 'Unknown Student';
        
        if (!studentMap.has(record.student_user_id)) {
          studentMap.set(record.student_user_id, {
            name: studentName,
            totalDays: 0,
            presentDays: 0,
            absentDays: 0,
            recentTotalDays: 0,
            recentPresentDays: 0
          });
        }

        const student = studentMap.get(record.student_user_id)!;
        student.totalDays++;
        
        // Present, Late, and Excused count as attending (not absent)
        if (record.status === "present" || record.status === "late" || record.status === "excused") {
          student.presentDays++;
        } else if (record.status === "absent") {
          student.absentDays++;
          if (!student.lastAbsentDate || record.date > student.lastAbsentDate) {
            student.lastAbsentDate = record.date;
          }
        }

        // Track recent attendance for trend analysis
        if (record.date >= recentStartDate) {
          student.recentTotalDays++;
          if (record.status === "present" || record.status === "late" || record.status === "excused") {
            student.recentPresentDays++;
          }
        }
      });

      // Identify at-risk students (attendance rate < 60%)
      const atRisk: AtRiskStudent[] = [];
      
      studentMap.forEach((stats, studentId) => {
        const overallRate = stats.totalDays > 0 ? (stats.presentDays / stats.totalDays) * 100 : 0;
        const recentRate = stats.recentTotalDays > 0 ? (stats.recentPresentDays / stats.recentTotalDays) * 100 : 0;

        // Only include students with attendance rate below 60%
        if (overallRate < 60) {
          // Determine trend
          let trend: "declining" | "stable" | "improving" = "stable";
          if (stats.recentTotalDays >= 5) { // Need at least 5 recent days to establish trend
            const rateDiff = recentRate - overallRate;
            if (rateDiff < -10) {
              trend = "declining";
            } else if (rateDiff > 10) {
              trend = "improving";
            }
          }

          // Determine risk level
          let riskLevel: "critical" | "high" | "moderate" = "moderate";
          if (overallRate < 40 || (trend === "declining" && recentRate < 50)) {
            riskLevel = "critical";
          } else if (overallRate < 50 || trend === "declining") {
            riskLevel = "high";
          }

          atRisk.push({
            studentId,
            studentName: stats.name,
            attendanceRate: overallRate,
            totalDays: stats.totalDays,
            presentDays: stats.presentDays,
            absentDays: stats.absentDays,
            trend,
            recentRate,
            overallRate,
            riskLevel,
            lastAbsentDate: stats.lastAbsentDate
          });
        }
      });

      // Sort by risk level and attendance rate
      atRisk.sort((a, b) => {
        const riskOrder = { critical: 0, high: 1, moderate: 2 };
        if (riskOrder[a.riskLevel] !== riskOrder[b.riskLevel]) {
          return riskOrder[a.riskLevel] - riskOrder[b.riskLevel];
        }
        return a.attendanceRate - b.attendanceRate;
      });

      setAtRiskStudents(atRisk);

    } catch (error) {
      console.error("Error analyzing attendance risk:", error);
      toast({
        title: "Analysis failed",
        description: "Could not analyze attendance patterns.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const sendAlerts = async () => {
    if (atRiskStudents.length === 0) return;

    setSendingAlerts(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const selectedClassName = classes.find(c => c.id === selectedClass)?.name || "your class";

      // Send alerts for each at-risk student
      for (const student of atRiskStudents) {
        // Get parents for this student
        const { data: parentLinks } = await supabase
          .from("parent_student_links")
          .select("parent_user_id")
          .eq("student_user_id", student.studentId)
          .eq("status", "active");

        // Send message to each parent
        if (parentLinks && parentLinks.length > 0) {
          for (const link of parentLinks) {
            await supabase
              .from("messages")
              .insert({
                sender_user_id: user.id,
                recipient_user_id: link.parent_user_id,
                subject: `⚠️ Attendance Alert: ${student.studentName}`,
                body: `Dear Parent/Guardian,\n\nThis is an automated attendance alert for ${student.studentName} in ${selectedClassName}.\n\n📊 Attendance Summary (Last 90 Days):\n- Overall Attendance Rate: ${student.attendanceRate.toFixed(1)}%\n- Total Days: ${student.totalDays}\n- Days Present: ${student.presentDays}\n- Days Absent: ${student.absentDays}\n- Recent Trend: ${student.trend === "declining" ? "📉 Declining" : student.trend === "improving" ? "📈 Improving" : "➡️ Stable"}\n- Risk Level: ${student.riskLevel.toUpperCase()}\n\n${student.lastAbsentDate ? `Last Absent: ${format(new Date(student.lastAbsentDate), "MMM dd, yyyy")}\n\n` : ''}This attendance rate is below the recommended threshold of 60%. Regular attendance is crucial for academic success. Please contact us to discuss how we can support ${student.studentName.split(' ')[0]}'s attendance.\n\nBest regards,\nYour Teaching Team`
              });
          }
        }
      }

      // Also send a summary to school admins
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser?.user_metadata?.school_id) {
        const { data: adminRoles } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("school_id", currentUser.user_metadata.school_id)
          .in("role", ["super_admin", "school_admin"])
          .eq("active", true);

        if (adminRoles && adminRoles.length > 0) {
          for (const admin of adminRoles) {
            await supabase
              .from("messages")
              .insert({
                sender_user_id: user.id,
                recipient_user_id: admin.user_id,
                subject: `📊 Attendance Risk Report: ${selectedClassName}`,
                body: `Attendance Risk Analysis Report\n\nClass: ${selectedClassName}\nDate: ${format(new Date(), "MMM dd, yyyy")}\n\n${atRiskStudents.length} student${atRiskStudents.length !== 1 ? 's' : ''} identified as at-risk:\n\n${atRiskStudents.map((s, i) => `${i + 1}. ${s.studentName} - ${s.attendanceRate.toFixed(1)}% (${s.riskLevel.toUpperCase()} Risk, ${s.trend})`).join('\n')}\n\nParent alerts have been sent automatically.`
              });
          }
        }
      }

      toast({
        title: "Alerts sent successfully",
        description: `Notifications sent to parents and administrators for ${atRiskStudents.length} at-risk student${atRiskStudents.length !== 1 ? 's' : ''}.`
      });

    } catch (error) {
      console.error("Error sending alerts:", error);
      toast({
        title: "Failed to send alerts",
        description: "Could not send all notifications.",
        variant: "destructive"
      });
    } finally {
      setSendingAlerts(false);
    }
  };

  const getRiskBadge = (level: "critical" | "high" | "moderate") => {
    const variants = {
      critical: "destructive",
      high: "destructive",
      moderate: "secondary"
    } as const;
    
    return (
      <Badge variant={variants[level]} className="capitalize">
        {level === "critical" && "🔴 "}
        {level === "high" && "🟠 "}
        {level === "moderate" && "🟡 "}
        {level}
      </Badge>
    );
  };

  const getTrendIcon = (trend: "declining" | "stable" | "improving") => {
    if (trend === "declining") return <TrendingDown className="w-4 h-4 text-red-500" />;
    if (trend === "improving") return <TrendingDown className="w-4 h-4 text-green-500 rotate-180" />;
    return <span className="text-muted-foreground">→</span>;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-slate-600 text-white hover:bg-slate-700 text-xs h-auto py-2.5 px-3">
          <AlertTriangle className="w-4 h-4 mr-1.5 flex-shrink-0" />
          <span className="whitespace-normal leading-tight">Attendance Risk Analysis</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            At-Risk Students Analysis
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Class Selector */}
          <div className="flex items-end justify-between gap-4">
            <div className="space-y-2 flex-1">
              <label className="text-sm font-medium">Select Class</label>
              <Select 
                value={selectedClass} 
                onValueChange={(value) => {
                  setSelectedClass(value);
                  const selectedClassData = classes.find(c => c.id === value);
                  if (selectedClassData) {
                    setSelectedSubjectId(selectedClassData.subject_id);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a class and subject" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((cls) => (
                    <SelectItem key={`${cls.id}-${cls.subject_id}`} value={cls.id}>
                      {cls.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedClass && atRiskStudents.length > 0 && (
              <Button 
                onClick={sendAlerts} 
                disabled={sendingAlerts}
                className="bg-orange-600 hover:bg-orange-700"
              >
                <Send className="w-4 h-4 mr-2" />
                {sendingAlerts ? "Sending..." : "Send Alerts to Parents"}
              </Button>
            )}
          </div>

          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Analyzing attendance patterns...</div>
          ) : !selectedClass ? (
            <div className="text-center py-8 text-muted-foreground">Select a class to analyze attendance risk</div>
          ) : atRiskStudents.length === 0 ? (
            <Alert>
              <AlertDescription className="flex items-center gap-2">
                <Bell className="w-4 h-4" />
                No students currently at risk. All students have attendance rates above 60%.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Critical Risk</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-500">
                      {atRiskStudents.filter(s => s.riskLevel === "critical").length}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">High Risk</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-orange-500">
                      {atRiskStudents.filter(s => s.riskLevel === "high").length}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Moderate Risk</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-yellow-500">
                      {atRiskStudents.filter(s => s.riskLevel === "moderate").length}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* At-Risk Students Table */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    At-Risk Students (Attendance &lt; 60%)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student Name</TableHead>
                        <TableHead>Attendance Rate</TableHead>
                        <TableHead>Present/Total</TableHead>
                        <TableHead>Trend</TableHead>
                        <TableHead>Risk Level</TableHead>
                        <TableHead>Last Absent</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {atRiskStudents.map((student) => (
                        <TableRow key={student.studentId}>
                          <TableCell className="font-medium">{student.studentName}</TableCell>
                          <TableCell>
                            <span className={`font-bold ${
                              student.attendanceRate < 40 ? "text-red-500" :
                              student.attendanceRate < 50 ? "text-orange-500" :
                              "text-yellow-500"
                            }`}>
                              {student.attendanceRate.toFixed(1)}%
                            </span>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {student.presentDays}/{student.totalDays}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getTrendIcon(student.trend)}
                              <span className="text-sm capitalize">{student.trend}</span>
                            </div>
                          </TableCell>
                          <TableCell>{getRiskBadge(student.riskLevel)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {student.lastAbsentDate 
                              ? format(new Date(student.lastAbsentDate), "MMM dd")
                              : "-"
                            }
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Alert>
                <AlertTriangle className="w-4 h-4" />
                <AlertDescription>
                  <strong>Note:</strong> Students are flagged as at-risk when their attendance rate falls below 60%. 
                  Chronic absenteeism significantly impacts academic performance. Use "Send Alerts to Parents" to notify 
                  guardians automatically.
                </AlertDescription>
              </Alert>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
