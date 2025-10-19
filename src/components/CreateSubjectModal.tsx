import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, Loader2, List, Clock } from "lucide-react";

interface CreateSubjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  selectedSchoolId?: string | null;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function CreateSubjectModal({ isOpen, onClose, onSuccess, selectedSchoolId }: CreateSubjectModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [classSections, setClassSections] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    names: "",
    class_section_id: ""
  });
  const [parsedSubjects, setParsedSubjects] = useState<Array<{
    name: string, 
    code: string, 
    coefficient: number,
    schedule_days: string[],
    schedule_time_start: string,
    schedule_time_end: string,
    teacher_user_id: string | null
  }>>([]);

  useEffect(() => {
    if (isOpen) {
      fetchClassSections();
    }
  }, [isOpen, selectedSchoolId]);

  useEffect(() => {
    if (formData.class_section_id) {
      fetchTeachers();
    } else {
      setTeachers([]);
    }
  }, [formData.class_section_id]);

  const fetchClassSections = async () => {
    try {
      const query = supabase
        .from('class_sections')
        .select('id, name, grade_level, school_id')
        .order('name');
      
      if (selectedSchoolId) {
        query.eq('school_id', selectedSchoolId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setClassSections(data || []);
    } catch (error) {
      console.error('Error fetching class sections:', error);
      toast({
        title: "Error",
        description: "Failed to load class sections",
        variant: "destructive"
      });
    }
  };

  const fetchTeachers = async () => {
    try {
      const classSection = classSections.find(cs => cs.id === formData.class_section_id);
      if (!classSection) return;

      const { data, error } = await supabase
        .from('teacher_profiles')
        .select('user_id, profiles(first_name, last_name)')
        .eq('school_id', classSection.school_id);

      if (error) throw error;
      setTeachers(data || []);
    } catch (error) {
      console.error('Error fetching teachers:', error);
      toast({
        title: "Error",
        description: "Failed to load teachers",
        variant: "destructive"
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (parsedSubjects.length === 0 || !formData.class_section_id) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    // Check for time conflicts
    const conflictInfo = parsedSubjects.map((subject, idx) => ({
      subject,
      conflict: getTimeConflict(subject, idx)
    })).find(item => item.conflict !== null);

    if (conflictInfo) {
      const conflict = conflictInfo.conflict!;
      toast({
        title: "Schedule Conflict",
        description: `"${conflictInfo.subject.name}" conflicts with "${conflict.subjectName}" on ${conflict.days.join(', ')} (${conflict.startTime} - ${conflict.endTime})`,
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      // Get school_id from selected class section
      const classSection = classSections.find(cs => cs.id === formData.class_section_id);
      if (!classSection) throw new Error("Class section not found");

      // First, insert or get subjects
      const subjectPromises = parsedSubjects.map(async (subject) => {
        // Try to find existing subject with same name and school
        const { data: existing } = await supabase
          .from('subjects')
          .select('id')
          .eq('name', subject.name)
          .eq('school_id', classSection.school_id)
          .single();

        if (existing) {
          return existing.id;
        }

        // Create new subject
        const { data, error } = await supabase
          .from('subjects')
          .insert({
            name: subject.name,
            code: subject.code,
            school_id: classSection.school_id,
            coefficient: 1.0 // Default coefficient, actual one is per class section
          })
          .select('id')
          .single();

        if (error) throw error;
        return data.id;
      });

      const subjectIds = await Promise.all(subjectPromises);

      // Then create class_section_subjects entries
      const classSectionSubjects = parsedSubjects.map((subject, idx) => ({
        class_section_id: formData.class_section_id,
        subject_id: subjectIds[idx],
        teacher_user_id: subject.teacher_user_id || null,
        schedule_days: subject.schedule_days.length > 0 ? subject.schedule_days : null,
        schedule_time_start: subject.schedule_time_start || null,
        schedule_time_end: subject.schedule_time_end || null
      }));

      const { error: assignError } = await supabase
        .from('class_section_subjects')
        .insert(classSectionSubjects);

      if (assignError) throw assignError;

      toast({
        title: "Success",
        description: `${parsedSubjects.length} subject${parsedSubjects.length > 1 ? 's' : ''} created and assigned successfully`
      });
      
      handleClose();
      onSuccess();
    } catch (error) {
      console.error('Error creating subjects:', error);
      toast({
        title: "Error",
        description: "Failed to create subjects",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      names: "",
      class_section_id: ""
    });
    setParsedSubjects([]);
    onClose();
  };

  const generateSubjectCode = (name: string): string => {
    // Generate a code from the subject name (e.g., "Computer Science" -> "CS101")
    const words = name.trim().split(/\s+/);
    
    let prefix = '';
    if (words.length === 1) {
      // Single word: take first 2-4 letters
      prefix = words[0].substring(0, 4).toUpperCase();
    } else {
      // Multiple words: take first 2 letters of first 2 words
      prefix = words
        .slice(0, 2)
        .map(word => word.substring(0, 2))
        .join('')
        .toUpperCase();
    }
    
    // Add default course number "101"
    return `${prefix}101`;
  };

  const parseSubjectNames = (input: string) => {
    const names = input.split(',').map(name => name.trim()).filter(name => name.length > 0);
    const subjects = names.map(name => ({
      name,
      code: generateSubjectCode(name),
      coefficient: 1.0,
      schedule_days: [],
      schedule_time_start: "",
      schedule_time_end: "",
      teacher_user_id: null
    }));
    setParsedSubjects(subjects);
  };

  const handleNamesChange = (value: string) => {
    setFormData({ ...formData, names: value });
    parseSubjectNames(value);
  };

  const updateSubjectCoefficient = (index: number, coefficient: number) => {
    setParsedSubjects(prev => prev.map((subject, idx) => 
      idx === index ? { ...subject, coefficient } : subject
    ));
  };

  const updateSubjectCode = (index: number, code: string) => {
    setParsedSubjects(prev => prev.map((subject, idx) => 
      idx === index ? { ...subject, code: code.toUpperCase() } : subject
    ));
  };

  const updateScheduleDays = (index: number, day: string, checked: boolean) => {
    setParsedSubjects(prev => prev.map((subject, idx) => {
      if (idx !== index) return subject;
      const days = checked 
        ? [...subject.schedule_days, day]
        : subject.schedule_days.filter(d => d !== day);
      return { ...subject, schedule_days: days };
    }));
  };

  const updateScheduleTime = (index: number, field: 'schedule_time_start' | 'schedule_time_end', value: string) => {
    setParsedSubjects(prev => prev.map((subject, idx) => 
      idx === index ? { ...subject, [field]: value } : subject
    ));
  };

  const updateTeacher = (index: number, teacherId: string) => {
    setParsedSubjects(prev => prev.map((subject, idx) => 
      idx === index ? { ...subject, teacher_user_id: teacherId || null } : subject
    ));
  };

  const getTimeConflict = (subject: typeof parsedSubjects[0], currentIndex: number) => {
    if (!subject.schedule_time_start || !subject.schedule_time_end || subject.schedule_days.length === 0) {
      return null;
    }

    for (let idx = 0; idx < parsedSubjects.length; idx++) {
      if (idx === currentIndex) continue;
      
      const otherSubject = parsedSubjects[idx];
      if (!otherSubject.schedule_time_start || !otherSubject.schedule_time_end || otherSubject.schedule_days.length === 0) {
        continue;
      }

      // Check if they share any days
      const sharedDays = subject.schedule_days.filter(day => otherSubject.schedule_days.includes(day));
      if (sharedDays.length === 0) continue;

      // Check if times overlap
      const start1 = subject.schedule_time_start;
      const end1 = subject.schedule_time_end;
      const start2 = otherSubject.schedule_time_start;
      const end2 = otherSubject.schedule_time_end;

      // Times overlap if: start1 < end2 AND start2 < end1
      if (start1 < end2 && start2 < end1) {
        return {
          subjectName: otherSubject.name,
          days: sharedDays,
          startTime: otherSubject.schedule_time_start,
          endTime: otherSubject.schedule_time_end
        };
      }
    }

    return null;
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5" />
            Create Subject
          </DialogTitle>
          <DialogDescription>
            Create one or more subjects. Separate multiple subjects with commas.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="names">Subject Names *</Label>
              <Textarea
                id="names"
                value={formData.names}
                onChange={(e) => handleNamesChange(e.target.value)}
                placeholder="e.g., Mathematics, Physics, Chemistry, English"
                className="min-h-[80px]"
                required
              />
              <p className="text-xs text-muted-foreground">
                Separate multiple subjects with commas. Each will have a default coefficient of 1.0.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="class_section">Class Section *</Label>
              <Select
                value={formData.class_section_id}
                onValueChange={(value) => setFormData({ ...formData, class_section_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a class section" />
                </SelectTrigger>
                <SelectContent>
                  {classSections.map((cs) => (
                    <SelectItem key={cs.id} value={cs.id}>
                      {cs.name} - {cs.grade_level}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {parsedSubjects.length > 0 && (
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <List className="w-4 h-4" />
                  Subjects to Create ({parsedSubjects.length})
                </Label>
                <div className="border rounded-md p-3 space-y-4 max-h-96 overflow-y-auto bg-muted/30">
                  {parsedSubjects.map((subject, idx) => {
                    const conflict = getTimeConflict(subject, idx);
                    return (
                      <div key={idx} className={`p-3 border rounded-md bg-background space-y-3 ${conflict ? 'border-destructive' : ''}`}>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <div className="font-medium">{subject.name}</div>
                            {conflict && (
                              <span className="text-xs text-destructive font-semibold">Conflict!</span>
                            )}
                          </div>
                          {conflict && (
                            <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                              Conflicts with "{conflict.subjectName}" on {conflict.days.join(', ')} ({conflict.startTime} - {conflict.endTime})
                            </div>
                          )}
                        </div>

                        <div className="space-y-1">
                          <Label htmlFor={`teacher-${idx}`} className="text-xs">Assign Teacher</Label>
                          <Select
                            value={subject.teacher_user_id || ""}
                            onValueChange={(value) => updateTeacher(idx, value)}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue placeholder="Select teacher (optional)" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="">None</SelectItem>
                              {teachers.map((teacher) => (
                                <SelectItem key={teacher.user_id} value={teacher.user_id}>
                                  {teacher.profiles?.first_name} {teacher.profiles?.last_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                       
                         <div className="grid grid-cols-2 gap-3">
                           <div className="space-y-1">
                             <Label htmlFor={`code-${idx}`} className="text-xs">Subject Code</Label>
                             <Input
                               id={`code-${idx}`}
                               type="text"
                               value={subject.code}
                               onChange={(e) => updateSubjectCode(idx, e.target.value)}
                               className="h-8 text-sm uppercase"
                               maxLength={10}
                             />
                           </div>
                           <div className="space-y-1">
                             <Label htmlFor={`coefficient-${idx}`} className="text-xs">Coefficient</Label>
                             <Input
                               id={`coefficient-${idx}`}
                               type="number"
                               step="0.1"
                               min="0.1"
                               max="10.0"
                               value={subject.coefficient}
                               onChange={(e) => updateSubjectCoefficient(idx, parseFloat(e.target.value) || 1.0)}
                               className="h-8 text-sm"
                             />
                           </div>
                         </div>

                         <div className="space-y-2">
                           <Label className="text-xs flex items-center gap-1">
                             <Clock className="w-3 h-3" />
                             Schedule Days
                           </Label>
                           <div className="grid grid-cols-4 gap-2">
                             {DAYS.map(day => (
                               <div key={day} className="flex items-center space-x-2">
                                 <Checkbox
                                   id={`${idx}-${day}`}
                                   checked={subject.schedule_days.includes(day)}
                                   onCheckedChange={(checked) => updateScheduleDays(idx, day, checked as boolean)}
                                 />
                                 <Label htmlFor={`${idx}-${day}`} className="text-xs cursor-pointer">
                                   {day.substring(0, 3)}
                                 </Label>
                               </div>
                             ))}
                           </div>
                         </div>

                         <div className="grid grid-cols-2 gap-3">
                           <div className="space-y-1">
                             <Label htmlFor={`start-${idx}`} className="text-xs">Start Time</Label>
                             <Input
                               id={`start-${idx}`}
                               type="time"
                               value={subject.schedule_time_start}
                               onChange={(e) => updateScheduleTime(idx, 'schedule_time_start', e.target.value)}
                               className="h-8 text-sm"
                             />
                           </div>
                           <div className="space-y-1">
                             <Label htmlFor={`end-${idx}`} className="text-xs">End Time</Label>
                             <Input
                               id={`end-${idx}`}
                               type="time"
                               value={subject.schedule_time_end}
                               onChange={(e) => updateScheduleTime(idx, 'schedule_time_end', e.target.value)}
                               className="h-8 text-sm"
                             />
                           </div>
                         </div>
                       </div>
                     );
                   })}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Subject
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}