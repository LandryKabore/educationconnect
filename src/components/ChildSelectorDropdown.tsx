import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { GraduationCap, ChevronDown, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Child {
  id: string;
  name: string;
  class: string;
  grade_level: string;
  profile?: any;
}

interface ChildSelectorDropdownProps {
  children: Child[];
  selectedChildId: string | null;
  onSelectChild: (childId: string) => void;
}

export function ChildSelectorDropdown({
  children,
  selectedChildId,
  onSelectChild,
}: ChildSelectorDropdownProps) {
  const selectedChild = children.find((c) => c.id === selectedChildId);

  if (children.length === 0) {
    return null;
  }

  if (children.length === 1) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-card border rounded-lg">
        <Avatar className="w-8 h-8 rounded-lg">
          <AvatarImage src={selectedChild?.profile?.avatar_url} />
          <AvatarFallback className="rounded-lg">
            {selectedChild?.name.split(" ").map((n) => n[0]).join("")}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{selectedChild?.name}</p>
          <p className="text-xs text-muted-foreground truncate">{selectedChild?.class}</p>
        </div>
        <Badge variant="outline" className="text-xs">
          {selectedChild?.grade_level}
        </Badge>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="w-full justify-between">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Avatar className="w-8 h-8 rounded-lg">
              <AvatarImage src={selectedChild?.profile?.avatar_url} />
              <AvatarFallback className="rounded-lg">
                {selectedChild?.name.split(" ").map((n) => n[0]).join("")}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium truncate">{selectedChild?.name}</p>
              <p className="text-xs text-muted-foreground truncate">{selectedChild?.class}</p>
            </div>
          </div>
          <ChevronDown className="w-4 h-4 shrink-0 ml-2" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80">
        <DropdownMenuLabel>Select Child</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {children.map((child) => (
          <DropdownMenuItem
            key={child.id}
            onClick={() => onSelectChild(child.id)}
            className="p-3"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <Avatar className="w-10 h-10 rounded-lg">
                <AvatarImage src={child.profile?.avatar_url} />
                <AvatarFallback className="rounded-lg">
                  {child.name.split(" ").map((n) => n[0]).join("")}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{child.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground truncate">{child.class}</span>
                  <Badge variant="outline" className="text-xs">
                    <GraduationCap className="w-3 h-3 mr-1" />
                    {child.grade_level}
                  </Badge>
                </div>
              </div>
              {selectedChildId === child.id && (
                <Check className="w-4 h-4 text-primary shrink-0" />
              )}
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
