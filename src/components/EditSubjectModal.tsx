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
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, Loader2, Clock } from "lucide-react";

interface EditSubjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  subject: any;
}

export function EditSubjectModal({ isOpen, onClose, onSuccess, subject }: EditSubjectModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    description: "",
    schedule_days: [] as string[],
    schedule_time_start: "",
    schedule_time_end: "",
    schedule_duration: ""
  });

  const weekDays = [
    { id: "monday", label: "Monday" },
    { id: "tuesday", label: "Tuesday" },
    { id: "wednesday", label: "Wednesday" },
    { id: "thursday", label: "Thursday" },
    { id: "friday", label: "Friday" },
    { id: "saturday", label: "Saturday" },
    { id: "sunday", label: "Sunday" }
  ];

  useEffect(() => {
    if (subject && isOpen) {
      setFormData({
        name: subject.name || "",
        code: subject.code || "",
        description: subject.description || "",
        schedule_days: subject.schedule_days || [],
        schedule_time_start: subject.schedule_time_start || "",
        schedule_time_end: subject.schedule_time_end || "",
        schedule_duration: subject.schedule_duration ? subject.schedule_duration.toString() : ""
      });
    }
  }, [subject, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) {
      toast({
        title: "Error",
        description: "Subject name is required",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('subjects')
        .update({
          name: formData.name,
          code: formData.code || null,
          description: formData.description || null,
          schedule_days: formData.schedule_days.length > 0 ? formData.schedule_days : null,
          schedule_time_start: formData.schedule_time_start || null,
          schedule_time_end: formData.schedule_time_end || null,
          schedule_duration: formData.schedule_duration ? parseInt(formData.schedule_duration) : null
        })
        .eq('id', subject.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Subject updated successfully"
      });
      
      handleClose();
      onSuccess();
    } catch (error) {
      console.error('Error updating subject:', error);
      toast({
        title: "Error",
        description: "Failed to update subject",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      name: "",
      code: "",
      description: "",
      schedule_days: [],
      schedule_time_start: "",
      schedule_time_end: "",
      schedule_duration: ""
    });
    onClose();
  };

  const toggleDay = (dayId: string) => {
    setFormData(prev => ({
      ...prev,
      schedule_days: prev.schedule_days.includes(dayId)
        ? prev.schedule_days.filter(day => day !== dayId)
        : [...prev.schedule_days, dayId]
    }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5" />
            Edit Subject
          </DialogTitle>
          <DialogDescription>
            Update the subject information below.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Subject Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Mathematics"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="code">Subject Code</Label>
            <Input
              id="code"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              placeholder="e.g., MATH101"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of the subject"
              rows={3}
            />
          </div>

          <div className="space-y-4 border-t pt-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              <Label className="text-sm font-medium">Class Schedule</Label>
            </div>
            
            <div className="space-y-2">
              <Label>Days of the Week</Label>
              <div className="grid grid-cols-2 gap-2">
                {weekDays.map((day) => (
                  <div key={day.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={day.id}
                      checked={formData.schedule_days.includes(day.id)}
                      onCheckedChange={() => toggleDay(day.id)}
                    />
                    <Label htmlFor={day.id} className="text-sm font-normal">
                      {day.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start-time">Start Time</Label>
                <Input
                  id="start-time"
                  type="time"
                  value={formData.schedule_time_start}
                  onChange={(e) => setFormData({ ...formData, schedule_time_start: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end-time">End Time</Label>
                <Input
                  id="end-time"
                  type="time"
                  value={formData.schedule_time_end}
                  onChange={(e) => setFormData({ ...formData, schedule_time_end: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="duration">Duration (minutes)</Label>
              <Input
                id="duration"
                type="number"
                value={formData.schedule_duration}
                onChange={(e) => setFormData({ ...formData, schedule_duration: e.target.value })}
                placeholder="e.g., 60"
                min="1"
                max="480"
              />
            </div>
          </div>

          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Update Subject
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}