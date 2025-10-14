import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { TeacherAssignment } from "@/hooks/useTeacherData";
import { getCountdown } from "@/utils/countdownHelpers";

interface AllAssignmentsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignments: TeacherAssignment[];
}

export const AllAssignmentsModal = ({ open, onOpenChange, assignments }: AllAssignmentsModalProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-white text-2xl">All Assignments ({assignments.length})</DialogTitle>
          <DialogDescription className="text-slate-400">
            View all your created assignments
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-3 mt-4">
          {assignments.length > 0 ? assignments.map((assignment) => {
            const dueDate = assignment.due_date ? new Date(assignment.due_date) : null;
            const countdown = dueDate ? getCountdown(dueDate) : null;
            
            return (
              <div key={assignment.id} className="p-4 bg-slate-800/60 rounded-lg border border-slate-700/50 hover:border-slate-600/50 transition-all">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold text-white text-lg truncate">{assignment.title}</h3>
                      {countdown && (
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
                      )}
                    </div>
                    
                    {assignment.description && (
                      <p className="text-sm text-slate-400 mb-2 line-clamp-2">{assignment.description}</p>
                    )}
                    
                    <div className="flex flex-wrap gap-3 text-sm text-slate-300">
                      <div className="flex items-center gap-1">
                        <span className="text-slate-500">Class:</span>
                        <span className="font-medium">{assignment.class_name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-slate-500">Subject:</span>
                        <span className="font-medium">{assignment.subject_name}</span>
                      </div>
                      {assignment.max_points && (
                        <div className="flex items-center gap-1">
                          <span className="text-slate-500">Points:</span>
                          <span className="font-medium">{assignment.max_points}</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex flex-wrap gap-3 text-xs text-slate-400 mt-2">
                      <div>Created: {assignment.formattedCreatedDate}</div>
                      {assignment.formattedDueDate && (
                        <div>Due: {assignment.formattedDueDate}</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          }) : (
            <div className="p-8 text-center">
              <p className="text-slate-400">No assignments created yet</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
