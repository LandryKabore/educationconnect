import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { Users } from "lucide-react";

interface Parent {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
}

interface ParentSelectorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectParent: (parentId: string, parentName: string) => void;
}

export const ParentSelectorModal = ({
  open,
  onOpenChange,
  onSelectParent,
}: ParentSelectorModalProps) => {
  const [parents, setParents] = useState<Parent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open) {
      fetchParents();
    }
  }, [open]);

  const fetchParents = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get all students taught by this teacher
      const { data: teachingData } = await supabase
        .from("teaching_assignments")
        .select("class_section_id")
        .eq("teacher_user_id", user.id);

      if (!teachingData || teachingData.length === 0) {
        setParents([]);
        return;
      }

      const classSectionIds = teachingData.map((t) => t.class_section_id);

      // Get students in those classes
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("student_user_id")
        .in("class_section_id", classSectionIds);

      if (!enrollments || enrollments.length === 0) {
        setParents([]);
        return;
      }

      const studentIds = enrollments.map((e) => e.student_user_id);

      // Get parents of those students
      const { data: parentLinks } = await supabase
        .from("parent_student_links")
        .select("parent_user_id")
        .in("student_user_id", studentIds)
        .eq("status", "active")
        .not("parent_user_id", "is", null);

      if (!parentLinks || parentLinks.length === 0) {
        setParents([]);
        return;
      }

      const parentIds = [...new Set(parentLinks.map((p) => p.parent_user_id))];

      // Get parent profiles
      const { data: parentProfiles } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, email")
        .in("user_id", parentIds)
        .eq("role", "parent");

      setParents(parentProfiles || []);
    } catch (error) {
      console.error("Error fetching parents:", error);
      setParents([]);
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Select Parent to Message
          </DialogTitle>
          <DialogDescription>
            Choose a parent from your students to send a message
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[400px]">
          {loading ? (
            <div className="p-6 text-center text-muted-foreground">
              Loading parents...
            </div>
          ) : parents.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              No parents found for your students
            </div>
          ) : (
            <div className="space-y-2 p-2">
              {parents.map((parent) => (
                <div
                  key={parent.user_id}
                  onClick={() =>
                    onSelectParent(
                      parent.user_id,
                      `${parent.first_name} ${parent.last_name}`
                    )
                  }
                  className="p-4 rounded-lg border hover:bg-accent cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="w-10 h-10">
                      <AvatarFallback>
                        {getInitials(parent.first_name, parent.last_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold truncate">
                        {parent.first_name} {parent.last_name}
                      </h4>
                      <p className="text-sm text-muted-foreground truncate">
                        {parent.email}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
