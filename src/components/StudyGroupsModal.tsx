import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Users, Plus, UserPlus, Loader2, Crown, Trash2, UserPlus as AddFriend } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";

interface StudyGroupsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentUserId: string;
  classSectionId: string;
  subjects: Array<{ id: string; name: string; code?: string }>;
}

interface StudyGroup {
  id: string;
  name: string;
  description: string | null;
  subject_id: string;
  class_section_id: string;
  moderated_by_teacher_id: string;
  subjects: { name: string };
  study_group_members: Array<{ user_id: string; role: string }>;
  _memberCount: number;
  _isCreator: boolean;
  _isMember: boolean;
}

interface Classmate {
  user_id: string;
  first_name: string;
  last_name: string;
}

export function StudyGroupsModal({ open, onOpenChange, studentUserId, classSectionId, subjects }: StudyGroupsModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [studyGroups, setStudyGroups] = useState<StudyGroup[]>([]);
  const [classmates, setClassmates] = useState<Classmate[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  
  // Create form state
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  
  // Add members state
  const [addingMembersToGroup, setAddingMembersToGroup] = useState<string | null>(null);
  const [membersToAdd, setMembersToAdd] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      fetchStudyGroups();
      fetchClassmates();
    }
  }, [open, studentUserId, classSectionId]);

  const fetchStudyGroups = async () => {
    try {
      setLoading(true);
      const { data: groups, error } = await supabase
        .from("study_groups")
        .select(`
          *,
          subjects(name),
          study_group_members(user_id, role)
        `)
        .eq("class_section_id", classSectionId);

      if (error) throw error;

      const enrichedGroups = (groups || []).map((group: any) => ({
        ...group,
        _memberCount: group.study_group_members?.length || 0,
        _isCreator: group.study_group_members?.some((m: any) => m.user_id === studentUserId && m.role === 'admin') || false,
        _isMember: group.study_group_members?.some((m: any) => m.user_id === studentUserId) || false,
      }));

      setStudyGroups(enrichedGroups);
    } catch (error) {
      console.error("Error fetching study groups:", error);
      toast({
        title: "Error",
        description: "Failed to load study groups",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchClassmates = async () => {
    try {
      const { data: enrollments, error } = await supabase
        .from("enrollments")
        .select("student_user_id")
        .eq("class_section_id", classSectionId)
        .neq("student_user_id", studentUserId);

      if (error) throw error;

      console.log("Enrollments found:", enrollments);

      const studentIds = enrollments?.map(e => e.student_user_id) || [];
      
      if (studentIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("user_id, first_name, last_name")
          .in("user_id", studentIds);

        if (profilesError) throw profilesError;
        console.log("Classmates profiles:", profiles);
        setClassmates(profiles || []);
      } else {
        console.log("No other students enrolled in this class");
        setClassmates([]);
      }
    } catch (error) {
      console.error("Error fetching classmates:", error);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim() || !selectedSubject) {
      toast({
        title: "Missing information",
        description: "Please provide a group name and select a subject",
        variant: "destructive",
      });
      return;
    }

    try {
      setCreating(true);

      // Get a teacher who teaches this subject in this class
      const { data: teachingAssignment, error: teacherError } = await supabase
        .from("teaching_assignments")
        .select("teacher_user_id")
        .eq("class_section_id", classSectionId)
        .eq("subject_id", selectedSubject)
        .limit(1)
        .single();

      if (teacherError || !teachingAssignment) {
        toast({
          title: "Error",
          description: "Could not find a teacher for this subject",
          variant: "destructive",
        });
        return;
      }

      // Create the study group
      const { data: newGroup, error: groupError } = await supabase
        .from("study_groups")
        .insert({
          name: groupName,
          description: groupDescription || null,
          class_section_id: classSectionId,
          subject_id: selectedSubject,
          moderated_by_teacher_id: teachingAssignment.teacher_user_id,
        })
        .select()
        .single();

      if (groupError) throw groupError;

      // Add creator as admin member
      const membersToAdd = [
        { study_group_id: newGroup.id, user_id: studentUserId, role: 'admin' },
        ...selectedMembers.map(userId => ({
          study_group_id: newGroup.id,
          user_id: userId,
          role: 'student',
        }))
      ];

      const { error: membersError } = await supabase
        .from("study_group_members")
        .insert(membersToAdd);

      if (membersError) throw membersError;

      toast({
        title: "Success",
        description: "Study group created successfully!",
      });

      setShowCreateForm(false);
      setGroupName("");
      setGroupDescription("");
      setSelectedSubject("");
      setSelectedMembers([]);
      fetchStudyGroups();
    } catch (error) {
      console.error("Error creating study group:", error);
      toast({
        title: "Error",
        description: "Failed to create study group",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleJoinGroup = async (groupId: string) => {
    try {
      const { error } = await supabase
        .from("study_group_members")
        .insert({
          study_group_id: groupId,
          user_id: studentUserId,
          role: 'student',
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "You've joined the study group!",
      });

      fetchStudyGroups();
    } catch (error) {
      console.error("Error joining group:", error);
      toast({
        title: "Error",
        description: "Failed to join study group",
        variant: "destructive",
      });
    }
  };

  const handleLeaveGroup = async (groupId: string) => {
    try {
      const { error } = await supabase
        .from("study_group_members")
        .delete()
        .eq("study_group_id", groupId)
        .eq("user_id", studentUserId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "You've left the study group",
      });

      fetchStudyGroups();
    } catch (error) {
      console.error("Error leaving group:", error);
      toast({
        title: "Error",
        description: "Failed to leave study group",
        variant: "destructive",
      });
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm("Are you sure you want to delete this study group? This action cannot be undone.")) {
      return;
    }

    try {
      // Delete the group directly - CASCADE will handle members
      const { error: groupError } = await supabase
        .from("study_groups")
        .delete()
        .eq("id", groupId);

      if (groupError) throw groupError;

      toast({
        title: "Success",
        description: "Study group deleted successfully",
      });

      fetchStudyGroups();
    } catch (error) {
      console.error("Error deleting group:", error);
      toast({
        title: "Error",
        description: "Failed to delete study group",
        variant: "destructive",
      });
    }
  };

  const handleAddMembers = async (groupId: string, memberIds: string[]) => {
    try {
      // Filter out members who are already in the group
      const group = studyGroups.find(g => g.id === groupId);
      if (!group) return;
      
      const existingMemberIds = group.study_group_members.map(m => m.user_id);
      const newMemberIds = memberIds.filter(id => !existingMemberIds.includes(id));
      
      if (newMemberIds.length === 0) {
        toast({
          title: "Already added",
          description: "All selected classmates are already in this group",
        });
        setAddingMembersToGroup(null);
        setMembersToAdd([]);
        return;
      }
      
      const membersToAdd = newMemberIds.map(userId => ({
        study_group_id: groupId,
        user_id: userId,
        role: 'student',
      }));

      const { error } = await supabase
        .from("study_group_members")
        .insert(membersToAdd);

      if (error) throw error;

      toast({
        title: "Success",
        description: `${newMemberIds.length} friend${newMemberIds.length > 1 ? 's' : ''} added to the group!`,
      });

      // Close the add members form and reset state
      setAddingMembersToGroup(null);
      setMembersToAdd([]);
      
      // Refresh the groups to show the new members
      await fetchStudyGroups();
    } catch (error) {
      console.error("Error adding members:", error);
      toast({
        title: "Error",
        description: "Failed to add friends",
        variant: "destructive",
      });
    }
  };

  const toggleMemberSelection = (userId: string) => {
    setSelectedMembers(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto bg-slate-800 border-slate-600">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-green-400" />
            Study Groups
          </DialogTitle>
          <DialogDescription className="text-slate-300">
            Create or join study groups with your classmates
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="all" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-slate-700">
            <TabsTrigger value="all" className="data-[state=active]:bg-slate-600">All Groups</TabsTrigger>
            <TabsTrigger value="my-groups" className="data-[state=active]:bg-slate-600">My Groups</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-4 mt-4">
            <Button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Study Group
            </Button>

            {showCreateForm && (
              <Card className="bg-slate-700/50 border-slate-600">
                <CardContent className="pt-6 space-y-4">
                  <div>
                    <Label htmlFor="group-name" className="text-slate-200">Group Name</Label>
                    <Input
                      id="group-name"
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      placeholder="e.g., Math Warriors"
                      className="bg-slate-600 border-slate-500 text-white"
                    />
                  </div>

                  <div>
                    <Label htmlFor="subject" className="text-slate-200">Subject</Label>
                    <Select value={selectedSubject} onValueChange={setSelectedSubject}>
                      <SelectTrigger className="bg-slate-600 border-slate-500 text-white">
                        <SelectValue placeholder="Select a subject" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-700 border-slate-600">
                        {subjects.map((subject) => (
                          <SelectItem key={subject.id} value={subject.id} className="text-white">
                            {subject.name} {subject.code && `(${subject.code})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="description" className="text-slate-200">Description (Optional)</Label>
                    <Textarea
                      id="description"
                      value={groupDescription}
                      onChange={(e) => setGroupDescription(e.target.value)}
                      placeholder="What's this group about?"
                      className="bg-slate-600 border-slate-500 text-white"
                    />
                  </div>

                  <div>
                    <Label className="text-slate-200">Add Classmates (Optional)</Label>
                    <div className="mt-2 space-y-2 max-h-40 overflow-y-auto">
                      {classmates.map((classmate) => (
                        <div key={classmate.user_id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`member-${classmate.user_id}`}
                            checked={selectedMembers.includes(classmate.user_id)}
                            onCheckedChange={() => toggleMemberSelection(classmate.user_id)}
                          />
                          <label
                            htmlFor={`member-${classmate.user_id}`}
                            className="text-sm text-slate-200 cursor-pointer"
                          >
                            {classmate.first_name} {classmate.last_name}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={handleCreateGroup}
                      disabled={creating}
                      className="flex-1 bg-green-500 hover:bg-green-600"
                    >
                      {creating ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        "Create Group"
                      )}
                    </Button>
                    <Button
                      onClick={() => setShowCreateForm(false)}
                      variant="outline"
                      className="border-slate-500 text-slate-200"
                    >
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-green-400" />
              </div>
            ) : (
              <div className="space-y-3">
                {studyGroups.map((group) => (
                  <Card key={group.id} className="bg-slate-700/50 border-slate-600">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-white">{group.name}</h3>
                            {group._isCreator && (
                              <Crown className="w-4 h-4 text-yellow-400" />
                            )}
                          </div>
                          <p className="text-sm text-slate-300 mt-1">{group.subjects.name}</p>
                          {group.description && (
                            <p className="text-sm text-slate-400 mt-1">{group.description}</p>
                          )}
                          <p className="text-xs text-slate-400 mt-2">
                            {group._memberCount} member{group._memberCount !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          {group._isCreator ? (
                            <>
                              <Button
                                onClick={() => {
                                  setAddingMembersToGroup(group.id);
                                  setMembersToAdd([]);
                                }}
                                size="sm"
                                variant="outline"
                                className="border-green-500 text-green-400 hover:bg-green-500/10"
                              >
                                <AddFriend className="w-4 h-4 mr-1" />
                                Add Friends
                              </Button>
                              <Button
                                onClick={() => handleDeleteGroup(group.id)}
                                size="sm"
                                variant="outline"
                                className="border-red-500 text-red-400 hover:bg-red-500/10"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </>
                          ) : group._isMember ? (
                            <Button
                              onClick={() => handleLeaveGroup(group.id)}
                              variant="outline"
                              size="sm"
                              className="border-red-500 text-red-400 hover:bg-red-500/10"
                            >
                              Leave
                            </Button>
                          ) : (
                            <Button
                              onClick={() => handleJoinGroup(group.id)}
                              size="sm"
                              className="bg-green-500 hover:bg-green-600"
                            >
                              <UserPlus className="w-4 h-4 mr-1" />
                              Join
                            </Button>
                          )}
                        </div>
                      </div>
                      
                      {addingMembersToGroup === group.id && (
                        <div className="mt-4 pt-4 border-t border-slate-600">
                          <Label className="text-slate-200">Add Friends to Group</Label>
                          <div className="mt-2 space-y-2 max-h-40 overflow-y-auto">
                            {classmates.filter(c => !group.study_group_members.some(m => m.user_id === c.user_id)).length === 0 ? (
                              <p className="text-sm text-slate-400">No classmates available to add. All your classmates are already in this group.</p>
                            ) : (
                              classmates
                                .filter(c => !group.study_group_members.some(m => m.user_id === c.user_id))
                                .map((classmate) => (
                                <div key={classmate.user_id} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`add-${group.id}-${classmate.user_id}`}
                                    checked={membersToAdd.includes(classmate.user_id)}
                                    onCheckedChange={() => {
                                      setMembersToAdd(prev =>
                                        prev.includes(classmate.user_id)
                                          ? prev.filter(id => id !== classmate.user_id)
                                          : [...prev, classmate.user_id]
                                      );
                                    }}
                                  />
                                  <label
                                    htmlFor={`add-${group.id}-${classmate.user_id}`}
                                    className="text-sm text-slate-200 cursor-pointer"
                                  >
                                    {classmate.first_name} {classmate.last_name}
                                  </label>
                                </div>
                              ))
                            )}
                          </div>
                          <div className="flex gap-2 mt-3">
                            <Button
                              onClick={() => handleAddMembers(group.id, membersToAdd)}
                              size="sm"
                              className="bg-green-500 hover:bg-green-600"
                              disabled={membersToAdd.length === 0}
                            >
                              Add Selected
                            </Button>
                            <Button
                              onClick={() => {
                                setAddingMembersToGroup(null);
                                setMembersToAdd([]);
                              }}
                              size="sm"
                              variant="outline"
                              className="border-slate-500 text-slate-200"
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
                {studyGroups.length === 0 && (
                  <div className="text-center py-8 text-slate-400">
                    No study groups yet. Create one to get started!
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="my-groups" className="space-y-3 mt-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-green-400" />
              </div>
            ) : (
              <>
                {studyGroups.filter(g => g._isMember).map((group) => (
                  <Card key={group.id} className="bg-slate-700/50 border-slate-600">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-white">{group.name}</h3>
                            {group._isCreator && (
                              <Crown className="w-4 h-4 text-yellow-400" />
                            )}
                          </div>
                          <p className="text-sm text-slate-300 mt-1">{group.subjects.name}</p>
                          {group.description && (
                            <p className="text-sm text-slate-400 mt-1">{group.description}</p>
                          )}
                          <p className="text-xs text-slate-400 mt-2">
                            {group._memberCount} member{group._memberCount !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          {group._isCreator && (
                            <>
                              <Button
                                onClick={() => {
                                  setAddingMembersToGroup(group.id);
                                  setMembersToAdd([]);
                                }}
                                size="sm"
                                variant="outline"
                                className="border-green-500 text-green-400 hover:bg-green-500/10"
                              >
                                <AddFriend className="w-4 h-4 mr-1" />
                                Add Friends
                              </Button>
                              <Button
                                onClick={() => handleDeleteGroup(group.id)}
                                size="sm"
                                variant="outline"
                                className="border-red-500 text-red-400 hover:bg-red-500/10"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                      
                      {addingMembersToGroup === group.id && (
                        <div className="mt-4 pt-4 border-t border-slate-600">
                          <Label className="text-slate-200">Add Friends to Group</Label>
                          <div className="mt-2 space-y-2 max-h-40 overflow-y-auto">
                            {classmates.filter(c => !group.study_group_members.some(m => m.user_id === c.user_id)).length === 0 ? (
                              <p className="text-sm text-slate-400">No classmates available to add. All your classmates are already in this group.</p>
                            ) : (
                              classmates
                                .filter(c => !group.study_group_members.some(m => m.user_id === c.user_id))
                                .map((classmate) => (
                                <div key={classmate.user_id} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`my-add-${group.id}-${classmate.user_id}`}
                                    checked={membersToAdd.includes(classmate.user_id)}
                                    onCheckedChange={() => {
                                      setMembersToAdd(prev =>
                                        prev.includes(classmate.user_id)
                                          ? prev.filter(id => id !== classmate.user_id)
                                          : [...prev, classmate.user_id]
                                      );
                                    }}
                                  />
                                  <label
                                    htmlFor={`my-add-${group.id}-${classmate.user_id}`}
                                    className="text-sm text-slate-200 cursor-pointer"
                                  >
                                    {classmate.first_name} {classmate.last_name}
                                  </label>
                                </div>
                              ))
                            )}
                          </div>
                          <div className="flex gap-2 mt-3">
                            <Button
                              onClick={() => handleAddMembers(group.id, membersToAdd)}
                              size="sm"
                              className="bg-green-500 hover:bg-green-600"
                              disabled={membersToAdd.length === 0}
                            >
                              Add Selected
                            </Button>
                            <Button
                              onClick={() => {
                                setAddingMembersToGroup(null);
                                setMembersToAdd([]);
                              }}
                              size="sm"
                              variant="outline"
                              className="border-slate-500 text-slate-200"
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
                {studyGroups.filter(g => g._isMember).length === 0 && (
                  <div className="text-center py-8 text-slate-400">
                    You haven't joined any study groups yet
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
