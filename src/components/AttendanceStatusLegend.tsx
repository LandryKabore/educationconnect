import { HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

export function AttendanceStatusLegend() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-300 transition-colors">
            <HelpCircle className="w-4 h-4" />
            <span>How is attendance calculated?</span>
          </button>
        </TooltipTrigger>
        <TooltipContent 
          side="bottom" 
          className="max-w-md p-4 bg-slate-800 border-slate-600"
          sideOffset={5}
        >
          <div className="space-y-3">
            <h4 className="font-semibold text-white mb-2">Attendance Rate Calculation</h4>
            
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Badge className="bg-green-500 hover:bg-green-500">Present</Badge>
                  <span className="text-slate-300">Counts toward attendance</span>
                </div>
                <span className="text-green-400 font-medium">✓</span>
              </div>
              
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Badge className="bg-yellow-500 hover:bg-yellow-500">Late</Badge>
                  <span className="text-slate-300">Counts toward attendance</span>
                </div>
                <span className="text-green-400 font-medium">✓</span>
              </div>
              
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">Excused</Badge>
                  <span className="text-slate-300">Counts toward attendance</span>
                </div>
                <span className="text-green-400 font-medium">✓</span>
              </div>
              
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Badge variant="destructive">Absent</Badge>
                  <span className="text-slate-300">Does NOT count</span>
                </div>
                <span className="text-red-400 font-medium">✗</span>
              </div>
            </div>
            
            <div className="pt-2 mt-2 border-t border-slate-700">
              <p className="text-xs text-slate-400">
                <strong>Formula:</strong> Attendance Rate = (Present + Late + Excused) ÷ Total Days × 100%
              </p>
            </div>
            
            <div className="text-xs text-slate-400 italic">
              💡 Excused absences (doctor appointments, family emergencies, etc.) do not negatively impact attendance rates.
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
