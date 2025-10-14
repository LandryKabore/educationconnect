import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Calendar, Clock } from "lucide-react";
import { ChildExam } from "@/hooks/useParentData";

interface ParentCalendarModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tasks: ChildExam[];
  studentName: string;
}

export const ParentCalendarModal = ({ open, onOpenChange, tasks, studentName }: ParentCalendarModalProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            Upcoming Tasks - {studentName}
          </DialogTitle>
          <DialogDescription>
            All upcoming exams and assignments
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-4">
          {tasks.length > 0 ? (
            tasks.map((task) => (
              <Card key={task.id} className="p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold text-lg">{task.topic}</h3>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        task.type === 'exam' 
                          ? 'bg-red-500/20 text-red-700 dark:text-red-400 border border-red-500/30' 
                          : 'bg-blue-500/20 text-blue-700 dark:text-blue-400 border border-blue-500/30'
                      }`}>
                        {task.type === 'exam' ? 'Exam' : 'Assignment'}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground mb-1">
                      <span className="font-medium">{task.subject}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        <span>{task.date}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        <span>{task.time}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            ))
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No upcoming tasks</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
