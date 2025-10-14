import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "lucide-react";
import { getCountdown } from "@/utils/countdownHelpers";

interface Assignment {
  id: string;
  title: string;
  subject: string;
  due_date: string;
  due_date_formatted: string;
  type: string;
}

interface StudyCalendarModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignments: Assignment[];
}

export const StudyCalendarModal = ({ open, onOpenChange, assignments }: StudyCalendarModalProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-white text-2xl flex items-center gap-2">
            <Calendar className="w-6 h-6 text-red-400" />
            Study Calendar ({assignments.length})
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            All your upcoming assignments and exams
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-3 mt-4">
          {assignments.length > 0 ? assignments.map((assignment) => {
            const dueDate = new Date(assignment.due_date);
            const countdown = getCountdown(dueDate);
            
            return (
              <div key={assignment.id} className="p-4 bg-slate-800/60 rounded-lg border border-slate-700/50 hover:border-slate-600/50 transition-all">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold text-white text-lg truncate">{assignment.title}</h3>
                      <Badge 
                        variant="outline" 
                        className={`text-xs whitespace-nowrap ${
                          countdown.overdue 
                            ? 'bg-red-500/20 text-red-400 border-red-500/30' 
                            : countdown.urgent 
                              ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                              : 'bg-green-500/20 text-green-400 border-green-500/30'
                        }`}
                      >
                        {countdown.display}
                      </Badge>
                    </div>
                    
                    <div className="flex flex-wrap gap-3 text-sm text-slate-300">
                      <div className="flex items-center gap-1">
                        <span className="text-slate-500">Subject:</span>
                        <span className="font-medium">{assignment.subject}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-slate-500">Type:</span>
                        <span className="font-medium">{assignment.type === 'exam' ? 'Exam' : 'Assignment'}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-slate-500">Due:</span>
                        <span className="font-medium">{assignment.due_date_formatted}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          }) : (
            <div className="p-8 text-center">
              <p className="text-slate-400">No upcoming tasks</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
