import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Users, BookOpen, Clock, GraduationCap, MapPin, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ClassSectionDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  classSection: any;
}

interface SubjectInfo {
  id: string;
  name: string;
  code: string;
  teacher_name: string | null;
  teacher_prefix: string | null;
  schedule_days: string[] | null;
  schedule_time_start: string | null;
  schedule_time_end: string | null;
  schedule_duration: number | null;
}

interface StudentInfo {
  id: string;
  first_name: string;
  last_name: string;
  student_no: string | null;
  email: string;
}

interface TeacherInfo {
  id: string;
  first_name: string;
  last_name: string;
  prefix: string | null;
  staff_no: string | null;
  subjects: string[];
}

export function ClassSectionDetailsModal({ isOpen, onClose, classSection }: ClassSectionDetailsModalProps) {
  const [loading, setLoading] = useState(true);
  const [subjects, setSubjects] = useState<SubjectInfo[]>([]);
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [teachers, setTeachers] = useState<TeacherInfo[]>([]);
  const [campusName, setCampusName] = useState<string>("");
  const [academicYearName, setAcademicYearName] = useState<string>("");

  useEffect(() => {
    if (isOpen && classSection) {
      fetchClassSectionDetails();
    }
  }, [isOpen, classSection]);

  const fetchClassSectionDetails = async () => {
    setLoading(true);
    try {
      // Fetch campus and academic year names
      const [campusData, academicYearData] = await Promise.all([
        supabase.from('campuses').select('name').eq('id', classSection.campus_id).single(),
        supabase.from('academic_years').select('name').eq('id', classSection.academic_year_id).single()
      ]);

      setCampusName(campusData.data?.name || 'Unknown Campus');
      setAcademicYearName(academicYearData.data?.name || 'Unknown Academic Year');

      // Fetch subjects with their schedules and teachers
      const { data: subjectsData, error: subjectsError } = await supabase
        .from('class_section_subjects')
        .select(`
          id,
          subject_id,
          teacher_user_id,
          schedule_days,
          schedule_time_start,
          schedule_time_end,
          schedule_duration,
          subjects (
            name,
            code
          )
        `)
        .eq('class_section_id', classSection.id);

      if (subjectsError) throw subjectsError;

      // Fetch teacher info for subjects
      const teacherIds = subjectsData
        ?.map(s => s.teacher_user_id)
        .filter(id => id !== null) || [];

      let teacherNames: Record<string, { first_name: string; last_name: string; prefix: string | null }> = {};
      
      if (teacherIds.length > 0) {
        // Fetch from profiles for verified teachers
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('user_id, first_name, last_name')
          .in('user_id', teacherIds);

        // Fetch from teacher_profiles for prefix
        const { data: teacherProfilesData } = await supabase
          .from('teacher_profiles')
          .select('user_id, prefix')
          .in('user_id', teacherIds);

        // Fetch from teacher_temp_credentials for unverified teachers
        const { data: tempCredsData } = await supabase
          .from('teacher_temp_credentials')
          .select('teacher_user_id, first_name, last_name, prefix')
          .in('teacher_user_id', teacherIds);

        // Combine data
        profilesData?.forEach(p => {
          const prefix = teacherProfilesData?.find(tp => tp.user_id === p.user_id)?.prefix;
          teacherNames[p.user_id] = { 
            first_name: p.first_name || '', 
            last_name: p.last_name || '',
            prefix: prefix || null
          };
        });

        tempCredsData?.forEach(tc => {
          if (!teacherNames[tc.teacher_user_id]) {
            teacherNames[tc.teacher_user_id] = { 
              first_name: tc.first_name || '', 
              last_name: tc.last_name || '',
              prefix: tc.prefix || null
            };
          }
        });
      }

      const formattedSubjects: SubjectInfo[] = subjectsData?.map(s => ({
        id: s.subject_id,
        name: s.subjects?.name || 'Unknown Subject',
        code: s.subjects?.code || '',
        teacher_name: s.teacher_user_id && teacherNames[s.teacher_user_id]
          ? `${teacherNames[s.teacher_user_id].first_name} ${teacherNames[s.teacher_user_id].last_name}`
          : null,
        teacher_prefix: s.teacher_user_id && teacherNames[s.teacher_user_id]?.prefix || null,
        schedule_days: s.schedule_days,
        schedule_time_start: s.schedule_time_start,
        schedule_time_end: s.schedule_time_end,
        schedule_duration: s.schedule_duration,
      })) || [];

      setSubjects(formattedSubjects);

      // Fetch enrolled students
      const { data: enrollmentsData, error: enrollmentsError } = await supabase
        .from('enrollments')
        .select(`
          student_user_id,
          profiles!inner (
            first_name,
            last_name,
            email
          ),
          student_profiles (
            student_no
          )
        `)
        .eq('class_section_id', classSection.id)
        .eq('status', 'active');

      if (enrollmentsError) throw enrollmentsError;

      const formattedStudents: StudentInfo[] = enrollmentsData?.map(e => ({
        id: e.student_user_id,
        first_name: e.profiles?.first_name || '',
        last_name: e.profiles?.last_name || '',
        student_no: Array.isArray(e.student_profiles) && e.student_profiles.length > 0 
          ? e.student_profiles[0]?.student_no || null 
          : null,
        email: e.profiles?.email || '',
      })) || [];

      setStudents(formattedStudents);

      // Fetch teachers assigned to this class with their subjects
      const { data: teachingAssignmentsData, error: teachingError } = await supabase
        .from('teaching_assignments')
        .select(`
          teacher_user_id,
          subject_id,
          subjects (
            name
          )
        `)
        .eq('class_section_id', classSection.id);

      if (teachingError) throw teachingError;

      // Group by teacher
      const teacherMap: Record<string, { subjects: string[] }> = {};
      teachingAssignmentsData?.forEach(ta => {
        if (!teacherMap[ta.teacher_user_id]) {
          teacherMap[ta.teacher_user_id] = { subjects: [] };
        }
        if (ta.subjects?.name) {
          teacherMap[ta.teacher_user_id].subjects.push(ta.subjects.name);
        }
      });

      // Fetch teacher details
      const uniqueTeacherIds = Object.keys(teacherMap);
      const formattedTeachers: TeacherInfo[] = [];

      for (const teacherId of uniqueTeacherIds) {
        // Try profiles first
        const { data: profileData } = await supabase
          .from('profiles')
          .select('first_name, last_name')
          .eq('user_id', teacherId)
          .single();

        const { data: teacherProfileData } = await supabase
          .from('teacher_profiles')
          .select('prefix, staff_no')
          .eq('user_id', teacherId)
          .single();

        if (profileData) {
          formattedTeachers.push({
            id: teacherId,
            first_name: profileData.first_name || '',
            last_name: profileData.last_name || '',
            prefix: teacherProfileData?.prefix || null,
            staff_no: teacherProfileData?.staff_no || null,
            subjects: teacherMap[teacherId].subjects,
          });
        } else {
          // Try temp credentials
          const { data: tempData } = await supabase
            .from('teacher_temp_credentials')
            .select('first_name, last_name, prefix, staff_no')
            .eq('teacher_user_id', teacherId)
            .single();

          if (tempData) {
            formattedTeachers.push({
              id: teacherId,
              first_name: tempData.first_name || '',
              last_name: tempData.last_name || '',
              prefix: tempData.prefix || null,
              staff_no: tempData.staff_no || null,
              subjects: teacherMap[teacherId].subjects,
            });
          }
        }
      }

      setTeachers(formattedTeachers);
    } catch (error) {
      console.error('Error fetching class section details:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (time: string | null) => {
    if (!time) return 'Not set';
    return time;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <GraduationCap className="w-6 h-6" />
            {classSection?.name} - {classSection?.grade_level}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : (
          <ScrollArea className="max-h-[70vh]">
            <div className="space-y-6 pr-4">
              {/* Class Info Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Users className="w-5 h-5" />
                    Class Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Capacity</p>
                    <p className="font-semibold">{classSection?.capacity || 30} students</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Enrolled</p>
                    <p className="font-semibold">{students.length} students</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <MapPin className="w-4 h-4" />
                      Campus
                    </p>
                    <p className="font-semibold">{campusName}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      Academic Year
                    </p>
                    <p className="font-semibold">{academicYearName}</p>
                  </div>
                </CardContent>
              </Card>

              {/* Tabs for different sections */}
              <Tabs defaultValue="subjects" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="subjects">Subjects ({subjects.length})</TabsTrigger>
                  <TabsTrigger value="students">Students ({students.length})</TabsTrigger>
                  <TabsTrigger value="teachers">Teachers ({teachers.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="subjects" className="space-y-3">
                  {subjects.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No subjects assigned yet</p>
                  ) : (
                    subjects.map((subject) => (
                      <Card key={subject.id}>
                        <CardContent className="pt-6">
                          <div className="flex items-start justify-between">
                            <div className="space-y-2 flex-1">
                              <div className="flex items-center gap-2">
                                <BookOpen className="w-4 h-4 text-primary" />
                                <h4 className="font-semibold text-lg">{subject.name}</h4>
                                {subject.code && (
                                  <Badge variant="outline">{subject.code}</Badge>
                                )}
                              </div>
                              
                              {subject.teacher_name && (
                                <div className="flex items-center gap-2 text-sm">
                                  <Users className="w-4 h-4 text-muted-foreground" />
                                  <span>
                                    {subject.teacher_prefix && `${subject.teacher_prefix} `}
                                    {subject.teacher_name}
                                  </span>
                                </div>
                              )}

                              {subject.schedule_days && subject.schedule_days.length > 0 && (
                                <div className="flex items-center gap-2 text-sm">
                                  <Clock className="w-4 h-4 text-muted-foreground" />
                                  <div className="flex flex-wrap gap-1">
                                    {subject.schedule_days.map(day => (
                                      <Badge key={day} variant="secondary" className="text-xs">
                                        {day}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {(subject.schedule_time_start || subject.schedule_time_end) && (
                                <div className="text-sm text-muted-foreground">
                                  Time: {formatTime(subject.schedule_time_start)} - {formatTime(subject.schedule_time_end)}
                                  {subject.schedule_duration && ` (${subject.schedule_duration} min)`}
                                </div>
                              )}

                              {!subject.teacher_name && (
                                <Badge variant="destructive" className="text-xs">No teacher assigned</Badge>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </TabsContent>

                <TabsContent value="students" className="space-y-2">
                  {students.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No students enrolled yet</p>
                  ) : (
                    <div className="grid gap-2">
                      {students.map((student, idx) => (
                        <Card key={student.id}>
                          <CardContent className="flex items-center justify-between py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                                {idx + 1}
                              </div>
                              <div>
                                <p className="font-medium">{student.first_name} {student.last_name}</p>
                                <p className="text-sm text-muted-foreground">{student.email}</p>
                              </div>
                            </div>
                            {student.student_no && (
                              <Badge variant="outline">{student.student_no}</Badge>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="teachers" className="space-y-2">
                  {teachers.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No teachers assigned yet</p>
                  ) : (
                    <div className="grid gap-3">
                      {teachers.map((teacher) => (
                        <Card key={teacher.id}>
                          <CardContent className="pt-6">
                            <div className="space-y-3">
                              <div className="flex items-start justify-between">
                                <div>
                                  <p className="font-semibold text-lg">
                                    {teacher.prefix && `${teacher.prefix} `}
                                    {teacher.first_name} {teacher.last_name}
                                  </p>
                                  {teacher.staff_no && (
                                    <p className="text-sm text-muted-foreground">Staff No: {teacher.staff_no}</p>
                                  )}
                                </div>
                              </div>
                              
                              {teacher.subjects.length > 0 && (
                                <div>
                                  <p className="text-sm text-muted-foreground mb-2">Teaching:</p>
                                  <div className="flex flex-wrap gap-2">
                                    {teacher.subjects.map((subject, idx) => (
                                      <Badge key={idx} variant="secondary">
                                        {subject}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </ScrollArea>
        )}

        <div className="flex justify-end mt-4">
          <Button onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}