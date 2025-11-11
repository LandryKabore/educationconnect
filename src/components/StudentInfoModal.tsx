import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, User, Mail, Phone, Calendar, Award, TrendingUp, BookOpen, CheckCircle2, XCircle, Clock, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface StudentInfoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentUserId: string;
  classId: string;
}

export function StudentInfoModal({ open, onOpenChange, studentUserId, classId }: StudentInfoModalProps) {
  const [loading, setLoading] = useState(true);
  const [studentData, setStudentData] = useState<any>(null);

  useEffect(() => {
    if (open && studentUserId) {
      fetchStudentData();
    }
  }, [open, studentUserId]);

  const fetchStudentData = async () => {
    setLoading(true);
    try {
      // Fetch student profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", studentUserId)
        .single();

      const { data: studentProfile } = await supabase
        .from("student_profiles")
        .select("*")
        .eq("user_id", studentUserId)
        .single();

      // Fetch temp credentials
      const { data: tempCreds } = await supabase
        .from("student_temp_credentials")
        .select("username, temp_password_plain")
        .eq("student_user_id", studentUserId)
        .maybeSingle();

      // Fetch grades for this class
      const { data: grades } = await supabase
        .from("enhanced_grades")
        .select(`
          *,
          exams(
            title,
            exam_date,
            max_score,
            subject_id,
            subjects(name)
          )
        `)
        .eq("student_user_id", studentUserId);

      // Fetch attendance for this class
      const { data: attendance } = await supabase
        .from("enhanced_attendance")
        .select("*")
        .eq("student_user_id", studentUserId)
        .eq("class_section_id", classId)
        .order("date", { ascending: false })
        .limit(30);

      // Calculate attendance stats
      const attendanceStats = attendance ? {
        total: attendance.length,
        present: attendance.filter(a => a.status === "present").length,
        late: attendance.filter(a => a.status === "late").length,
        excused: attendance.filter(a => a.status === "excused").length,
        absent: attendance.filter(a => a.status === "absent").length,
        rate: attendance.length > 0 
          ? Math.round(((attendance.filter(a => ["present", "late", "excused"].includes(a.status)).length / attendance.length) * 100))
          : 0
      } : null;

      // Calculate grade stats
      const gradeStats = grades && grades.length > 0 ? {
        average: Math.round((grades.reduce((sum, g) => sum + ((g.score / g.max_score) * 100), 0) / grades.length)),
        total: grades.length,
        highest: Math.max(...grades.map(g => (g.score / g.max_score) * 100)),
        lowest: Math.min(...grades.map(g => (g.score / g.max_score) * 100))
      } : null;

      setStudentData({
        profile,
        studentProfile,
        tempCreds,
        grades,
        attendance,
        attendanceStats,
        gradeStats
      });
    } catch (error) {
      console.error("Error fetching student data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "present":
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case "absent":
        return <XCircle className="w-4 h-4 text-red-500" />;
      case "late":
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case "excused":
        return <AlertCircle className="w-4 h-4 text-blue-500" />;
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Student Information</DialogTitle>
          <DialogDescription className="text-slate-400">
            Comprehensive student details and academic performance
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-orange-400" />
          </div>
        ) : studentData ? (
          <div className="space-y-6">
            {/* Student Profile Card */}
            <Card className="bg-slate-800/60 border-slate-600/50">
              <CardHeader>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-white font-bold text-2xl">
                    {studentData.profile?.first_name?.[0]}{studentData.profile?.last_name?.[0]}
                  </div>
                  <div>
                    <CardTitle className="text-white text-xl">
                      {studentData.profile?.first_name} {studentData.profile?.last_name}
                    </CardTitle>
                    <p className="text-slate-400 text-sm">Student No: {studentData.studentProfile?.student_no || "N/A"}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-300 text-sm">{studentData.profile?.email || "N/A"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-300 text-sm">{studentData.profile?.phone || studentData.studentProfile?.guardian_primary_contact || "N/A"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-300 text-sm">
                      DOB: {studentData.studentProfile?.dob ? format(new Date(studentData.studentProfile.dob), "MMM d, yyyy") : "N/A"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-300 text-sm">Gender: {studentData.studentProfile?.gender || "N/A"}</span>
                  </div>
                </div>
                {studentData.tempCreds && (
                  <div className="mt-4 p-3 bg-slate-700/50 rounded-lg border border-slate-600">
                    <p className="text-xs text-slate-400 mb-2">Login Credentials</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-xs text-slate-500">Username:</span>
                        <p className="text-sm font-mono text-white">{studentData.tempCreds.username}</p>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500">Temp Password:</span>
                        <p className="text-sm font-mono text-white">{studentData.tempCreds.temp_password_plain || "Set"}</p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tabs for Grades and Attendance */}
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-3 bg-slate-800/60">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="grades">Grades</TabsTrigger>
                <TabsTrigger value="attendance">Attendance</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {/* Attendance Summary */}
                  {studentData.attendanceStats && (
                    <Card className="bg-slate-800/60 border-slate-600/50">
                      <CardHeader>
                        <CardTitle className="text-white text-lg flex items-center gap-2">
                          <TrendingUp className="w-5 h-5 text-green-400" />
                          Attendance Rate
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-4xl font-bold text-green-400 mb-2">
                          {studentData.attendanceStats.rate}%
                        </div>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between text-slate-300">
                            <span>Present:</span>
                            <span className="font-semibold">{studentData.attendanceStats.present}</span>
                          </div>
                          <div className="flex justify-between text-slate-300">
                            <span>Late:</span>
                            <span className="font-semibold">{studentData.attendanceStats.late}</span>
                          </div>
                          <div className="flex justify-between text-slate-300">
                            <span>Excused:</span>
                            <span className="font-semibold">{studentData.attendanceStats.excused}</span>
                          </div>
                          <div className="flex justify-between text-slate-300">
                            <span>Absent:</span>
                            <span className="font-semibold">{studentData.attendanceStats.absent}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Grade Summary */}
                  {studentData.gradeStats && (
                    <Card className="bg-slate-800/60 border-slate-600/50">
                      <CardHeader>
                        <CardTitle className="text-white text-lg flex items-center gap-2">
                          <Award className="w-5 h-5 text-blue-400" />
                          Academic Performance
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-4xl font-bold text-blue-400 mb-2">
                          {studentData.gradeStats.average}%
                        </div>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between text-slate-300">
                            <span>Total Exams:</span>
                            <span className="font-semibold">{studentData.gradeStats.total}</span>
                          </div>
                          <div className="flex justify-between text-slate-300">
                            <span>Highest:</span>
                            <span className="font-semibold">{Math.round(studentData.gradeStats.highest)}%</span>
                          </div>
                          <div className="flex justify-between text-slate-300">
                            <span>Lowest:</span>
                            <span className="font-semibold">{Math.round(studentData.gradeStats.lowest)}%</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="grades" className="space-y-4">
                {studentData.grades && studentData.grades.length > 0 ? (
                  <div className="space-y-3">
                    {studentData.grades.map((grade: any) => (
                      <Card key={grade.id} className="bg-slate-800/60 border-slate-600/50">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <BookOpen className="w-4 h-4 text-blue-400" />
                                <h4 className="font-semibold text-white">{grade.exams?.title}</h4>
                              </div>
                              <p className="text-sm text-slate-400">
                                {grade.exams?.subjects?.name} • {format(new Date(grade.exams?.exam_date), "MMM d, yyyy")}
                              </p>
                              {grade.comment && (
                                <p className="text-sm text-slate-300 mt-2 italic">{grade.comment}</p>
                              )}
                            </div>
                            <div className="text-right">
                              <div className="text-2xl font-bold text-orange-400">
                                {grade.score}/{grade.max_score}
                              </div>
                              <Badge className={`mt-1 ${
                                (grade.score / grade.max_score) * 100 >= 80 ? "bg-green-500" :
                                (grade.score / grade.max_score) * 100 >= 60 ? "bg-blue-500" :
                                (grade.score / grade.max_score) * 100 >= 40 ? "bg-yellow-500" :
                                "bg-red-500"
                              }`}>
                                {Math.round((grade.score / grade.max_score) * 100)}%
                              </Badge>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-400">
                    No grades recorded yet
                  </div>
                )}
              </TabsContent>

              <TabsContent value="attendance" className="space-y-4">
                {studentData.attendance && studentData.attendance.length > 0 ? (
                  <div className="space-y-2">
                    {studentData.attendance.map((record: any) => (
                      <Card key={record.id} className="bg-slate-800/60 border-slate-600/50">
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              {getStatusIcon(record.status)}
                              <div>
                                <p className="font-semibold text-white">
                                  {format(new Date(record.date), "EEEE, MMM d, yyyy")}
                                </p>
                                {record.notes && (
                                  <p className="text-sm text-slate-400 mt-1">{record.notes}</p>
                                )}
                              </div>
                            </div>
                            <Badge className={`capitalize ${
                              record.status === "present" ? "bg-green-500" :
                              record.status === "late" ? "bg-yellow-500" :
                              record.status === "excused" ? "bg-blue-500" :
                              "bg-red-500"
                            }`}>
                              {record.status}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-400">
                    No attendance records yet
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          <div className="text-center py-8 text-slate-400">
            Failed to load student data
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
