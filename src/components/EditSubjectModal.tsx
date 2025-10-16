import React, { useState, useEffect } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, Loader2 } from "lucide-react";

interface EditSubjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  subject: any;
}

export function EditSubjectModal({ isOpen, onClose, onSuccess, subject }: EditSubjectModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    description: ""
  });

  useEffect(() => {
    if (subject && isOpen) {
      setFormData({
        name: subject.name || "",
        code: subject.code || "",
        description: subject.description || ""
      });
    }
  }, [subject, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) {
      toast({
        title: "Error",
        description: "Subject name is required",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('subjects')
        .update({
          name: formData.name,
          code: formData.code || null,
          description: formData.description || null
        })
        .eq('id', subject.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Subject updated successfully"
      });
      
      handleClose();
      onSuccess();
    } catch (error) {
      console.error('Error updating subject:', error);
      toast({
        title: "Error",
        description: "Failed to update subject",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      name: "",
      code: "",
      description: ""
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5" />
            Edit Subject
          </DialogTitle>
          <DialogDescription>
            Update the subject information below.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Subject Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Mathematics"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="code">Subject Code</Label>
            <Input
              id="code"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              placeholder="e.g., MATH101"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of the subject"
              rows={3}
            />
          </div>

          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Update Subject
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}