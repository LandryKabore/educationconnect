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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Users, Loader2, Clock } from "lucide-react";
import { SubjectScheduleCard } from "./SubjectScheduleCard";

interface EditClassSectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  classSection: any;
  selectedSchoolId?: string | null;
}

export function EditClassSectionModal({ isOpen, onClose, onSuccess, classSection, selectedSchoolId }: EditClassSectionModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [campuses, setCampuses] = useState<any[]>([]);
  const [academicYears, setAcademicYears] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    name: "",
    grade_level: "",
    capacity: 30,
    campus_id: "",
    academic_year_id: ""
  });

  useEffect(() => {
    if (isOpen) {
      fetchData();
      if (classSection) {
        setFormData({
          name: classSection.name || "",
          grade_level: classSection.grade_level || "",
          capacity: classSection.capacity || 30,
          campus_id: classSection.campus_id || "",
          academic_year_id: classSection.academic_year_id || ""
        });
      }
    }
  }, [isOpen, classSection, selectedSchoolId]);

  const fetchData = async () => {
    try {
      const [campusesData, academicYearsData, subjectsData] = await Promise.all([
        supabase
          .from('campuses')
          .select('*')
          .then(result => ({
            ...result,
            data: selectedSchoolId ? result.data?.filter(c => c.school_id === selectedSchoolId) : result.data
          })),
        supabase
          .from('academic_years')
          .select('*')
          .then(result => ({
            ...result,
            data: selectedSchoolId ? result.data?.filter(ay => ay.school_id === selectedSchoolId) : result.data
          })),
        supabase
          .from('class_section_subjects')
          .select('*, subjects(*)')
          .eq('class_section_id', classSection?.id || '')
      ]);

      setCampuses(campusesData.data || []);
      setAcademicYears(academicYearsData.data || []);
      setSubjects(subjectsData.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.grade_level || !formData.campus_id || !formData.academic_year_id) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      // Update class section basic info
      const { error: classError } = await supabase
        .from('class_sections')
        .update({
          name: formData.name,
          grade_level: formData.grade_level,
          capacity: formData.capacity,
          campus_id: formData.campus_id,
          academic_year_id: formData.academic_year_id
        })
        .eq('id', classSection.id);

      if (classError) throw classError;

      // Update subject schedules
      for (const subject of subjects) {
        const { error: scheduleError } = await supabase
          .from('class_section_subjects')
          .update({
            schedule_days: subject.schedule_days,
            schedule_time_start: subject.schedule_time_start,
            schedule_time_end: subject.schedule_time_end,
            schedule_duration: subject.schedule_duration
          })
          .eq('id', subject.id);

        if (scheduleError) throw scheduleError;
      }

      toast({
        title: "Success",
        description: "Class section updated successfully"
      });
      
      handleClose();
      onSuccess();
    } catch (error) {
      console.error('Error updating class section:', error);
      toast({
        title: "Error",
        description: "Failed to update class section",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const updateSubjectSchedule = (subjectId: string, field: string, value: any) => {
    setSubjects(subjects.map(s => 
      s.id === subjectId ? { ...s, [field]: value } : s
    ));
  };

  const toggleDay = (subjectId: string, day: string) => {
    setSubjects(subjects.map(s => {
      if (s.id === subjectId) {
        const days = s.schedule_days || [];
        const newDays = days.includes(day)
          ? days.filter((d: string) => d !== day)
          : [...days, day];
        return { ...s, schedule_days: newDays };
      }
      return s;
    }));
  };

  const handleClose = () => {
    setFormData({
      name: "",
      grade_level: "",
      capacity: 30,
      campus_id: "",
      academic_year_id: ""
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Edit Class Section
          </DialogTitle>
          <DialogDescription>
            Update the class section information and subject schedules below.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">Section Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Grade 7 A"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="grade_level">Grade Level *</Label>
            <Input
              id="grade_level"
              value={formData.grade_level}
              onChange={(e) => setFormData({ ...formData, grade_level: e.target.value })}
              placeholder="e.g., Grade 7"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="capacity">Capacity</Label>
            <Input
              id="capacity"
              type="number"
              min="1"
              value={formData.capacity}
              onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) || 30 })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="campus">Campus *</Label>
            <Select
              value={formData.campus_id}
              onValueChange={(value) => setFormData({ ...formData, campus_id: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a campus" />
              </SelectTrigger>
              <SelectContent>
                {campuses.map((campus) => (
                  <SelectItem key={campus.id} value={campus.id}>
                    {campus.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="academic_year">Academic Year *</Label>
            <Select
              value={formData.academic_year_id}
              onValueChange={(value) => setFormData({ ...formData, academic_year_id: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select academic year" />
              </SelectTrigger>
              <SelectContent>
                {academicYears.map((year) => (
                  <SelectItem key={year.id} value={year.id}>
                    {year.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Subject Schedules Section */}
          {subjects.length > 0 && (
            <div className="border-t pt-6">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-4 h-4" />
                <Label className="text-base font-semibold">Subject Schedules</Label>
              </div>
              
              <div className="space-y-6">
                {subjects.map((subject) => (
                  <SubjectScheduleCard
                    key={subject.id}
                    subject={subject}
                    onUpdateSchedule={updateSubjectSchedule}
                    onToggleDay={toggleDay}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Update Class Section
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}