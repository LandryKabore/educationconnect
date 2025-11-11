import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Clock, BookOpen } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
  // Extract unique time slots and sort them
  const timeSlots = Array.from(
    new Set(scheduleClasses.map(cls => `${cls.time_start}-${cls.time_end}`))
  ).sort();

  // Create a map of time slot + day to classes
  const scheduleGrid: Record<string, ScheduleClass | null> = {};
  scheduleClasses.forEach(cls => {
    const timeKey = `${cls.time_start}-${cls.time_end}`;
    cls.days.forEach(day => {
      const key = `${timeKey}-${day.toLowerCase()}`;
      scheduleGrid[key] = cls;
    });
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-hidden bg-slate-800 border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-2xl text-white flex items-center gap-2">
            <Clock className="w-6 h-6 text-orange-400" />
            My Weekly Schedule
          </DialogTitle>
        </DialogHeader>
        
        <div className="overflow-auto max-h-[calc(90vh-120px)] mt-4">
          {scheduleClasses.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Clock className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>No classes scheduled yet</p>
            </div>
          ) : (
            <Table className="border-collapse">
              <TableHeader>
                <TableRow className="bg-slate-700/50 hover:bg-slate-700/50">
                  {dayOrder.map(day => (
                    <TableHead key={day} className="border border-slate-600 font-bold text-white text-center capitalize">
                      {day}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {timeSlots.map(timeSlot => {
                  return (
                    <TableRow key={timeSlot} className="hover:bg-slate-700/30">
                      {dayOrder.map(day => {
                        const key = `${timeSlot}-${day}`;
                        const classData = scheduleGrid[key];
                        
                        return (
                          <TableCell key={key} className="border border-slate-600 p-2 align-top">
                            {classData ? (
                              <div className="bg-gradient-to-br from-orange-500/20 to-orange-600/10 border border-orange-500/30 rounded-md p-3 hover:border-orange-400/50 transition-colors">
                                <div className="flex items-start gap-2 mb-2">
                                  <BookOpen className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
                                  <div className="flex-1 min-w-0">
                                    <div className="font-semibold text-white text-sm truncate">
                                      {classData.name}
                                    </div>
                                    <div className="text-xs text-slate-300 truncate">
                                      {classData.subject}
                                    </div>
                                    <div className="text-xs text-slate-400 mt-1">
                                      {classData.grade_level}
                                    </div>
                                    <div className="text-xs text-slate-400 mt-1">
                                      {classData.student_count} students
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 text-xs text-orange-400 font-medium border-t border-orange-500/20 pt-2">
                                  <Clock className="w-3 h-3" />
                                  {classData.time_start} - {classData.time_end}
                                </div>
                              </div>
                            ) : null}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
