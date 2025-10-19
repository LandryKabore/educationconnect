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
import { Calendar, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";

interface CreateAcademicYearModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  selectedSchoolId?: string | null;
}

export function CreateAcademicYearModal({ isOpen, onClose, onSuccess, selectedSchoolId }: CreateAcademicYearModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [schools, setSchools] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    name: "",
    start_date: "",
    end_date: "",
    school_id: selectedSchoolId || "",
    active: false
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
      // Check if user is super admin
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: isSuperAdmin } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'super_admin')
        .eq('active', true)
        .maybeSingle();

      let query = supabase
        .from('schools')
        .select('id, name')
        .eq('active', true)
        .order('name');

      // If not super admin, filter by schools this admin manages
      if (!isSuperAdmin) {
        const { data: adminSchools } = await supabase
          .from('user_roles')
          .select('school_id')
          .eq('user_id', user.id)
          .eq('role', 'school_admin')
          .eq('active', true);

        const schoolIds = adminSchools?.map(r => r.school_id).filter(Boolean) || [];
        if (schoolIds.length > 0) {
          query = query.in('id', schoolIds);
        } else {
          // No schools accessible
          setSchools([]);
          return;
        }
      }

      const { data, error } = await query;

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
    if (!formData.name || !formData.start_date || !formData.end_date || !formData.school_id) {
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
        .from('academic_years')
        .insert([{
          name: formData.name,
          start_date: formData.start_date,
          end_date: formData.end_date,
          school_id: formData.school_id,
          active: formData.active
        }]);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Academic year created successfully"
      });
      
      handleClose();
      onSuccess();
    } catch (error) {
      console.error('Error creating academic year:', error);
      toast({
        title: "Error",
        description: "Failed to create academic year",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      name: "",
      start_date: "",
      end_date: "",
      school_id: selectedSchoolId || "",
      active: false
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Create Academic Year
          </DialogTitle>
          <DialogDescription>
            Create a new academic year for the selected school.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Academic Year Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., 2024-2025"
              required
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start_date">Start Date *</Label>
              <Input
                id="start_date"
                type="date"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="end_date">End Date *</Label>
              <Input
                id="end_date"
                type="date"
                value={formData.end_date}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="active"
              checked={formData.active}
              onCheckedChange={(checked) => setFormData({ ...formData, active: checked })}
            />
            <Label htmlFor="active">Set as active academic year</Label>
          </div>

          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Academic Year
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}