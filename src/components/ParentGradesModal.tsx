import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { TrendingUp, Calendar } from "lucide-react";
import { ChildGrade } from "@/hooks/useParentData";

interface ParentGradesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  grades: ChildGrade[];
  studentName: string;
  overallGrade: string;
}

export const ParentGradesModal = ({ open, onOpenChange, grades, studentName, overallGrade }: ParentGradesModalProps) => {
  const getGradeColor = (grade: string) => {
    if (grade.startsWith('A')) return 'text-green-600 dark:text-green-400';
    if (grade.startsWith('B')) return 'text-blue-600 dark:text-blue-400';
    if (grade.startsWith('C')) return 'text-yellow-600 dark:text-yellow-400';
    if (grade.startsWith('D')) return 'text-orange-600 dark:text-orange-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getGradeBgColor = (grade: string) => {
    if (grade.startsWith('A')) return 'bg-green-500/10 border-green-500/30';
    if (grade.startsWith('B')) return 'bg-blue-500/10 border-blue-500/30';
    if (grade.startsWith('C')) return 'bg-yellow-500/10 border-yellow-500/30';
    if (grade.startsWith('D')) return 'bg-orange-500/10 border-orange-500/30';
    return 'bg-red-500/10 border-red-500/30';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            All Grades - {studentName}
          </DialogTitle>
          <DialogDescription>
            Complete academic performance record
          </DialogDescription>
        </DialogHeader>

        {/* Overall Grade Summary */}
        <Card className="p-6 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-2">Overall Grade</p>
            <p className={`text-4xl font-bold ${getGradeColor(overallGrade)}`}>{overallGrade}</p>
          </div>
        </Card>

        {/* Grades List */}
        <div className="space-y-3 mt-4">
          {grades.length > 0 ? (
            grades.map((grade) => (
              <Card key={grade.id} className="p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold">{grade.subject}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">{grade.assignment}</p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      <span>{grade.date}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className={`px-4 py-2 rounded-lg border font-bold text-lg ${getGradeBgColor(grade.grade)} ${getGradeColor(grade.grade)}`}>
                      {grade.grade}
                    </div>
                  </div>
                </div>
              </Card>
            ))
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No grades available yet</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
