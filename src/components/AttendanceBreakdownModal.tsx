import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle2, XCircle, AlertCircle } from "lucide-react";

interface ClassAttendance {
  className: string;
  subjectName: string;
  presentDays: number;
  totalDays: number;
  percentage: number;
}

interface AttendanceBreakdownModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classAttendance: ClassAttendance[];
  overallPercentage: string;
  studentName: string;
}

export const AttendanceBreakdownModal = ({
  open,
  onOpenChange,
  classAttendance,
  overallPercentage,
  studentName,
}: AttendanceBreakdownModalProps) => {
  const getStatusColor = (percentage: number) => {
    if (percentage >= 90) return "text-green-500";
    if (percentage >= 75) return "text-yellow-500";
    return "text-red-500";
  };

  const getStatusIcon = (percentage: number) => {
    if (percentage >= 90) return <CheckCircle2 className="w-5 h-5 text-green-500" />;
    if (percentage >= 75) return <AlertCircle className="w-5 h-5 text-yellow-500" />;
    return <XCircle className="w-5 h-5 text-red-500" />;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-slate-800 border-slate-600">
        <DialogHeader>
          <DialogTitle className="text-xl text-white">Attendance Breakdown - {studentName}</DialogTitle>
          <DialogDescription className="text-slate-300">
            Overall Attendance: <span className="text-2xl font-bold text-green-400">{overallPercentage}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {classAttendance.length > 0 ? (
            classAttendance.map((item, index) => (
              <div
                key={index}
                className="p-4 bg-slate-700/50 rounded-xl border border-slate-600/50 hover:border-orange-500/50 transition-all"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex-1">
                    <div className="font-semibold text-white">{item.subjectName}</div>
                    <div className="text-sm text-slate-400">{item.className}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(item.percentage)}
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="text-sm text-slate-300">
                    <span className="font-medium">{item.presentDays}</span> present out of{" "}
                    <span className="font-medium">{item.totalDays}</span> days
                  </div>
                  <div className={`text-xl font-bold ${getStatusColor(item.percentage)}`}>
                    {item.percentage.toFixed(1)}%
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-3 w-full bg-slate-600 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      item.percentage >= 90
                        ? "bg-green-500"
                        : item.percentage >= 75
                        ? "bg-yellow-500"
                        : "bg-red-500"
                    }`}
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-slate-400">
              No attendance data available
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
