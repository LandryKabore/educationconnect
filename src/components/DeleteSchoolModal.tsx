import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle } from "lucide-react";

interface School {
  id: string;
  name: string;
}

interface DeleteSchoolModalProps {
  isOpen: boolean;
  onClose: () => void;
  school: School | null;
  onSuccess: () => void;
}

export function DeleteSchoolModal({ isOpen, onClose, school, onSuccess }: DeleteSchoolModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");

  const expectedConfirmText = school ? `DELETE ${school.name}` : "";

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!school || !password || confirmText !== expectedConfirmText) return;
    
    setLoading(true);
    try {
      // Verify admin password by attempting to sign in
      const { data: currentUser } = await supabase.auth.getUser();
      if (!currentUser.user?.email) throw new Error("No authenticated user");

      const { error: authError } = await supabase.auth.signInWithPassword({
        email: currentUser.user.email,
        password: password,
      });

      if (authError) throw new Error("Invalid password");

      // Check if school has related data
      const [campusesCheck, classSectionsCheck, academicYearsCheck] = await Promise.all([
        supabase.from('campuses').select('id').eq('school_id', school.id).limit(1),
        supabase.from('class_sections').select('id').eq('school_id', school.id).limit(1),
        supabase.from('academic_years').select('id').eq('school_id', school.id).limit(1),
      ]);

      const hasRelatedData = 
        campusesCheck.data?.length || 
        classSectionsCheck.data?.length || 
        academicYearsCheck.data?.length;

      if (hasRelatedData) {
        throw new Error("Cannot delete school with existing campuses, class sections, or academic years. Please remove them first.");
      }

      // Delete the school
      const { error } = await supabase
        .from('schools')
        .delete()
        .eq('id', school.id);

      if (error) throw error;

      toast({
        title: "School Deleted",
        description: `${school.name} has been permanently deleted.`,
      });
      onSuccess();
      onClose();
      setPassword("");
      setConfirmText("");
    } catch (error: any) {
      console.error('Error deleting school:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete school.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setPassword("");
    setConfirmText("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="bg-slate-900 border-slate-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-red-400 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Delete School
          </DialogTitle>
          <DialogDescription className="text-slate-300">
            This action cannot be undone. This will permanently delete the school and all associated data.
          </DialogDescription>
        </DialogHeader>

        {school && (
          <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 mb-4">
            <p className="text-red-300 text-sm">
              You are about to delete: <span className="font-semibold">{school.name}</span>
            </p>
          </div>
        )}

        <form onSubmit={handleDelete} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="confirm" className="text-slate-200">
              Type <span className="font-mono bg-slate-800 px-1 rounded">{expectedConfirmText}</span> to confirm:
            </Label>
            <Input
              id="confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="bg-slate-800 border-slate-600 text-white"
              placeholder={expectedConfirmText}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-slate-200">
              Enter your password to confirm:
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-slate-800 border-slate-600 text-white"
              placeholder="Your admin password"
              required
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              className="flex-1 border-slate-600 text-slate-200"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !password || confirmText !== expectedConfirmText}
              className="flex-1 bg-red-600 hover:bg-red-700"
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete School
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}