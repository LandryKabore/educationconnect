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
import { BookOpen, Loader2, List } from "lucide-react";

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
    names: "",
    school_id: selectedSchoolId || ""
  });
  const [parsedSubjects, setParsedSubjects] = useState<Array<{name: string, coefficient: number}>>([]);

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
    
    if (parsedSubjects.length === 0 || !formData.school_id) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const subjectsToInsert = parsedSubjects.map(subject => ({
        name: subject.name,
        school_id: formData.school_id,
        coefficient: subject.coefficient
      }));

      const { error } = await supabase
        .from('subjects')
        .insert(subjectsToInsert);

      if (error) throw error;

      toast({
        title: "Success",
        description: `${parsedSubjects.length} subject${parsedSubjects.length > 1 ? 's' : ''} created successfully`
      });
      
      handleClose();
      onSuccess();
    } catch (error) {
      console.error('Error creating subjects:', error);
      toast({
        title: "Error",
        description: "Failed to create subjects",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      names: "",
      school_id: selectedSchoolId || ""
    });
    setParsedSubjects([]);
    onClose();
  };

  const parseSubjectNames = (input: string) => {
    const names = input.split(',').map(name => name.trim()).filter(name => name.length > 0);
    const subjects = names.map(name => ({
      name,
      coefficient: 1.0
    }));
    setParsedSubjects(subjects);
  };

  const handleNamesChange = (value: string) => {
    setFormData({ ...formData, names: value });
    parseSubjectNames(value);
  };

  const updateSubjectCoefficient = (index: number, coefficient: number) => {
    setParsedSubjects(prev => prev.map((subject, idx) => 
      idx === index ? { ...subject, coefficient } : subject
    ));
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
            Create one or more subjects. Separate multiple subjects with commas.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="names">Subject Names *</Label>
              <Textarea
                id="names"
                value={formData.names}
                onChange={(e) => handleNamesChange(e.target.value)}
                placeholder="e.g., Mathematics, Physics, Chemistry, English"
                className="min-h-[80px]"
                required
              />
              <p className="text-xs text-muted-foreground">
                Separate multiple subjects with commas. Each will have a default coefficient of 1.0.
              </p>
            </div>

            {parsedSubjects.length > 0 && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <List className="w-4 h-4" />
                  Subjects to Create ({parsedSubjects.length})
                </Label>
                <div className="border rounded-md p-3 space-y-2 max-h-64 overflow-y-auto bg-muted/30">
                  {parsedSubjects.map((subject, idx) => (
                    <div key={idx} className="flex items-center gap-3 py-1">
                      <div className="flex-1">
                        <span className="text-sm font-medium">{subject.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`coefficient-${idx}`} className="text-xs text-muted-foreground whitespace-nowrap">
                          Coefficient:
                        </Label>
                        <Input
                          id={`coefficient-${idx}`}
                          type="number"
                          step="0.1"
                          min="0.1"
                          max="10.0"
                          value={subject.coefficient}
                          onChange={(e) => updateSubjectCoefficient(idx, parseFloat(e.target.value) || 1.0)}
                          className="w-20 h-8 text-sm"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

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