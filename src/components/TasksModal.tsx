import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { CheckSquare, Clock, AlertCircle } from "lucide-react";
import { format } from "date-fns";

interface Task {
  id: string;
  title: string;
  description: string | null;
  due_date: string;
  priority: string;
  status: string;
  completed_at: string | null;
}

interface TasksModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tasks: Task[];
  onTaskUpdate: () => void;
}

export function TasksModal({ open, onOpenChange, tasks, onTaskUpdate }: TasksModalProps) {
  const handleCompleteTask = async (taskId: string) => {
    try {
      const { error } = await supabase
        .from("teacher_tasks")
        .update({
          status: "completed",
          completed_at: new Date().toISOString()
        })
        .eq("id", taskId);

      if (error) throw error;

      toast({
        title: "Task Completed",
        description: "Task marked as completed successfully."
      });

      onTaskUpdate();
    } catch (error) {
      console.error("Error completing task:", error);
      toast({
        title: "Error",
        description: "Failed to complete task.",
        variant: "destructive"
      });
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "bg-red-500/20 text-red-400 border-red-500/50";
      case "high":
        return "bg-orange-500/20 text-orange-400 border-orange-500/50";
      case "normal":
        return "bg-blue-500/20 text-blue-400 border-blue-500/50";
      case "low":
        return "bg-gray-500/20 text-gray-400 border-gray-500/50";
      default:
        return "bg-gray-500/20 text-gray-400 border-gray-500/50";
    }
  };

  const isUrgent = (dueDate: string) => {
    const now = new Date();
    const due = new Date(dueDate);
    const diffHours = (due.getTime() - now.getTime()) / (1000 * 60 * 60);
    return diffHours > 0 && diffHours <= 24;
  };

  const isOverdue = (dueDate: string) => {
    return new Date(dueDate) < new Date();
  };

  const pendingTasks = tasks.filter(task => task.status === "pending");
  const completedTasks = tasks.filter(task => task.status === "completed");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-orange-400" />
            All Tasks
          </DialogTitle>
          <DialogDescription>
            Manage your pending and completed tasks
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Pending Tasks */}
          <div>
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Pending Tasks ({pendingTasks.length})
            </h3>
            <div className="space-y-3">
              {pendingTasks.length > 0 ? pendingTasks.map((task) => (
                <div 
                  key={task.id} 
                  className={`p-4 bg-muted/50 rounded-lg border ${
                    isOverdue(task.due_date) ? 'border-red-500/50' : 
                    isUrgent(task.due_date) ? 'border-orange-500/50' : 
                    'border-border'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="font-medium mb-1">{task.title}</div>
                      {task.description && (
                        <div className="text-sm text-muted-foreground mb-2">{task.description}</div>
                      )}
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        Due: {format(new Date(task.due_date), "MMM d, yyyy 'at' h:mm a")}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Badge className={getPriorityColor(task.priority)}>
                        {task.priority}
                      </Badge>
                      {isUrgent(task.due_date) && !isOverdue(task.due_date) && (
                        <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/50">
                          <AlertCircle className="w-3 h-3 mr-1" />
                          Urgent
                        </Badge>
                      )}
                      {isOverdue(task.due_date) && (
                        <Badge className="bg-red-500/20 text-red-400 border-red-500/50">
                          <AlertCircle className="w-3 h-3 mr-1" />
                          Overdue
                        </Badge>
                      )}
                      <Button 
                        size="sm" 
                        onClick={() => handleCompleteTask(task.id)}
                        className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white border-0"
                      >
                        Complete
                      </Button>
                    </div>
                  </div>
                </div>
              )) : (
                <div className="p-4 text-center text-muted-foreground">
                  No pending tasks
                </div>
              )}
            </div>
          </div>

          {/* Completed Tasks */}
          {completedTasks.length > 0 && (
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-green-500" />
                Completed Tasks ({completedTasks.length})
              </h3>
              <div className="space-y-3">
                {completedTasks.map((task) => (
                  <div key={task.id} className="p-4 bg-muted/30 rounded-lg border border-border opacity-60">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="font-medium mb-1 line-through">{task.title}</div>
                        {task.description && (
                          <div className="text-sm text-muted-foreground mb-2">{task.description}</div>
                        )}
                        <div className="text-sm text-muted-foreground">
                          Completed: {task.completed_at && format(new Date(task.completed_at), "MMM d, yyyy 'at' h:mm a")}
                        </div>
                      </div>
                      <Badge className="bg-green-500/20 text-green-400 border-green-500/50">
                        <CheckSquare className="w-3 h-3 mr-1" />
                        Done
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}