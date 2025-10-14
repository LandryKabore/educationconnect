import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GraduationCap } from "lucide-react";

interface Teacher {
  profiles?: {
    first_name?: string;
    last_name?: string;
  };
  subjects?: {
    name?: string;
    code?: string;
  };
}

interface AllTeachersModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teachers: Teacher[];
}

export const AllTeachersModal = ({ open, onOpenChange, teachers }: AllTeachersModalProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-white text-2xl">Your Teachers ({teachers.length})</DialogTitle>
          <DialogDescription className="text-slate-400">
            All professors teaching in your class
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-3 mt-4">
          {teachers.length > 0 ? teachers.map((teacher, index) => (
            <div key={index} className="p-4 bg-slate-800/60 rounded-lg border border-slate-700/50 hover:border-slate-600/50 transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-purple-500/20 rounded-lg">
                    <GraduationCap className="w-6 h-6 text-purple-400" />
                  </div>
                  <div>
                    <div className="font-semibold text-white text-lg">
                      {teacher.profiles?.first_name && teacher.profiles?.last_name 
                        ? `${teacher.profiles.first_name} ${teacher.profiles.last_name}`
                        : 'Teacher Name Not Available'
                      }
                    </div>
                    <div className="text-sm text-slate-300">
                      {teacher.subjects?.name} {teacher.subjects?.code && `(${teacher.subjects.code})`}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )) : (
            <div className="p-8 text-center">
              <p className="text-slate-400">No teachers assigned yet</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
