import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

interface SubjectScheduleCardProps {
  subject: any;
  onUpdateSchedule: (subjectId: string, field: string, value: any) => void;
  onToggleDay: (subjectId: string, day: string) => void;
}

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function SubjectScheduleCard({ subject, onUpdateSchedule, onToggleDay }: SubjectScheduleCardProps) {
  return (
    <div className="border rounded-lg p-4 space-y-4">
      <h4 className="font-medium">
        {subject.subjects?.name} {subject.subjects?.code && `(${subject.subjects.code})`}
      </h4>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Start Time</Label>
          <Input
            type="time"
            value={subject.schedule_time_start || ""}
            onChange={(e) => onUpdateSchedule(subject.id, 'schedule_time_start', e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>End Time</Label>
          <Input
            type="time"
            value={subject.schedule_time_end || ""}
            onChange={(e) => onUpdateSchedule(subject.id, 'schedule_time_end', e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>Duration (minutes)</Label>
          <Input
            type="number"
            min="1"
            placeholder="e.g., 45"
            value={subject.schedule_duration || ""}
            onChange={(e) => onUpdateSchedule(subject.id, 'schedule_duration', parseInt(e.target.value) || null)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Days of Week</Label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {DAYS_OF_WEEK.map((day) => (
            <div key={day} className="flex items-center space-x-2">
              <Checkbox
                id={`${subject.id}-${day}`}
                checked={(subject.schedule_days || []).includes(day)}
                onCheckedChange={() => onToggleDay(subject.id, day)}
              />
              <Label htmlFor={`${subject.id}-${day}`} className="text-sm cursor-pointer">
                {day}
              </Label>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
