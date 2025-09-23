import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, BookOpen, Star } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Grade {
  student_id: string;
  assignment_id: string;
  points_earned: number;
  max_points: number;
  subject_name: string;
  percentage: number;
  grade_points: number;
  assignment_title: string;
  graded_at: string;
}

interface StudentGradesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StudentGradesModal({ open, onOpenChange }: StudentGradesModalProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [gpa, setGpa] = useState<number>(0);

  useEffect(() => {
    if (open) {
      fetchGrades();
      fetchGPA();
    }
  }, [open]);

  const fetchGrades = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase.rpc('get_student_grades', {
        student_user_id: user.id
      });

      if (error) throw error;
      setGrades(data || []);
    } catch (error) {
      console.error("Error fetching grades:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchGPA = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase.rpc('calculate_student_gpa', {
        student_user_id: user.id
      });

      if (error) throw error;
      setGpa(data || 0);
    } catch (error) {
      console.error("Error fetching GPA:", error);
    }
  };

  const getGradeColor = (percentage: number) => {
    if (percentage >= 90) return "bg-green-500";
    if (percentage >= 80) return "bg-blue-500";
    if (percentage >= 70) return "bg-yellow-500";
    if (percentage >= 60) return "bg-orange-500";
    return "bg-red-500";
  };

  const getLetterGrade = (percentage: number) => {
    if (percentage >= 90) return "A";
    if (percentage >= 80) return "B";
    if (percentage >= 70) return "C";
    if (percentage >= 60) return "D";
    return "F";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5" />
            {t('student.grades')}
          </DialogTitle>
          <DialogDescription>
            {t('student.gradesDescription')}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="ml-2">{t('loading')}</span>
          </div>
        ) : (
          <div className="space-y-6">
            {/* GPA Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Star className="w-5 h-5 text-yellow-500" />
                  {t('student.overallGPA')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-primary">
                  {gpa.toFixed(2)} / 4.0
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  {t('student.gpaDescription')}
                </p>
              </CardContent>
            </Card>

            {/* Grades List */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">{t('student.recentGrades')}</h3>
              {grades.length > 0 ? (
                <div className="grid gap-4">
                  {grades.map((grade, index) => (
                    <Card key={`${grade.assignment_id}-${index}`}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="font-medium">{grade.assignment_title}</h4>
                              <Badge variant="outline">{grade.subject_name}</Badge>
                            </div>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <span>{grade.points_earned} / {grade.max_points} {t('student.points')}</span>
                              <span>{new Date(grade.graded_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <div className="text-2xl font-bold">{grade.percentage.toFixed(1)}%</div>
                              <div className="text-sm text-muted-foreground">
                                {grade.grade_points.toFixed(1)} GPA
                              </div>
                            </div>
                            <Badge 
                              className={`${getGradeColor(grade.percentage)} text-white`}
                            >
                              {getLetterGrade(grade.percentage)}
                            </Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="p-8 text-center">
                    <BookOpen className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">{t('student.noGrades')}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}