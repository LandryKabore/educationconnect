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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Users, Loader2 } from "lucide-react";

interface CreateClassSectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  selectedSchoolId?: string | null;
}

export function CreateClassSectionModal({ isOpen, onClose, onSuccess, selectedSchoolId }: CreateClassSectionModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [schools, setSchools] = useState<any[]>([]);
  const [campuses, setCampuses] = useState<any[]>([]);
  const [academicYears, setAcademicYears] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    name: "",
    grade_level: "",
    capacity: "30",
    school_id: selectedSchoolId || "",
    campus_id: "",
    academic_year_id: ""
  });

  useEffect(() => {
    if (isOpen) {
      fetchSchools();
      if (selectedSchoolId) {
        setFormData(prev => ({ ...prev, school_id: selectedSchoolId }));
        fetchCampuses(selectedSchoolId);
        fetchAcademicYears(selectedSchoolId);
      }
    }
  }, [isOpen, selectedSchoolId]);

  useEffect(() => {
    if (formData.school_id) {
      fetchCampuses(formData.school_id);
      fetchAcademicYears(formData.school_id);
    }
  }, [formData.school_id]);

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
    }
  };

  const fetchCampuses = async (schoolId: string) => {
    try {
      const { data, error } = await supabase
        .from('campuses')
        .select('id, name')
        .eq('school_id', schoolId)
        .order('name');

      if (error) throw error;
      setCampuses(data || []);
    } catch (error) {
      console.error('Error fetching campuses:', error);
    }
  };

  const fetchAcademicYears = async (schoolId: string) => {
    try {
      const { data, error } = await supabase
        .from('academic_years')
        .select('id, name')
        .eq('school_id', schoolId)
        .order('name');

      if (error) throw error;
      setAcademicYears(data || []);
    } catch (error) {
      console.error('Error fetching academic years:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.grade_level || !formData.school_id || !formData.campus_id || !formData.academic_year_id) {
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
        .from('class_sections')
        .insert([{
          name: formData.name,
          grade_level: formData.grade_level,
          capacity: parseInt(formData.capacity),
          school_id: formData.school_id,
          campus_id: formData.campus_id,
          academic_year_id: formData.academic_year_id
        }]);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Class section created successfully"
      });
      
      handleClose();
      onSuccess();
    } catch (error) {
      console.error('Error creating class section:', error);
      toast({
        title: "Error",
        description: "Failed to create class section",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      name: "",
      grade_level: "",
      capacity: "30",
      school_id: selectedSchoolId || "",
      campus_id: "",
      academic_year_id: ""
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Create Class Section
          </DialogTitle>
          <DialogDescription>
            Create a new class section for the selected school.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Class Section Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Grade 7A"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="grade_level">Grade Level *</Label>
            <Input
              id="grade_level"
              value={formData.grade_level}
              onChange={(e) => setFormData({ ...formData, grade_level: e.target.value })}
              placeholder="e.g., Grade 7"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="school">School *</Label>
            <Select
              value={formData.school_id}
              onValueChange={(value) => setFormData({ ...formData, school_id: value, campus_id: "", academic_year_id: "" })}
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

          <div className="space-y-2">
            <Label htmlFor="campus">Campus *</Label>
            <Select
              value={formData.campus_id}
              onValueChange={(value) => setFormData({ ...formData, campus_id: value })}
              disabled={!formData.school_id}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a campus" />
              </SelectTrigger>
              <SelectContent>
                {campuses.map((campus) => (
                  <SelectItem key={campus.id} value={campus.id}>
                    {campus.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="academic_year">Academic Year *</Label>
            <Select
              value={formData.academic_year_id}
              onValueChange={(value) => setFormData({ ...formData, academic_year_id: value })}
              disabled={!formData.school_id}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an academic year" />
              </SelectTrigger>
              <SelectContent>
                {academicYears.map((year) => (
                  <SelectItem key={year.id} value={year.id}>
                    {year.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="capacity">Capacity</Label>
            <Input
              id="capacity"
              type="number"
              value={formData.capacity}
              onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
              min="1"
              max="100"
            />
          </div>

          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Class Section
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}