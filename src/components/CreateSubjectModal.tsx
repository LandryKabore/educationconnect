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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, Loader2 } from "lucide-react";

interface CreateSubjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  selectedSchoolId?: string | null;
}

export function CreateSubjectModal({ isOpen, onClose, onSuccess, selectedSchoolId }: CreateSubjectModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [schools, setSchools] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    description: "",
    school_id: selectedSchoolId || "",
    coefficient: "1.0"
  });

  useEffect(() => {
    if (isOpen) {
      fetchSchools();
      if (selectedSchoolId) {
        setFormData(prev => ({ ...prev, school_id: selectedSchoolId }));
      }
    }
  }, [isOpen, selectedSchoolId]);

  const fetchSchools = async () => {
    try {
      const { data, error } = await supabase
        .from('schools')
        .select('id, name')
        .eq('active', true)
        .order('name');

      if (error) throw error;
      setSchools(data || []);
    } catch (error) {
      console.error('Error fetching schools:', error);
      toast({
        title: "Error",
        description: "Failed to load schools",
        variant: "destructive"
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.school_id || !formData.coefficient) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('subjects')
        .insert([{
          name: formData.name,
          code: formData.code || null,
          description: formData.description || null,
          school_id: formData.school_id,
          coefficient: parseFloat(formData.coefficient)
        }]);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Subject created successfully"
      });
      
      handleClose();
      onSuccess();
    } catch (error) {
      console.error('Error creating subject:', error);
      toast({
        title: "Error",
        description: "Failed to create subject",
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
      description: "",
      school_id: selectedSchoolId || "",
      coefficient: "1.0"
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5" />
            Create Subject
          </DialogTitle>
          <DialogDescription>
            Create a new subject for the selected school.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
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
                <Label htmlFor="school">School *</Label>
                <Select
                  value={formData.school_id}
                  onValueChange={(value) => setFormData({ ...formData, school_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a school" />
                  </SelectTrigger>
                  <SelectContent>
                    {schools.map((school) => (
                      <SelectItem key={school.id} value={school.id}>
                        {school.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="coefficient">Subject Coefficient (Credit Hours) *</Label>
                <Input
                  id="coefficient"
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="10.0"
                  value={formData.coefficient}
                  onChange={(e) => setFormData({ ...formData, coefficient: e.target.value })}
                  placeholder="e.g., 1.0"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Used for calculating weighted GPA. Higher values have more impact on GPA.
                </p>
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
            </div>
          </div>

          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Subject
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}