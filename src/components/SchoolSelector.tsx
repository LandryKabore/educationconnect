import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { School, MapPin, Phone, Mail, Globe, Edit, Trash2, Shield } from "lucide-react";
import { EditSchoolModal } from "./EditSchoolModal";
import { DeleteSchoolModal } from "./DeleteSchoolModal";
import { AdminLevel } from "@/hooks/useAdminAccess";

interface SchoolSelectorProps {
  onSchoolSelect: (schoolId: string | null) => void;
  selectedSchoolId: string | null;
  onRefresh?: () => void;
  adminLevel?: AdminLevel;
  accessibleSchoolIds?: string[];
  schoolNames?: Record<string, string>;
}

export function SchoolSelector({ 
  onSchoolSelect, 
  selectedSchoolId, 
  onRefresh,
  adminLevel,
  accessibleSchoolIds = [],
  schoolNames = {}
}: SchoolSelectorProps) {
  const [schools, setSchools] = useState<any[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [schoolToEdit, setSchoolToEdit] = useState<any>(null);
  
  const isSuperAdmin = adminLevel === 'super_admin';
  const isSchoolAdmin = adminLevel === 'school_admin';
  const singleSchoolAdmin = isSchoolAdmin && accessibleSchoolIds.length === 1;

  useEffect(() => {
    fetchSchools();
  }, []);

  useEffect(() => {
    if (selectedSchoolId && schools.length > 0) {
      const school = schools.find(s => s.id === selectedSchoolId);
      setSelectedSchool(school);
    } else {
      setSelectedSchool(null);
    }
  }, [selectedSchoolId, schools]);

  const fetchSchools = async () => {
    try {
      const { data, error } = await supabase
        .from('schools')
        .select('*')
        .eq('active', true)
        .order('name');

      if (error) throw error;
      
      // Filter schools based on admin access
      const filteredSchools = isSuperAdmin 
        ? (data || [])
        : (data || []).filter(s => accessibleSchoolIds.includes(s.id));
      
      setSchools(filteredSchools);
    } catch (error) {
      console.error('Error fetching schools:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSchoolChange = (schoolId: string) => {
    onSchoolSelect(schoolId);
    const school = schools.find(s => s.id === schoolId);
    setSelectedSchool(school);
  };

  const clearSelection = () => {
    onSchoolSelect(null);
    setSelectedSchool(null);
  };

  const handleEditSchool = (school: any) => {
    setSchoolToEdit(school);
    setEditModalOpen(true);
  };

  const handleDeleteSchool = (school: any) => {
    setSchoolToEdit(school);
    setDeleteModalOpen(true);
  };

  const handleSchoolUpdated = () => {
    fetchSchools();
    if (onRefresh) onRefresh();
  };


  if (loading) {
    return (
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-6">
          <div className="animate-pulse">Loading schools...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2 justify-between">
            <div className="flex items-center gap-2">
              <School className="w-5 h-5" />
              School Selection
            </div>
            {isSchoolAdmin && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Shield className="w-3 h-3" />
                School Admin
              </Badge>
            )}
          </CardTitle>
          <CardDescription className="text-slate-300">
            {singleSchoolAdmin 
              ? `Managing: ${schoolNames[accessibleSchoolIds[0]] || 'School'}`
              : "Select a school to view its details and manage its data"
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!singleSchoolAdmin && (
            <div className="flex gap-3">
              <Select 
                value={selectedSchoolId || ""} 
                onValueChange={handleSchoolChange}
                disabled={singleSchoolAdmin}
              >
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                  <SelectValue placeholder="Choose a school..." />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600">
                  {schools.map((school) => (
                    <SelectItem 
                      key={school.id} 
                      value={school.id}
                      className="text-white hover:bg-slate-700"
                    >
                      {school.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedSchoolId && isSuperAdmin && (
                <Button 
                  variant="outline" 
                  onClick={clearSelection}
                  className="border-slate-600 text-slate-200 hover:bg-slate-700"
                >
                  View All
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedSchool && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">{selectedSchool.name}</CardTitle>
            <CardDescription className="text-slate-300">
              School Information & Details
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {selectedSchool.address && (
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-slate-400 mt-1" />
                  <div>
                    <p className="text-sm font-medium text-slate-200">Address</p>
                    <p className="text-sm text-slate-300">{selectedSchool.address}</p>
                  </div>
                </div>
              )}
              
              {selectedSchool.phone && (
                <div className="flex items-start gap-3">
                  <Phone className="w-4 h-4 text-slate-400 mt-1" />
                  <div>
                    <p className="text-sm font-medium text-slate-200">Phone</p>
                    <p className="text-sm text-slate-300">{selectedSchool.phone}</p>
                  </div>
                </div>
              )}
              
              {selectedSchool.email && (
                <div className="flex items-start gap-3">
                  <Mail className="w-4 h-4 text-slate-400 mt-1" />
                  <div>
                    <p className="text-sm font-medium text-slate-200">Email</p>
                    <p className="text-sm text-slate-300">{selectedSchool.email}</p>
                  </div>
                </div>
              )}
              
              {selectedSchool.country && (
                <div className="flex items-start gap-3">
                  <Globe className="w-4 h-4 text-slate-400 mt-1" />
                  <div>
                    <p className="text-sm font-medium text-slate-200">Country</p>
                    <p className="text-sm text-slate-300">{selectedSchool.country}</p>
                  </div>
                </div>
              )}
            </div>
            
            {/* Action buttons */}
            <div className="flex gap-2 pt-4">
              {isSuperAdmin && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEditSchool(selectedSchool)}
                    className="border-slate-600 text-slate-200 hover:bg-slate-700"
                  >
                    <Edit className="w-4 h-4 mr-1" />
                    Edit School
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteSchool(selectedSchool)}
                    className="border-red-600 text-red-400 hover:bg-red-900/20"
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete School
                  </Button>
                </>
              )}
              {isSchoolAdmin && (
                <p className="text-sm text-slate-400">
                  Contact a super admin to modify school details
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modals */}
      <EditSchoolModal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        school={schoolToEdit}
        onSuccess={handleSchoolUpdated}
      />
      
      <DeleteSchoolModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        school={schoolToEdit}
        onSuccess={handleSchoolUpdated}
      />
    </div>
  );
}