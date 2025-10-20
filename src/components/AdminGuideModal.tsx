import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { School, MapPin, Calendar, BookOpen, Users, GraduationCap, Settings, CheckCircle } from "lucide-react";

interface AdminGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminGuideModal = ({ isOpen, onClose }: AdminGuideModalProps) => {
  const steps = [
    {
      number: 1,
      title: "Create School",
      icon: School,
      description: "Start by creating your school. This is the foundation of everything.",
      details: [
        "Click 'Create School' in the Schools section",
        "Fill in school name, address, phone, and email",
        "The school will be activated automatically"
      ],
      note: "Super Admins only. School Admins skip this step."
    },
    {
      number: 2,
      title: "Create Campus",
      icon: MapPin,
      description: "Add physical locations/campuses for your school.",
      details: [
        "Go to the Campuses section",
        "Click 'Add Campus'",
        "Select your school and enter campus details",
        "You can have multiple campuses per school"
      ],
      note: "Each campus represents a physical location or branch."
    },
    {
      number: 3,
      title: "Create Academic Year",
      icon: Calendar,
      description: "Set up the academic year to track time periods.",
      details: [
        "Navigate to Academic Years section",
        "Click 'Create Academic Year'",
        "Enter year name (e.g., '2024-2025')",
        "Set start and end dates",
        "Toggle 'Active' to activate immediately"
      ],
      note: "Only one academic year should be active at a time."
    },
    {
      number: 4,
      title: "Create Subjects",
      icon: BookOpen,
      description: "Add all subjects that will be taught in your school.",
      details: [
        "Go to Subjects section",
        "Click 'Create Subject'",
        "Enter subject name and coefficient (weight for GPA)",
        "Optionally assign a teacher now or later",
        "When selecting a teacher, you'll see what they teach"
      ],
      note: "Coefficient determines how much this subject affects the GPA. Higher = more important."
    },
    {
      number: 5,
      title: "Create Teachers",
      icon: Users,
      description: "Add teaching staff to your school.",
      details: [
        "Open User Management section",
        "Click 'Create Teacher'",
        "Fill in teacher details (name, email, phone)",
        "Enter subjects taught (comma-separated, e.g., 'Math, Physics')",
        "System generates temporary login credentials",
        "Copy the username and password to share with the teacher"
      ],
      note: "Teachers must complete their profile on first login with these credentials."
    },
    {
      number: 6,
      title: "Create Class Sections",
      icon: GraduationCap,
      description: "Set up classes that students will enroll in.",
      details: [
        "Navigate to Class Sections",
        "Click 'Create Class Section'",
        "Enter class name and select school, campus, and academic year",
        "Optionally assign a class teacher (homeroom teacher)"
      ],
      note: "Class sections are the groups where students are enrolled (e.g., 'Grade 10A')."
    },
    {
      number: 7,
      title: "Manage Subject Schedules",
      icon: Settings,
      description: "Assign teachers to teach specific subjects in each class.",
      details: [
        "Click 'Manage Subject Schedules' in Subjects section",
        "Select a class section",
        "Assign teachers to teach each subject in that class",
        "Set the schedule for when subjects are taught"
      ],
      note: "This links teachers, subjects, and classes together."
    },
    {
      number: 8,
      title: "Add Students",
      icon: CheckCircle,
      description: "Finally, add students to your school.",
      details: [
        "Go to User Management section",
        "Choose 'Create Student' for individual students",
        "Or 'Import Students' for bulk upload via Excel",
        "Assign students to their class sections",
        "System generates temporary credentials",
        "Share credentials with students for first login"
      ],
      note: "Students complete their profile on first login using temporary credentials."
    }
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="text-2xl">Admin Dashboard Guide</DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="h-[70vh] pr-4">
          <div className="space-y-6 pb-4">
            <p className="text-muted-foreground">
              Follow these steps in order to set up your school management system completely. Each step builds on the previous one.
            </p>

            {steps.map((step) => {
              const Icon = step.icon;
              return (
                <div key={step.number} className="border rounded-lg p-4 bg-card">
                  <div className="flex items-start gap-4">
                    <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 text-primary shrink-0">
                      <span className="font-bold text-lg">{step.number}</span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className="w-5 h-5 text-primary" />
                        <h3 className="font-semibold text-lg">{step.title}</h3>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">
                        {step.description}
                      </p>
                      <div className="space-y-2 mb-3">
                        {step.details.map((detail, idx) => (
                          <div key={idx} className="flex items-start gap-2 text-sm">
                            <span className="text-primary mt-1">•</span>
                            <span>{detail}</span>
                          </div>
                        ))}
                      </div>
                      {step.note && (
                        <div className="bg-muted/50 rounded p-3 text-sm">
                          <span className="font-medium">Note:</span> {step.note}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="border-2 border-primary/20 rounded-lg p-6 bg-primary/5">
              <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-primary" />
                Quick Tips
              </h3>
              <ul className="space-y-2 text-sm">
                <li>• Always complete each step before moving to the next</li>
                <li>• Keep temporary credentials safe and share them securely</li>
                <li>• Only one academic year should be active at a time</li>
                <li>• You can edit any created item by clicking the Edit button</li>
                <li>• Use the school filter at the top to view specific school data</li>
                <li>• Subject coefficients determine GPA weight (1.0 = standard, 2.0 = double importance)</li>
              </ul>
            </div>
          </div>
        </ScrollArea>

        <div className="flex justify-end pt-4 border-t">
          <Button onClick={onClose}>Got it!</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
