import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, User, Settings, School, Users, Calendar, BookOpen, MapPin, GraduationCap, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface AdminData {
  schools: any[];
  campuses: any[];
  academicYears: any[];
  classSections: any[];
  subjects: any[];
  users: any[];
  totalStudents: number;
  totalTeachers: number;
  totalParents: number;
}

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [adminData, setAdminData] = useState<AdminData>({
    schools: [],
    campuses: [],
    academicYears: [],
    classSections: [],
    subjects: [],
    users: [],
    totalStudents: 0,
    totalTeachers: 0,
    totalParents: 0,
  });

  useEffect(() => {
    fetchAdminData();
  }, []);

  const fetchAdminData = async () => {
    try {
      // Check if user is admin
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
        .single();

      if (profile?.role !== 'admin') {
        toast({
          title: "Access Denied",
          description: "You don't have admin privileges.",
          variant: "destructive",
        });
        navigate('/');
        return;
      }

      const [
        schoolsData,
        campusesData,
        academicYearsData,
        classSectionsData,
        subjectsData,
        profilesData
      ] = await Promise.all([
        supabase.from('schools').select('*'),
        supabase.from('campuses').select('*'),
        supabase.from('academic_years').select('*').order('created_at', { ascending: false }),
        supabase.from('class_sections').select('*'),
        supabase.from('subjects').select('*'),
        supabase.from('profiles').select('role')
      ]);

      const students = profilesData.data?.filter(p => p.role === 'student').length || 0;
      const teachers = profilesData.data?.filter(p => p.role === 'teacher').length || 0;
      const parents = profilesData.data?.filter(p => p.role === 'parent').length || 0;

      setAdminData({
        schools: schoolsData.data || [],
        campuses: campusesData.data || [],
        academicYears: academicYearsData.data || [],
        classSections: classSectionsData.data || [],
        subjects: subjectsData.data || [],
        users: profilesData.data || [],
        totalStudents: students,
        totalTeachers: teachers,
        totalParents: parents,
      });
    } catch (error) {
      console.error('Error fetching admin data:', error);
      toast({
        title: "Error",
        description: "Failed to load admin data.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="flex items-center gap-2 text-white">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Loading admin dashboard...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="bg-slate-800/50 border-b border-slate-700/50 shadow-xl backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Button 
                variant="outline" 
                size="icon"
                onClick={() => navigate("/")}
                className="shrink-0 border-slate-600 text-slate-200 bg-slate-800/50 hover:bg-slate-700"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold text-white">Admin Dashboard</h1>
                <p className="text-sm text-slate-300">School Management System</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="icon" className="border-slate-600 text-slate-200 bg-slate-800/50 hover:bg-slate-700">
                <Settings className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="icon" className="border-slate-600 text-slate-200 bg-slate-800/50 hover:bg-slate-700">
                <User className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="bg-slate-800/60 backdrop-blur-sm border border-slate-600/50 shadow-xl">
            <CardContent className="p-6 text-center">
              <div className="text-2xl font-bold text-blue-400">{adminData.totalStudents}</div>
              <div className="text-sm text-slate-300">Total Students</div>
            </CardContent>
          </Card>
          <Card className="bg-slate-800/60 backdrop-blur-sm border border-slate-600/50 shadow-xl">
            <CardContent className="p-6 text-center">
              <div className="text-2xl font-bold text-green-400">{adminData.totalTeachers}</div>
              <div className="text-sm text-slate-300">Total Teachers</div>
            </CardContent>
          </Card>
          <Card className="bg-slate-800/60 backdrop-blur-sm border border-slate-600/50 shadow-xl">
            <CardContent className="p-6 text-center">
              <div className="text-2xl font-bold text-purple-400">{adminData.totalParents}</div>
              <div className="text-sm text-slate-300">Total Parents</div>
            </CardContent>
          </Card>
          <Card className="bg-slate-800/60 backdrop-blur-sm border border-slate-600/50 shadow-xl">
            <CardContent className="p-6 text-center">
              <div className="text-2xl font-bold text-orange-400">{adminData.schools.length}</div>
              <div className="text-sm text-slate-300">Active Schools</div>
            </CardContent>
          </Card>
        </div>

        {/* Management Sections */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* School Management */}
          <Card className="bg-slate-800/60 backdrop-blur-sm border border-slate-600/50 shadow-xl">
            <CardHeader>
              <div className="flex items-center gap-2">
                <School className="w-5 h-5 text-blue-400" />
                <CardTitle className="text-white">School Management</CardTitle>
              </div>
              <CardDescription className="text-slate-300">Manage schools and basic settings</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {adminData.schools.length > 0 ? adminData.schools.map((school) => (
                  <div key={school.id} className="p-4 bg-slate-700/50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-white">{school.name}</div>
                        <div className="text-sm text-slate-300">{school.country}</div>
                      </div>
                      <Button size="sm" variant="outline" className="text-blue-400 border-blue-400/50">
                        Edit
                      </Button>
                    </div>
                  </div>
                )) : (
                  <div className="p-4 bg-slate-700/50 rounded-lg text-center text-slate-300">
                    No schools configured
                  </div>
                )}
                <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                  <School className="w-4 h-4 mr-2" />
                  Create New School
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Campus Management */}
          <Card className="bg-slate-800/60 backdrop-blur-sm border border-slate-600/50 shadow-xl">
            <CardHeader>
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-green-400" />
                <CardTitle className="text-white">Campus & Locations</CardTitle>
              </div>
              <CardDescription className="text-slate-300">Manage campus locations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {adminData.campuses.length > 0 ? adminData.campuses.map((campus) => (
                  <div key={campus.id} className="p-4 bg-slate-700/50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-white">{campus.name}</div>
                        <div className="text-sm text-slate-300">{campus.address}</div>
                      </div>
                      <Button size="sm" variant="outline" className="text-green-400 border-green-400/50">
                        Edit
                      </Button>
                    </div>
                  </div>
                )) : (
                  <div className="p-4 bg-slate-700/50 rounded-lg text-center text-slate-300">
                    No campuses configured
                  </div>
                )}
                <Button className="w-full bg-green-600 hover:bg-green-700 text-white">
                  <MapPin className="w-4 h-4 mr-2" />
                  Add New Campus
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Academic Years */}
          <Card className="bg-slate-800/60 backdrop-blur-sm border border-slate-600/50 shadow-xl">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-purple-400" />
                <CardTitle className="text-white">Academic Years</CardTitle>
              </div>
              <CardDescription className="text-slate-300">Manage academic years and terms</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {adminData.academicYears.length > 0 ? adminData.academicYears.slice(0, 3).map((year) => (
                  <div key={year.id} className="p-4 bg-slate-700/50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-white">{year.name}</div>
                        <div className="text-sm text-slate-300">
                          {new Date(year.start_date).toLocaleDateString()} - {new Date(year.end_date).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {year.active && (
                          <span className="text-xs bg-green-500 text-white px-2 py-1 rounded">Active</span>
                        )}
                        <Button size="sm" variant="outline" className="text-purple-400 border-purple-400/50">
                          Edit
                        </Button>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="p-4 bg-slate-700/50 rounded-lg text-center text-slate-300">
                    No academic years configured
                  </div>
                )}
                <Button className="w-full bg-purple-600 hover:bg-purple-700 text-white">
                  <Calendar className="w-4 h-4 mr-2" />
                  Create Academic Year
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Class Sections */}
          <Card className="bg-slate-800/60 backdrop-blur-sm border border-slate-600/50 shadow-xl">
            <CardHeader>
              <div className="flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-orange-400" />
                <CardTitle className="text-white">Class Sections</CardTitle>
              </div>
              <CardDescription className="text-slate-300">Manage class sections and capacity</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {adminData.classSections.length > 0 ? adminData.classSections.slice(0, 3).map((section) => (
                  <div key={section.id} className="p-4 bg-slate-700/50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-white">{section.name}</div>
                        <div className="text-sm text-slate-300">
                          {section.grade_level} • Capacity: {section.capacity}
                        </div>
                      </div>
                      <Button size="sm" variant="outline" className="text-orange-400 border-orange-400/50">
                        Edit
                      </Button>
                    </div>
                  </div>
                )) : (
                  <div className="p-4 bg-slate-700/50 rounded-lg text-center text-slate-300">
                    No class sections configured
                  </div>
                )}
                <Button className="w-full bg-orange-600 hover:bg-orange-700 text-white">
                  <GraduationCap className="w-4 h-4 mr-2" />
                  Create Class Section
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Subjects Management */}
          <Card className="bg-slate-800/60 backdrop-blur-sm border border-slate-600/50 shadow-xl">
            <CardHeader>
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-cyan-400" />
                <CardTitle className="text-white">Subjects</CardTitle>
              </div>
              <CardDescription className="text-slate-300">Manage curriculum subjects</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {adminData.subjects.length > 0 ? adminData.subjects.slice(0, 5).map((subject) => (
                  <div key={subject.id} className="p-3 bg-slate-700/50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-white">{subject.name}</div>
                        {subject.code && (
                          <div className="text-sm text-slate-300">Code: {subject.code}</div>
                        )}
                      </div>
                      <Button size="sm" variant="outline" className="text-cyan-400 border-cyan-400/50">
                        Edit
                      </Button>
                    </div>
                  </div>
                )) : (
                  <div className="p-4 bg-slate-700/50 rounded-lg text-center text-slate-300">
                    No subjects configured
                  </div>
                )}
                <Button className="w-full bg-cyan-600 hover:bg-cyan-700 text-white">
                  <BookOpen className="w-4 h-4 mr-2" />
                  Add Subject
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* User Management */}
          <Card className="bg-slate-800/60 backdrop-blur-sm border border-slate-600/50 shadow-xl">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-red-400" />
                <CardTitle className="text-white">User Management</CardTitle>
              </div>
              <CardDescription className="text-slate-300">Manage users and roles</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <Button className="h-16 flex-col bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white">
                  <Users className="w-5 h-5 mb-1" />
                  Manage Students
                </Button>
                <Button className="h-16 flex-col bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white">
                  <GraduationCap className="w-5 h-5 mb-1" />
                  Manage Teachers
                </Button>
                <Button className="h-16 flex-col bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white">
                  <User className="w-5 h-5 mb-1" />
                  Manage Parents
                </Button>
                <Button className="h-16 flex-col bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white">
                  <Settings className="w-5 h-5 mb-1" />
                  Import/Export
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;