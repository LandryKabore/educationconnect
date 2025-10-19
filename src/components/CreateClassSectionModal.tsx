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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Users, Loader2, BookOpen, List } from "lucide-react";

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
  const [subjects, setSubjects] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    names: "", // Changed to support comma-separated input
    capacity: "30",
    school_id: selectedSchoolId || "",
    campus_id: "",
    academic_year_id: "",
    selected_subjects: [] as string[]
  });
  const [parsedSections, setParsedSections] = useState<Array<{name: string, gradeLevel: string}>>([]);

  useEffect(() => {
    if (isOpen) {
      fetchSchools();
      if (selectedSchoolId) {
        setFormData(prev => ({ ...prev, school_id: selectedSchoolId }));
        fetchCampuses(selectedSchoolId);
        fetchAcademicYears(selectedSchoolId);
        fetchSubjects(selectedSchoolId);
      }
    }
  }, [isOpen, selectedSchoolId]);

  useEffect(() => {
    if (formData.school_id) {
      fetchCampuses(formData.school_id);
      fetchAcademicYears(formData.school_id);
      fetchSubjects(formData.school_id);
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

  const fetchSubjects = async (schoolId: string) => {
    try {
      const { data, error } = await supabase
        .from('subjects')
        .select('id, name, code')
        .eq('school_id', schoolId)
        .order('name');

      if (error) throw error;
      setSubjects(data || []);
    } catch (error) {
      console.error('Error fetching subjects:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (parsedSections.length === 0 || !formData.school_id || !formData.campus_id || !formData.academic_year_id) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    // Check if any section is missing a grade level
    const invalidSections = parsedSections.filter(s => !s.gradeLevel);
    if (invalidSections.length > 0) {
      toast({
        title: "Error",
        description: "Some class names couldn't be parsed. Please use format like 'Grade 6A'",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      // Create all class sections
      const sectionsToInsert = parsedSections.map(section => ({
        name: section.name,
        grade_level: section.gradeLevel,
        capacity: parseInt(formData.capacity),
        school_id: formData.school_id,
        campus_id: formData.campus_id,
        academic_year_id: formData.academic_year_id
      }));

      const { data: classSectionData, error: classSectionError } = await supabase
        .from('class_sections')
        .insert(sectionsToInsert)
        .select();

      if (classSectionError) throw classSectionError;

      // Then link the selected subjects to all class sections
      if (formData.selected_subjects.length > 0 && classSectionData) {
        const subjectLinks = classSectionData.flatMap(section => 
          formData.selected_subjects.map(subjectId => ({
            class_section_id: section.id,
            subject_id: subjectId
          }))
        );

        const { error: linkError } = await supabase
          .from('class_section_subjects')
          .insert(subjectLinks);

        if (linkError) throw linkError;
      }

      toast({
        title: "Success",
        description: `${parsedSections.length} class section${parsedSections.length > 1 ? 's' : ''} created successfully`
      });
      
      handleClose();
      onSuccess();
    } catch (error) {
      console.error('Error creating class sections:', error);
      toast({
        title: "Error",
        description: "Failed to create class sections",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      names: "",
      capacity: "30",
      school_id: selectedSchoolId || "",
      campus_id: "",
      academic_year_id: "",
      selected_subjects: []
    });
    setParsedSections([]);
    onClose();
  };

  const toggleSubject = (subjectId: string) => {
    setFormData(prev => ({
      ...prev,
      selected_subjects: prev.selected_subjects.includes(subjectId)
        ? prev.selected_subjects.filter(id => id !== subjectId)
        : [...prev.selected_subjects, subjectId]
    }));
  };

  const extractGradeLevel = (className: string): string => {
    // Extract "Grade X" from inputs like "Grade 6A", "Grade 10B", etc.
    const match = className.match(/^Grade\s*(\d+)/i);
    if (match) {
      return `Grade ${match[1]}`;
    }
    return "";
  };

  const formatClassName = (value: string): string => {
    // Remove extra spaces and trim
    const cleaned = value.trim().replace(/\s+/g, ' ');
    
    // Match pattern: "Grade [number] [letter]" or "Grade[number][letter]"
    const match = cleaned.match(/^grade\s*(\d+)\s*([a-z]?)$/i);
    
    if (match) {
      const [, number, letter] = match;
      return `Grade ${number}${letter.toUpperCase()}`;
    }
    
    // If no match, just return cleaned value with proper capitalization for "Grade"
    return cleaned.replace(/^grade\s*/i, 'Grade ');
  };

  const parseClassNames = (input: string) => {
    // Split by comma and process each class name
    const names = input.split(',').map(name => name.trim()).filter(name => name.length > 0);
    const sections = names.map(name => {
      const formatted = formatClassName(name);
      const gradeLevel = extractGradeLevel(formatted);
      return { name: formatted, gradeLevel };
    });
    setParsedSections(sections);
  };

  const handleNamesChange = (value: string) => {
    setFormData({ ...formData, names: value });
    parseClassNames(value);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Create Class Section
          </DialogTitle>
          <DialogDescription>
            Create one or more class sections. Separate multiple sections with commas.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="names">Class Section Names *</Label>
                <Textarea
                  id="names"
                  value={formData.names}
                  onChange={(e) => handleNamesChange(e.target.value)}
                  placeholder="e.g., Grade 6A, Grade 6B, Grade 7A"
                  className="min-h-[80px]"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Separate multiple sections with commas. Grade levels will be auto-detected.
                </p>
              </div>

              {parsedSections.length > 0 && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <List className="w-4 h-4" />
                    Sections to Create ({parsedSections.length})
                  </Label>
                  <div className="border rounded-md p-3 space-y-1 max-h-32 overflow-y-auto bg-muted/30">
                    {parsedSections.map((section, idx) => (
                      <div key={idx} className="text-sm flex justify-between items-center py-1">
                        <span className="font-medium">{section.name}</span>
                        <span className="text-muted-foreground text-xs">{section.gradeLevel || '⚠️ Invalid'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
            </div>

            <div className="space-y-4">
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
            </div>
          </div>

          <div className="border-t pt-6">
            <div className="flex items-center gap-2 mb-4">
              <BookOpen className="w-4 h-4" />
              <Label className="text-sm font-medium">Subjects for this Class</Label>
            </div>
            
            <div className="max-h-64 overflow-y-auto">
              {subjects.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {subjects.map((subject) => (
                    <div key={subject.id} className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                      <Checkbox
                        id={subject.id}
                        checked={formData.selected_subjects.includes(subject.id)}
                        onCheckedChange={() => toggleSubject(subject.id)}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <Label htmlFor={subject.id} className="text-sm font-medium cursor-pointer block">
                          {subject.name} {subject.code && `(${subject.code})`}
                        </Label>
                        {(subject.schedule_days || subject.schedule_time_start) && (
                          <div className="text-xs text-muted-foreground mt-1 space-y-1">
                            {subject.schedule_days && subject.schedule_days.length > 0 && (
                              <div>{subject.schedule_days.join(', ')}</div>
                            )}
                            {subject.schedule_time_start && subject.schedule_time_end && (
                              <div>
                                {subject.schedule_time_start} - {subject.schedule_time_end}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {formData.school_id ? "No subjects found for this school. Create subjects first." : "Select a school to see available subjects."}
                </p>
              )}
            </div>
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