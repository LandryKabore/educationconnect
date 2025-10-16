import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Clock, Loader2 } from "lucide-react";
import { SubjectScheduleCard } from "./SubjectScheduleCard";

interface ManageSubjectSchedulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  classSection: any;
}

export function ManageSubjectSchedulesModal({ 
  isOpen, 
  onClose, 
  onSuccess, 
  classSection 
}: ManageSubjectSchedulesModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [subjects, setSubjects] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen && classSection) {
      fetchSubjects();
    }
  }, [isOpen, classSection]);

  const fetchSubjects = async () => {
    try {
      const { data, error } = await supabase
        .from('class_section_subjects')
        .select('*, subjects(*)')
        .eq('class_section_id', classSection.id);

      if (error) throw error;
      setSubjects(data || []);
    } catch (error) {
      console.error('Error fetching subjects:', error);
      toast({
        title: "Error",
        description: "Failed to load subjects",
        variant: "destructive"
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Update subject schedules
      for (const subject of subjects) {
        const { error } = await supabase
          .from('class_section_subjects')
          .update({
            schedule_days: subject.schedule_days,
            schedule_time_start: subject.schedule_time_start,
            schedule_time_end: subject.schedule_time_end,
            schedule_duration: subject.schedule_duration
          })
          .eq('id', subject.id);

        if (error) throw error;
      }

      toast({
        title: "Success",
        description: "Subject schedules updated successfully"
      });
      
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error updating schedules:', error);
      toast({
        title: "Error",
        description: "Failed to update subject schedules",
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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Manage Subject Schedules - {classSection?.name}
          </DialogTitle>
          <DialogDescription>
            Set the schedule for each subject in this class section.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {subjects.length > 0 ? (
            <div className="space-y-4">
              {subjects.map((subject) => (
                <SubjectScheduleCard
                  key={subject.id}
                  subject={subject}
                  onUpdateSchedule={updateSubjectSchedule}
                  onToggleDay={toggleDay}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No subjects assigned to this class section yet.
            </p>
          )}

          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || subjects.length === 0}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Schedules
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
