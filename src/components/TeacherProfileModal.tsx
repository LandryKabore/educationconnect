import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { 
  User, 
  Mail, 
  Phone, 
  Calendar, 
  BookOpen, 
  Clock, 
  GraduationCap,
  MapPin,
  IdCard,
  Loader2,
  School
} from "lucide-react";

interface TeacherProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  teacherId: string;
}

interface TeacherProfile {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  prefix?: string;
  gender?: string;
  dob?: string;
  staff_no?: string;
  hire_date?: string;
  subjects_taught?: string;
  qualifications?: string[];
  school_name?: string;
}

interface TeachingAssignment {
  id: string;
  class_section_name: string;
  grade_level: string;
  subject_name: string;
  subject_code?: string;
  schedule_days?: string[];
  schedule_time_start?: string;
  schedule_time_end?: string;
}

const DAYS_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function TeacherProfileModal({ isOpen, onClose, teacherId }: TeacherProfileModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<TeacherProfile | null>(null);
  const [assignments, setAssignments] = useState<TeachingAssignment[]>([]);
  const [isVerified, setIsVerified] = useState(true);

  useEffect(() => {
    if (isOpen && teacherId) {
      fetchTeacherData();
    }
  }, [isOpen, teacherId]);

  const fetchTeacherData = async () => {
    setLoading(true);
    try {
      // First try to get verified teacher data
      const { data: verifiedData, error: verifiedError } = await supabase
        .from('teacher_profiles')
        .select(`
          *,
          profiles!inner(first_name, last_name, email, phone)
        `)
        .eq('user_id', teacherId)
        .single();

      if (verifiedData) {
        // Get school name
        const { data: schoolData } = await supabase
          .from('schools')
          .select('name')
          .eq('id', verifiedData.school_id)
          .single();

        setProfile({
          first_name: verifiedData.profiles.first_name || '',
          last_name: verifiedData.profiles.last_name || '',
          email: verifiedData.profiles.email || '',
          phone: verifiedData.phone || verifiedData.profiles.phone,
          prefix: verifiedData.prefix,
          gender: verifiedData.gender,
          dob: verifiedData.dob,
          staff_no: verifiedData.staff_no,
          hire_date: verifiedData.hire_date,
          subjects_taught: verifiedData.subjects_taught,
          qualifications: verifiedData.qualifications,
          school_name: schoolData?.name
        });
        setIsVerified(true);

        // Fetch teaching assignments
        await fetchTeachingAssignments(teacherId);
      } else {
        // Try unverified teacher
        const { data: unverifiedData, error: unverifiedError } = await supabase
          .from('teacher_temp_credentials')
          .select('*')
          .eq('teacher_user_id', teacherId)
          .single();

        if (unverifiedData) {
          // Get school name
          const { data: schoolData } = await supabase
            .from('schools')
            .select('name')
            .eq('id', unverifiedData.school_id)
            .single();

          setProfile({
            first_name: unverifiedData.first_name || '',
            last_name: unverifiedData.last_name || '',
            email: '', // Unverified teachers don't have email yet
            phone: unverifiedData.phone,
            prefix: unverifiedData.prefix,
            gender: unverifiedData.gender,
            dob: unverifiedData.dob,
            staff_no: unverifiedData.staff_no,
            subjects_taught: unverifiedData.subjects_taught,
            qualifications: unverifiedData.qualifications,
            school_name: schoolData?.name
          });
          setIsVerified(false);

          // Fetch assignments for unverified teacher
          await fetchTeachingAssignments(teacherId);
        } else {
          throw new Error('Teacher not found');
        }
      }
    } catch (error) {
      console.error('Error fetching teacher data:', error);
      toast({
        title: "Error",
        description: "Failed to load teacher profile",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchTeachingAssignments = async (teacherId: string) => {
    try {
      const { data, error } = await supabase
        .from('class_section_subjects')
        .select(`
          id,
          schedule_days,
          schedule_time_start,
          schedule_time_end,
          class_sections!inner(name, grade_level),
          subjects!inner(name, code)
        `)
        .eq('teacher_user_id', teacherId);

      if (error) throw error;

      const formattedAssignments: TeachingAssignment[] = (data || []).map((item: any) => ({
        id: item.id,
        class_section_name: item.class_sections.name,
        grade_level: item.class_sections.grade_level,
        subject_name: item.subjects.name,
        subject_code: item.subjects.code,
        schedule_days: item.schedule_days,
        schedule_time_start: item.schedule_time_start,
        schedule_time_end: item.schedule_time_end
      }));

      setAssignments(formattedAssignments);
    } catch (error) {
      console.error('Error fetching teaching assignments:', error);
    }
  };

  const formatTime = (time: string | undefined) => {
    if (!time) return '';
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const formatDate = (date: string | undefined) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!profile) {
    return null;
  }

  const fullName = `${profile.prefix || ''} ${profile.first_name} ${profile.last_name}`.trim();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <User className="w-6 h-6" />
            {fullName}
            {!isVerified && (
              <Badge variant="outline" className="ml-2">
                Pending Verification
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Complete teacher profile and teaching assignments
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Personal Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IdCard className="w-5 h-5" />
                Personal Information
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {profile.school_name && (
                <div className="flex items-start gap-3">
                  <School className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">School</p>
                    <p className="font-medium">{profile.school_name}</p>
                  </div>
                </div>
              )}
              
              {profile.email && (
                <div className="flex items-start gap-3">
                  <Mail className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium">{profile.email}</p>
                  </div>
                </div>
              )}
              
              {profile.phone && (
                <div className="flex items-start gap-3">
                  <Phone className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Phone</p>
                    <p className="font-medium">{profile.phone}</p>
                  </div>
                </div>
              )}

              {profile.staff_no && (
                <div className="flex items-start gap-3">
                  <IdCard className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Staff Number</p>
                    <p className="font-medium">{profile.staff_no}</p>
                  </div>
                </div>
              )}

              {profile.gender && (
                <div className="flex items-start gap-3">
                  <User className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Gender</p>
                    <p className="font-medium capitalize">{profile.gender}</p>
                  </div>
                </div>
              )}

              {profile.dob && (
                <div className="flex items-start gap-3">
                  <Calendar className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Date of Birth</p>
                    <p className="font-medium">{formatDate(profile.dob)}</p>
                  </div>
                </div>
              )}

              {profile.hire_date && (
                <div className="flex items-start gap-3">
                  <Calendar className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Hire Date</p>
                    <p className="font-medium">{formatDate(profile.hire_date)}</p>
                  </div>
                </div>
              )}

              {profile.subjects_taught && (
                <div className="flex items-start gap-3 md:col-span-2">
                  <BookOpen className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Subjects Expertise</p>
                    <p className="font-medium">{profile.subjects_taught}</p>
                  </div>
                </div>
              )}

              {profile.qualifications && profile.qualifications.length > 0 && (
                <div className="flex items-start gap-3 md:col-span-2">
                  <GraduationCap className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Qualifications</p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {profile.qualifications.map((qual, idx) => (
                        <Badge key={idx} variant="secondary">
                          {qual}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Teaching Assignments */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                Teaching Assignments ({assignments.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {assignments.length > 0 ? (
                <div className="space-y-4">
                  {assignments.map((assignment) => (
                    <div
                      key={assignment.id}
                      className="p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className="font-semibold text-lg flex items-center gap-2">
                            {assignment.subject_name}
                            {assignment.subject_code && (
                              <Badge variant="outline">{assignment.subject_code}</Badge>
                            )}
                          </h4>
                          <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                            <MapPin className="w-4 h-4" />
                            {assignment.class_section_name} - {assignment.grade_level}
                          </p>
                        </div>
                      </div>

                      {assignment.schedule_days && assignment.schedule_days.length > 0 && (
                        <div className="space-y-2">
                          <Separator />
                          <div className="pt-2">
                            <p className="text-sm font-medium mb-2 flex items-center gap-2">
                              <Clock className="w-4 h-4" />
                              Schedule
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {[...assignment.schedule_days]
                                .sort((a, b) => DAYS_ORDER.indexOf(a) - DAYS_ORDER.indexOf(b))
                                .map((day) => (
                                  <Badge key={day} variant="secondary">
                                    {day}
                                  </Badge>
                                ))}
                            </div>
                            {assignment.schedule_time_start && assignment.schedule_time_end && (
                              <p className="text-sm text-muted-foreground mt-2">
                                {formatTime(assignment.schedule_time_start)} - {formatTime(assignment.schedule_time_end)}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <BookOpen className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No teaching assignments yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end">
          <Button onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
