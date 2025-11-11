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
  // Sort classes by start time
  const sortedClasses = [...scheduleClasses].sort((a, b) => 
    a.time_start.localeCompare(b.time_start)
  );

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
                  <TableHead className="border border-slate-600 font-bold text-white w-48">
                    CLASS / TIME
                  </TableHead>
                  {dayOrder.map(day => (
                    <TableHead key={day} className="border border-slate-600 font-bold text-white text-center capitalize">
                      {day.slice(0, 3)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedClasses.map((cls) => (
                  <TableRow key={cls.id} className="hover:bg-slate-700/30">
                    <TableCell className="border border-slate-600 bg-slate-700/30 align-middle py-4">
                      <div className="flex items-start gap-2">
                        <BookOpen className="w-4 h-4 text-orange-400 flex-shrink-0 mt-1" />
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-white text-sm">
                            {cls.name}
                          </div>
                          <div className="text-xs text-slate-300">
                            {cls.subject}
                          </div>
                          <div className="text-xs text-slate-400 mt-1">
                            {cls.grade_level}
                          </div>
                          <div className="text-xs text-orange-400 mt-2 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {cls.time_start} - {cls.time_end}
                          </div>
                          <div className="text-xs text-slate-400 mt-1">
                            {cls.student_count} students
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    {dayOrder.map(day => {
                      const hasClass = cls.days.map(d => d.toLowerCase()).includes(day);
                      return (
                        <TableCell key={day} className="border border-slate-600 text-center align-middle">
                          {hasClass ? (
                            <div className="bg-gradient-to-br from-orange-500/20 to-orange-600/10 border border-orange-500/30 rounded-md py-2 px-1">
                              <div className="text-xs text-orange-400 font-semibold">
                                {cls.time_start}
                              </div>
                            </div>
                          ) : null}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
