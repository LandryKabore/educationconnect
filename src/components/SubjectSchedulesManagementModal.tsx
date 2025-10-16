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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Clock, Loader2, Plus, Trash2 } from "lucide-react";
import { SubjectScheduleCard } from "./SubjectScheduleCard";

interface SubjectSchedulesManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  selectedSchoolId?: string | null;
}

export function SubjectSchedulesManagementModal({ 
  isOpen, 
  onClose, 
  onSuccess,
  selectedSchoolId 
}: SubjectSchedulesManagementModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [classes, setClasses] = useState<any[]>([]);
  const [allSubjects, setAllSubjects] = useState<any[]>([]);
  const [assignedSubjects, setAssignedSubjects] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [selectedSubjectToAdd, setSelectedSubjectToAdd] = useState<string>("");

  useEffect(() => {
    if (isOpen) {
      fetchClasses();
      fetchAllSubjects();
    }
  }, [isOpen, selectedSchoolId]);

  useEffect(() => {
    if (selectedClassId) {
      fetchAssignedSubjects();
    } else {
      setAssignedSubjects([]);
    }
  }, [selectedClassId]);

  const fetchClasses = async () => {
    try {
      const query = supabase
        .from('class_sections')
        .select('*')
        .order('name');

      if (selectedSchoolId) {
        query.eq('school_id', selectedSchoolId);
      }

      const { data, error } = await query;
      if (error) throw error;
      setClasses(data || []);
    } catch (error) {
      console.error('Error fetching classes:', error);
    }
  };

  const fetchAllSubjects = async () => {
    try {
      const query = supabase
        .from('subjects')
        .select('*')
        .order('name');

      if (selectedSchoolId) {
        query.eq('school_id', selectedSchoolId);
      }

      const { data, error } = await query;
      if (error) throw error;
      setAllSubjects(data || []);
    } catch (error) {
      console.error('Error fetching subjects:', error);
    }
  };

  const fetchAssignedSubjects = async () => {
    try {
      const { data, error } = await supabase
        .from('class_section_subjects')
        .select('*, subjects(*)')
        .eq('class_section_id', selectedClassId);

      if (error) throw error;
      setAssignedSubjects(data || []);
    } catch (error) {
      console.error('Error fetching assigned subjects:', error);
    }
  };

  const handleAddSubject = async () => {
    if (!selectedSubjectToAdd || !selectedClassId) return;

    // Check if subject is already assigned
    const alreadyAssigned = assignedSubjects.some(
      s => s.subject_id === selectedSubjectToAdd
    );

    if (alreadyAssigned) {
      toast({
        title: "Subject Already Assigned",
        description: "This subject is already assigned to this class",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('class_section_subjects')
        .insert({
          class_section_id: selectedClassId,
          subject_id: selectedSubjectToAdd
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Subject added to class"
      });

      setSelectedSubjectToAdd("");
      fetchAssignedSubjects();
    } catch (error) {
      console.error('Error adding subject:', error);
      toast({
        title: "Error",
        description: "Failed to add subject",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveSubject = async (subjectAssignmentId: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('class_section_subjects')
        .delete()
        .eq('id', subjectAssignmentId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Subject removed from class"
      });

      fetchAssignedSubjects();
    } catch (error) {
      console.error('Error removing subject:', error);
      toast({
        title: "Error",
        description: "Failed to remove subject",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSchedules = async () => {
    setLoading(true);
    try {
      for (const subject of assignedSubjects) {
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
        description: "Subject schedules saved successfully"
      });

      onSuccess();
    } catch (error) {
      console.error('Error saving schedules:', error);
      toast({
        title: "Error",
        description: "Failed to save schedules",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const updateSubjectSchedule = (subjectId: string, field: string, value: any) => {
    setAssignedSubjects(assignedSubjects.map(s => 
      s.id === subjectId ? { ...s, [field]: value } : s
    ));
  };

  const toggleDay = (subjectId: string, day: string) => {
    setAssignedSubjects(assignedSubjects.map(s => {
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

  const availableSubjectsToAdd = allSubjects.filter(
    subject => !assignedSubjects.some(as => as.subject_id === subject.id)
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Subject Schedules Management
          </DialogTitle>
          <DialogDescription>
            Select a class, assign subjects, and set their schedules.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Class Selection */}
          <div className="space-y-2">
            <Label>Select Class *</Label>
            <Select
              value={selectedClassId}
              onValueChange={setSelectedClassId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a class section" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((cls) => (
                  <SelectItem key={cls.id} value={cls.id}>
                    {cls.name} - {cls.grade_level}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedClassId && (
            <>
              {/* Add Subject Section */}
              <div className="border rounded-lg p-4 space-y-4 bg-muted/50">
                <Label className="text-base font-semibold">Add Subject to Class</Label>
                <div className="flex gap-2">
                  <Select
                    value={selectedSubjectToAdd}
                    onValueChange={setSelectedSubjectToAdd}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Choose a subject to add" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSubjectsToAdd.length > 0 ? (
                        availableSubjectsToAdd.map((subject) => (
                          <SelectItem key={subject.id} value={subject.id}>
                            {subject.name} {subject.code && `(${subject.code})`}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="_none" disabled>
                          All subjects assigned
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={handleAddSubject}
                    disabled={!selectedSubjectToAdd || loading}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add
                  </Button>
                </div>
              </div>

              {/* Assigned Subjects with Schedules */}
              {assignedSubjects.length > 0 ? (
                <div className="space-y-4">
                  <Label className="text-base font-semibold">
                    Subjects & Schedules ({assignedSubjects.length})
                  </Label>
                  {assignedSubjects.map((subject) => (
                    <div key={subject.id} className="relative">
                      <Button
                        size="sm"
                        variant="outline"
                        className="absolute top-2 right-2 z-10 border-red-600 text-red-400 hover:bg-red-600/20"
                        onClick={() => handleRemoveSubject(subject.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <SubjectScheduleCard
                        subject={subject}
                        onUpdateSchedule={updateSubjectSchedule}
                        onToggleDay={toggleDay}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8 border rounded-lg">
                  No subjects assigned to this class yet. Add subjects using the form above.
                </p>
              )}
            </>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end space-x-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveSchedules}
              disabled={loading || !selectedClassId || assignedSubjects.length === 0}
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save All Schedules
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
