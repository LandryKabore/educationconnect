import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { User, Mail, Phone, Users } from "lucide-react";
import { Separator } from "@/components/ui/separator";

interface ChildInfo {
  id: string;
  name: string;
  class: string;
  grade_level: string;
}

interface ParentProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentInfo: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
  } | null;
  children: ChildInfo[];
}

export const ParentProfileModal = ({
  open,
  onOpenChange,
  parentInfo,
  children,
}: ParentProfileModalProps) => {
  if (!parentInfo) return null;

  const fullName = `${parentInfo.firstName} ${parentInfo.lastName}`;
  const initials = `${parentInfo.firstName[0]}${parentInfo.lastName[0]}`.toUpperCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-slate-800 border-slate-600">
        <DialogHeader>
          <DialogTitle className="text-xl text-white">Parent Profile</DialogTitle>
          <DialogDescription className="text-slate-300">
            View your account information
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Profile Avatar */}
          <div className="flex justify-center">
            <Avatar className="w-24 h-24 bg-gradient-to-br from-orange-500 to-red-500">
              <AvatarFallback className="text-white text-2xl font-bold bg-transparent">
                {initials}
              </AvatarFallback>
            </Avatar>
          </div>

          {/* Name */}
          <div className="text-center">
            <h3 className="text-2xl font-bold text-white">{fullName}</h3>
            <p className="text-sm text-slate-400 mt-1">Parent Account</p>
          </div>

          <Separator className="bg-slate-600" />

          {/* Contact Information */}
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-slate-700/50 rounded-lg">
              <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center">
                <Mail className="w-5 h-5 text-orange-400" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-slate-400">Email Address</p>
                <p className="text-sm text-white font-medium">{parentInfo.email}</p>
              </div>
            </div>

            {parentInfo.phone && (
              <div className="flex items-center gap-3 p-3 bg-slate-700/50 rounded-lg">
                <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                  <Phone className="w-5 h-5 text-green-400" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-slate-400">Phone Number</p>
                  <p className="text-sm text-white font-medium">{parentInfo.phone}</p>
                </div>
              </div>
            )}
          </div>

          <Separator className="bg-slate-600" />

          {/* Children Information */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-orange-400" />
              <h4 className="font-semibold text-white">
                {children.length === 1 ? "Child" : "Children"} ({children.length})
              </h4>
            </div>

            <div className="space-y-2">
              {children.length > 0 ? (
                children.map((child) => (
                  <div
                    key={child.id}
                    className="p-3 bg-slate-700/50 rounded-lg border border-slate-600/50"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white font-medium">{child.name}</p>
                        <p className="text-sm text-slate-400">
                          {child.class || child.grade_level || "No class assigned"}
                        </p>
                      </div>
                      <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-500 rounded-full flex items-center justify-center">
                        <User className="w-5 h-5 text-white" />
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-4 bg-slate-700/50 rounded-lg text-center text-slate-400">
                  No children linked to this account
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
