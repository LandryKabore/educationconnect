import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, Users, BookOpen } from "lucide-react";

interface ScheduleClass {
  id: string;
  name: string;
  subject: string;
  grade_level: string;
  days: string[];
  time_start: string;
  time_end: string;
  student_count: number;
}

interface TeacherScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  scheduleClasses: ScheduleClass[];
}

const dayOrder = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

export const TeacherScheduleModal = ({ isOpen, onClose, scheduleClasses }: TeacherScheduleModalProps) => {
  // Group classes by day
  const classesByDay = dayOrder.reduce((acc, day) => {
    acc[day] = scheduleClasses.filter(cls => 
      cls.days.map(d => d.toLowerCase()).includes(day)
    ).sort((a, b) => a.time_start.localeCompare(b.time_start));
    return acc;
  }, {} as Record<string, ScheduleClass[]>);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto bg-slate-800 border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-2xl text-white flex items-center gap-2">
            <Clock className="w-6 h-6 text-orange-400" />
            My Weekly Schedule
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 mt-4">
          {dayOrder.map(day => {
            const dayClasses = classesByDay[day];
            if (dayClasses.length === 0) return null;
            
            return (
              <div key={day}>
                <h3 className="text-lg font-semibold text-white capitalize mb-3 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-orange-400"></div>
                  {day}
                  <span className="text-sm text-slate-400 font-normal">
                    ({dayClasses.length} {dayClasses.length === 1 ? 'class' : 'classes'})
                  </span>
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {dayClasses.map(cls => (
                    <Card key={`${cls.id}-${day}`} className="bg-slate-700/50 border-slate-600 hover:border-orange-400/50 transition-all">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="font-semibold text-white flex items-center gap-2">
                              <BookOpen className="w-4 h-4 text-orange-400" />
                              {cls.name}
                            </div>
                            <div className="text-sm text-slate-300">{cls.subject}</div>
                            <div className="text-xs text-slate-400">{cls.grade_level}</div>
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between pt-3 border-t border-slate-600/50">
                          <div className="flex items-center gap-1 text-sm font-medium text-orange-400">
                            <Clock className="w-4 h-4" />
                            {cls.time_start} - {cls.time_end}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-slate-400">
                            <Users className="w-3 h-3" />
                            {cls.student_count} students
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
          
          {scheduleClasses.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <Clock className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>No classes scheduled yet</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
