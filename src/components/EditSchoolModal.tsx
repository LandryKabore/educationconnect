import { useState, useEffect } from "react";
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
import { Loader2 } from "lucide-react";

interface School {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  country?: string;
}

interface EditSchoolModalProps {
  isOpen: boolean;
  onClose: () => void;
  school: School | null;
  onSuccess: () => void;
}

export function EditSchoolModal({ isOpen, onClose, school, onSuccess }: EditSchoolModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    phone: "",
    email: "",
    country: "",
  });

  useEffect(() => {
    if (school) {
      setFormData({
        name: school.name || "",
        address: school.address || "",
        phone: school.phone || "",
        email: school.email || "",
        country: school.country || "",
      });
    }
  }, [school]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!school) return;
    
    setLoading(true);
    try {
      const { error } = await supabase
        .from('schools')
        .update({
          name: formData.name,
          address: formData.address || null,
          phone: formData.phone || null,
          email: formData.email || null,
          country: formData.country || null,
        })
        .eq('id', school.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "School updated successfully.",
      });
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error updating school:', error);
      toast({
        title: "Error",
        description: "Failed to update school.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Edit School</DialogTitle>
          <DialogDescription className="text-slate-300">
            Update school information
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-slate-200">School Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => handleInputChange("name", e.target.value)}
              className="bg-slate-800 border-slate-600 text-white"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="address" className="text-slate-200">Address</Label>
            <Textarea
              id="address"
              value={formData.address}
              onChange={(e) => handleInputChange("address", e.target.value)}
              className="bg-slate-800 border-slate-600 text-white"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone" className="text-slate-200">Phone</Label>
            <Input
              id="phone"
              value={formData.phone}
              onChange={(e) => handleInputChange("phone", e.target.value)}
              className="bg-slate-800 border-slate-600 text-white"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="text-slate-200">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange("email", e.target.value)}
              className="bg-slate-800 border-slate-600 text-white"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="country" className="text-slate-200">Country</Label>
            <Input
              id="country"
              value={formData.country}
              onChange={(e) => handleInputChange("country", e.target.value)}
              className="bg-slate-800 border-slate-600 text-white"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1 border-slate-600 text-slate-200"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !formData.name.trim()}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Update School
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}