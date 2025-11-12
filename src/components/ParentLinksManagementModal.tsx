import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Search, Trash2, RefreshCw, Users, Key, Link as LinkIcon, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ParentLink {
  id: string;
  parent_user_id: string;
  student_user_id: string;
  verification_code: string;
  status: string;
  created_at: string;
  parent_name: string;
  parent_email: string;
  student_name: string;
}

interface ParentLinksManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedSchoolId?: string | null;
}

export function ParentLinksManagementModal({ isOpen, onClose, selectedSchoolId }: ParentLinksManagementModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [links, setLinks] = useState<ParentLink[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [revokingLinkId, setRevokingLinkId] = useState<string | null>(null);
  const [linkToRevoke, setLinkToRevoke] = useState<ParentLink | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchLinks();
    }
  }, [isOpen, selectedSchoolId]);

  const fetchLinks = async () => {
    setLoading(true);
    try {
      // Build query to get all parent-student links
      let query = supabase
        .from('parent_student_links')
        .select(`
          id,
          parent_user_id,
          student_user_id,
          verification_code,
          status,
          created_at
        `)
        .order('created_at', { ascending: false });

      const { data: linksData, error: linksError } = await query;

      if (linksError) throw linksError;

      if (!linksData || linksData.length === 0) {
        setLinks([]);
        return;
      }

      // Get parent and student details
      const parentIds = [...new Set(linksData.map(l => l.parent_user_id).filter(Boolean))];
      const studentIds = [...new Set(linksData.map(l => l.student_user_id))];

      const { data: parentsData } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name, email')
        .in('user_id', parentIds);

      const { data: studentsData } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name')
        .in('user_id', studentIds);

      // Filter by school if selected
      if (selectedSchoolId) {
        const { data: studentProfiles } = await supabase
          .from('student_profiles')
          .select('user_id')
          .eq('school_id', selectedSchoolId);
        
        const schoolStudentIds = studentProfiles?.map(s => s.user_id) || [];
        const filteredLinks = linksData.filter(l => schoolStudentIds.includes(l.student_user_id));
        
        const enrichedLinks = filteredLinks.map(link => {
          const parent = parentsData?.find(p => p.user_id === link.parent_user_id);
          const student = studentsData?.find(s => s.user_id === link.student_user_id);
          
          return {
            ...link,
            parent_name: parent ? `${parent.first_name} ${parent.last_name}` : 'N/A',
            parent_email: parent?.email || 'N/A',
            student_name: student ? `${student.first_name} ${student.last_name}` : 'Unknown Student',
          };
        });

        setLinks(enrichedLinks);
      } else {
        const enrichedLinks = linksData.map(link => {
          const parent = parentsData?.find(p => p.user_id === link.parent_user_id);
          const student = studentsData?.find(s => s.user_id === link.student_user_id);
          
          return {
            ...link,
            parent_name: parent ? `${parent.first_name} ${parent.last_name}` : 'N/A',
            parent_email: parent?.email || 'N/A',
            student_name: student ? `${student.first_name} ${student.last_name}` : 'Unknown Student',
          };
        });

        setLinks(enrichedLinks);
      }
    } catch (error: any) {
      console.error('Error fetching parent links:', error);
      toast({
        title: "Error",
        description: "Failed to load parent-student links",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeLink = async () => {
    if (!linkToRevoke) return;

    setRevokingLinkId(linkToRevoke.id);
    try {
      const { error } = await supabase
        .from('parent_student_links')
        .delete()
        .eq('id', linkToRevoke.id);

      if (error) throw error;

      toast({
        title: "Link Revoked",
        description: `Successfully revoked link between ${linkToRevoke.parent_name} and ${linkToRevoke.student_name}`,
      });

      await fetchLinks();
    } catch (error: any) {
      console.error('Error revoking link:', error);
      toast({
        title: "Error",
        description: "Failed to revoke link",
        variant: "destructive",
      });
    } finally {
      setRevokingLinkId(null);
      setLinkToRevoke(null);
    }
  };

  const filteredLinks = links.filter(link =>
    link.parent_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    link.parent_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    link.student_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    link.verification_code.includes(searchQuery)
  );

  const activeLinks = filteredLinks.filter(l => l.status === 'active');
  const pendingLinks = filteredLinks.filter(l => l.status === 'pending');

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl">
              <LinkIcon className="w-6 h-6" />
              Parent-Student Links Management
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Stats & Search */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <div className="flex gap-4">
                <div className="text-sm">
                  <span className="font-semibold text-green-600">{activeLinks.length}</span> Active
                </div>
                <div className="text-sm">
                  <span className="font-semibold text-yellow-600">{pendingLinks.length}</span> Pending
                </div>
              </div>
              
              <div className="flex gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-80">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="Search by parent, student, or code..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={fetchLinks}
                  disabled={loading}
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : filteredLinks.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="w-16 h-16 mx-auto mb-4 opacity-20" />
                <p>No parent-student links found</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Active Links */}
                {activeLinks.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-3 text-green-600 flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      Active Links ({activeLinks.length})
                    </h3>
                    <div className="grid gap-3">
                      {activeLinks.map((link) => (
                        <Card key={link.id} className="border-green-200">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 space-y-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                                    Active
                                  </Badge>
                                  <Badge variant="outline" className="gap-1">
                                    <Key className="w-3 h-3" />
                                    {link.verification_code}
                                  </Badge>
                                </div>
                                
                                <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
                                  <div>
                                    <span className="text-muted-foreground">Parent:</span>{" "}
                                    <span className="font-medium">{link.parent_name}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Email:</span>{" "}
                                    <span className="font-medium">{link.parent_email}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Student:</span>{" "}
                                    <span className="font-medium">{link.student_name}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Created:</span>{" "}
                                    <span>{new Date(link.created_at).toLocaleDateString()}</span>
                                  </div>
                                </div>
                              </div>
                              
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => setLinkToRevoke(link)}
                                disabled={revokingLinkId === link.id}
                              >
                                {revokingLinkId === link.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <>
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Revoke
                                  </>
                                )}
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* Pending Links */}
                {pendingLinks.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-3 text-yellow-600 flex items-center gap-2">
                      <Key className="w-4 h-4" />
                      Pending Links ({pendingLinks.length})
                    </h3>
                    <div className="grid gap-3">
                      {pendingLinks.map((link) => (
                        <Card key={link.id} className="border-yellow-200">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 space-y-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">
                                    Pending
                                  </Badge>
                                  <Badge variant="outline" className="gap-1">
                                    <Key className="w-3 h-3" />
                                    {link.verification_code}
                                  </Badge>
                                </div>
                                
                                <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
                                  <div>
                                    <span className="text-muted-foreground">Student:</span>{" "}
                                    <span className="font-medium">{link.student_name}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Created:</span>{" "}
                                    <span>{new Date(link.created_at).toLocaleDateString()}</span>
                                  </div>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  Waiting for parent to use this code to link their account
                                </p>
                              </div>
                              
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => setLinkToRevoke(link)}
                                disabled={revokingLinkId === link.id}
                              >
                                {revokingLinkId === link.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <>
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Delete
                                  </>
                                )}
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Revoke Confirmation Dialog */}
      <AlertDialog open={!!linkToRevoke} onOpenChange={() => setLinkToRevoke(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Parent-Student Link?</AlertDialogTitle>
            <AlertDialogDescription>
              {linkToRevoke && linkToRevoke.status === 'active' ? (
                <>
                  Are you sure you want to revoke the link between{" "}
                  <strong>{linkToRevoke.parent_name}</strong> and{" "}
                  <strong>{linkToRevoke.student_name}</strong>?
                  <br /><br />
                  The parent will no longer have access to this student's data.
                </>
              ) : (
                <>
                  Are you sure you want to delete this pending link for{" "}
                  <strong>{linkToRevoke?.student_name}</strong>?
                  <br /><br />
                  The verification code <strong>{linkToRevoke?.verification_code}</strong> will no longer be valid.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevokeLink} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {linkToRevoke?.status === 'active' ? 'Revoke Link' : 'Delete Link'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
