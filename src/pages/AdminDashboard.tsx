import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, User, Settings, School, Users, Calendar, BookOpen, MapPin, GraduationCap, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AdminLogin } from "@/components/AdminLogin";
import { UserListModal } from "@/components/UserListModal";
import { CreateSchoolModal } from "@/components/CreateSchoolModal";
import { EditSchoolModal } from "@/components/EditSchoolModal";
import { CreateCampusModal } from "@/components/CreateCampusModal";
import { EditCampusModal } from "@/components/EditCampusModal";
import { CreateAcademicYearModal } from "@/components/CreateAcademicYearModal";
import { EditAcademicYearModal } from "@/components/EditAcademicYearModal";
import { CreateClassSectionModal } from "@/components/CreateClassSectionModal";
import { EditClassSectionModal } from "@/components/EditClassSectionModal";
import { CreateSubjectModal } from "@/components/CreateSubjectModal";
import { EditSubjectModal } from "@/components/EditSubjectModal";
import { CreateTeacherModal } from "@/components/CreateTeacherModal";
import { CreateStudentModal } from "@/components/CreateStudentModal";
import { ImportStudentsModal } from "@/components/ImportStudentsModal";
import { SchoolSelector } from "@/components/SchoolSelector";

interface AdminData {
  schools: any[];
  campuses: any[];
  academicYears: any[];
  classSections: any[];
  subjects: any[];
  users: any[];
  studentTempCredentials: any[];
  totalStudents: number;
  totalTeachers: number;
  totalParents: number;
}

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [hasAdminAccess, setHasAdminAccess] = useState(false);
  
  // Modal states
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [userModalType, setUserModalType] = useState<'student' | 'teacher' | 'parent' | 'all'>('all');
  const [userModalTitle, setUserModalTitle] = useState('');
  const [createSchoolModalOpen, setCreateSchoolModalOpen] = useState(false);
  const [editSchoolModalOpen, setEditSchoolModalOpen] = useState(false);
  const [createCampusModalOpen, setCreateCampusModalOpen] = useState(false);
  const [editCampusModalOpen, setEditCampusModalOpen] = useState(false);
  const [createAcademicYearModalOpen, setCreateAcademicYearModalOpen] = useState(false);
  const [editAcademicYearModalOpen, setEditAcademicYearModalOpen] = useState(false);
  const [createClassSectionModalOpen, setCreateClassSectionModalOpen] = useState(false);
  const [editClassSectionModalOpen, setEditClassSectionModalOpen] = useState(false);
  const [createSubjectModalOpen, setCreateSubjectModalOpen] = useState(false);
  const [editSubjectModalOpen, setEditSubjectModalOpen] = useState(false);
  const [createTeacherModalOpen, setCreateTeacherModalOpen] = useState(false);
  const [createStudentModalOpen, setCreateStudentModalOpen] = useState(false);
  const [importStudentsModalOpen, setImportStudentsModalOpen] = useState(false);
  
  // State for items being edited
  const [editingSchool, setEditingSchool] = useState<any>(null);
  const [editingCampus, setEditingCampus] = useState<any>(null);
  const [editingAcademicYear, setEditingAcademicYear] = useState<any>(null);
  const [editingClassSection, setEditingClassSection] = useState<any>(null);
  const [editingSubject, setEditingSubject] = useState<any>(null);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null);
  const [adminData, setAdminData] = useState<AdminData>({
    schools: [],
    campuses: [],
    academicYears: [],
    classSections: [],
    subjects: [],
    users: [],
    studentTempCredentials: [],
    totalStudents: 0,
    totalTeachers: 0,
    totalParents: 0,
  });

  useEffect(() => {
    // Listen for auth changes and verify admin role
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        checkAdminAndLoad();
      } else {
        setHasAdminAccess(false);
        setLoading(false);
      }
    });

    // Also check current session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        checkAdminAndLoad();
      } else {
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Refetch data when selected school changes
  useEffect(() => {
    if (hasAdminAccess) {
      fetchAdminData();
    }
  }, [selectedSchoolId]);

  async function checkAdminAndLoad() {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('is_admin');
      if (error) throw error;
      if (data === true) {
        setHasAdminAccess(true);
        await fetchAdminData();
      } else {
        setHasAdminAccess(false);
        toast({
          title: "Unauthorized",
          description: "You must be an admin to access this dashboard.",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error('Error checking admin access:', err);
      toast({
        title: "Error",
        description: "Failed to verify admin access.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  const fetchAdminData = async () => {
    try {
      // Build queries based on selected school
      let schoolFilter = selectedSchoolId ? { school_id: selectedSchoolId } : {};
      
      const [
        schoolsData,
        campusesData,
        academicYearsData,
        classSectionsData,
        subjectsData,
        profilesData,
        studentProfilesData,
        studentTempCredsData,
        teacherProfilesData,
        parentProfilesData
      ] = await Promise.all([
        supabase.from('schools').select('*').eq('active', true),
        supabase.from('campuses').select('*').then(result => ({
          ...result,
          data: selectedSchoolId ? result.data?.filter(c => c.school_id === selectedSchoolId) : result.data
        })),
        supabase.from('academic_years').select('*').order('created_at', { ascending: false }).then(result => ({
          ...result,
          data: selectedSchoolId ? result.data?.filter(ay => ay.school_id === selectedSchoolId) : result.data
        })),
        supabase.from('class_sections').select('*').then(result => ({
          ...result,
          data: selectedSchoolId ? result.data?.filter(cs => cs.school_id === selectedSchoolId) : result.data
        })),
        supabase.from('subjects').select('*').then(result => ({
          ...result,
          data: selectedSchoolId ? result.data?.filter(s => !s.school_id || s.school_id === selectedSchoolId) : result.data
        })),
        // Fetch all profiles first
        supabase.from('profiles').select('*'),
        // Then get student profiles to link students to schools
        supabase.from('student_profiles').select('*, profiles!inner(*)').then(result => ({
          ...result,
          data: selectedSchoolId ? result.data?.filter(sp => sp.school_id === selectedSchoolId) : result.data
        })),
        // And get student temp credentials to include pending students
        supabase.from('student_temp_credentials').select('*').then(result => ({
          ...result,
          data: selectedSchoolId ? result.data?.filter(stc => stc.school_id === selectedSchoolId) : result.data
        })),
        // And teacher profiles to link teachers to schools
        supabase.from('teacher_profiles').select('*, profiles!inner(*)').then(result => ({
          ...result,
          data: selectedSchoolId ? result.data?.filter(tp => tp.school_id === selectedSchoolId) : result.data
        })),
        // And parent profiles to link parents to schools
        supabase.from('parent_profiles').select('*, profiles!inner(*)').then(result => ({
          ...result,
          data: selectedSchoolId ? result.data?.filter(pp => pp.school_id === selectedSchoolId) : result.data
        }))
      ]);

      console.log('Profiles data:', profilesData);
      console.log('Student profiles data:', studentProfilesData);
      console.log('Teacher profiles data:', teacherProfilesData);
      console.log('Parent profiles data:', parentProfilesData);
      
      if (profilesData.error) {
        console.error('Error fetching profiles:', profilesData.error);
      }

      // Calculate totals based on school filter
      let students = 0;
      let teachers = 0;
      let parents = 0;

      if (selectedSchoolId) {
        // Count students linked to this school (both completed profiles and temp credentials)
        const completedStudents = studentProfilesData.data?.length || 0;
        const pendingStudents = studentTempCredsData.data?.length || 0;
        students = completedStudents + pendingStudents;
        // Count teachers linked to this school
        teachers = teacherProfilesData.data?.length || 0;
        // Count parents linked to this school
        parents = parentProfilesData.data?.length || 0;
      } else {
        // Count all users (completed profiles and temp credentials)
        const completedStudents = profilesData.data?.filter(p => p.role === 'student').length || 0;
        const pendingStudents = studentTempCredsData.data?.length || 0;
        students = completedStudents + pendingStudents;
        teachers = profilesData.data?.filter(p => p.role === 'teacher').length || 0;
        parents = profilesData.data?.filter(p => p.role === 'parent').length || 0;
      }

      console.log('Student count:', students);
      console.log('Teacher count:', teachers);
      console.log('Parent count:', parents);

      setAdminData({
        schools: schoolsData.data || [],
        campuses: campusesData.data || [],
        academicYears: academicYearsData.data || [],
        classSections: classSectionsData.data || [],
        subjects: subjectsData.data || [],
        users: profilesData.data || [],
        studentTempCredentials: studentTempCredsData.data || [],
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

  const handleUserStatClick = (type: 'student' | 'teacher' | 'parent' | 'all', title: string) => {
    setUserModalType(type);
    setUserModalTitle(title);
    setUserModalOpen(true);
  };

  // Edit handlers
  const handleEditSchool = (school: any) => {
    setEditingSchool(school);
    setEditSchoolModalOpen(true);
  };

  const handleEditCampus = (campus: any) => {
    setEditingCampus(campus);
    setEditCampusModalOpen(true);
  };

  const handleEditAcademicYear = (academicYear: any) => {
    setEditingAcademicYear(academicYear);
    setEditAcademicYearModalOpen(true);
  };

  const handleEditClassSection = (classSection: any) => {
    setEditingClassSection(classSection);
    setEditClassSectionModalOpen(true);
  };

  const handleEditSubject = (subject: any) => {
    setEditingSubject(subject);
    setEditSubjectModalOpen(true);
  };


  if (!hasAdminAccess) {
    return <AdminLogin onSuccess={() => {}} />;
  }

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
        {/* School Selector */}
        <div className="mb-8">
          <SchoolSelector 
            selectedSchoolId={selectedSchoolId}
            onSchoolSelect={setSelectedSchoolId}
            onRefresh={fetchAdminData}
          />
        </div>
        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card 
            className="bg-slate-800/50 border-slate-700 shadow-lg cursor-pointer hover:bg-slate-800/70 transition-colors"
            onClick={() => handleUserStatClick('student', 'Students')}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-200">Total Students</CardTitle>
              <GraduationCap className="w-4 h-4 text-blue-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{adminData.totalStudents}</div>
            </CardContent>
          </Card>

          <Card 
            className="bg-slate-800/50 border-slate-700 shadow-lg cursor-pointer hover:bg-slate-800/70 transition-colors"
            onClick={() => handleUserStatClick('teacher', 'Teachers')}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-200">Total Teachers</CardTitle>
              <Users className="w-4 h-4 text-green-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{adminData.totalTeachers}</div>
            </CardContent>
          </Card>

          <Card 
            className="bg-slate-800/50 border-slate-700 shadow-lg cursor-pointer hover:bg-slate-800/70 transition-colors"
            onClick={() => handleUserStatClick('parent', 'Parents')}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-200">Total Parents</CardTitle>
              <User className="w-4 h-4 text-yellow-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{adminData.totalParents}</div>
            </CardContent>
          </Card>

          <Card 
            className="bg-slate-800/50 border-slate-700 shadow-lg cursor-pointer hover:bg-slate-800/70 transition-colors"
            onClick={() => handleUserStatClick('all', 'All Schools')}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-200">Active Schools</CardTitle>
              <School className="w-4 h-4 text-purple-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{adminData.schools.length}</div>
            </CardContent>
          </Card>
        </div>

        {/* Management Sections */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Schools Management */}
          <Card className="bg-slate-800/50 border-slate-700 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <School className="w-5 h-5 text-blue-400" />
                Schools
              </CardTitle>
              <CardDescription className="text-slate-300">
                Manage school institutions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="space-y-2">
                  {adminData.schools.slice(0, 3).map((school) => (
                    <div key={school.id} className="flex items-center justify-between bg-slate-700/30 p-2 rounded">
                      <span className="text-slate-200 text-sm">{school.name}</span>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="border-slate-600 text-slate-200 hover:bg-slate-700"
                        onClick={() => handleEditSchool(school)}
                      >
                        Edit
                      </Button>
                    </div>
                  ))}
                  {adminData.schools.length > 3 && (
                    <p className="text-xs text-slate-400">+{adminData.schools.length - 3} more</p>
                  )}
                </div>
              <Button 
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => setCreateSchoolModalOpen(true)}
              >
                Create New School
              </Button>
            </CardContent>
          </Card>

          {/* Campuses & Locations */}
          <Card className="bg-slate-800/50 border-slate-700 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <MapPin className="w-5 h-5 text-green-400" />
                Campuses & Locations
              </CardTitle>
              <CardDescription className="text-slate-300">
                Manage school campuses
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="space-y-2">
                  {adminData.campuses.slice(0, 3).map((campus) => (
                    <div key={campus.id} className="flex items-center justify-between bg-slate-700/30 p-2 rounded">
                      <span className="text-slate-200 text-sm">{campus.name}</span>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="border-slate-600 text-slate-200 hover:bg-slate-700"
                        onClick={() => handleEditCampus(campus)}
                      >
                        Edit
                      </Button>
                    </div>
                  ))}
                  {adminData.campuses.length > 3 && (
                    <p className="text-xs text-slate-400">+{adminData.campuses.length - 3} more</p>
                  )}
                </div>
              <Button 
                className="w-full bg-green-600 hover:bg-green-700 text-white"
                onClick={() => setCreateCampusModalOpen(true)}
              >
                Add New Campus
              </Button>
            </CardContent>
          </Card>

          {/* Academic Years */}
          <Card className="bg-slate-800/50 border-slate-700 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Calendar className="w-5 h-5 text-yellow-400" />
                Academic Years
              </CardTitle>
              <CardDescription className="text-slate-300">
                Manage academic periods
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="space-y-2">
                  {adminData.academicYears.slice(0, 3).map((year) => (
                    <div key={year.id} className="flex items-center justify-between bg-slate-700/30 p-2 rounded">
                      <span className="text-slate-200 text-sm">{year.name}</span>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="border-slate-600 text-slate-200 hover:bg-slate-700"
                        onClick={() => handleEditAcademicYear(year)}
                      >
                        Edit
                      </Button>
                    </div>
                  ))}
                  {adminData.academicYears.length > 3 && (
                    <p className="text-xs text-slate-400">+{adminData.academicYears.length - 3} more</p>
                  )}
                </div>
              <Button 
                className="w-full bg-yellow-600 hover:bg-yellow-700 text-white"
                onClick={() => setCreateAcademicYearModalOpen(true)}
              >
                Create Academic Year
              </Button>
            </CardContent>
          </Card>

          {/* Class Sections */}
          <Card className="bg-slate-800/50 border-slate-700 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Users className="w-5 h-5 text-purple-400" />
                Class Sections
              </CardTitle>
              <CardDescription className="text-slate-300">
                Manage class sections
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="space-y-2">
                  {adminData.classSections.slice(0, 3).map((section) => (
                    <div key={section.id} className="flex items-center justify-between bg-slate-700/30 p-2 rounded">
                      <span className="text-slate-200 text-sm">{section.name} - {section.grade_level}</span>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="border-slate-600 text-slate-200 hover:bg-slate-700"
                        onClick={() => handleEditClassSection(section)}
                      >
                        Edit
                      </Button>
                    </div>
                  ))}
                  {adminData.classSections.length > 3 && (
                    <p className="text-xs text-slate-400">+{adminData.classSections.length - 3} more</p>
                  )}
                </div>
              <Button 
                className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                onClick={() => setCreateClassSectionModalOpen(true)}
              >
                Create Class Section
              </Button>
            </CardContent>
          </Card>

          {/* Subjects */}
          <Card className="bg-slate-800/50 border-slate-700 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <BookOpen className="w-5 h-5 text-red-400" />
                Subjects
              </CardTitle>
              <CardDescription className="text-slate-300">
                Manage academic subjects
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="space-y-2">
                  {adminData.subjects.slice(0, 3).map((subject) => (
                    <div key={subject.id} className="flex items-center justify-between bg-slate-700/30 p-2 rounded">
                      <span className="text-slate-200 text-sm">{subject.name}</span>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="border-slate-600 text-slate-200 hover:bg-slate-700"
                        onClick={() => handleEditSubject(subject)}
                      >
                        Edit
                      </Button>
                    </div>
                  ))}
                  {adminData.subjects.length > 3 && (
                    <p className="text-xs text-slate-400">+{adminData.subjects.length - 3} more</p>
                  )}
                </div>
              <Button 
                className="w-full bg-red-600 hover:bg-red-700 text-white"
                onClick={() => setCreateSubjectModalOpen(true)}
              >
                Add New Subject
              </Button>
            </CardContent>
          </Card>

          {/* User Management */}
          <Card className="bg-slate-800/50 border-slate-700 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <User className="w-5 h-5 text-indigo-400" />
                User Management
              </CardTitle>
              <CardDescription className="text-slate-300">
                Manage system users
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="border-slate-600 text-slate-200 hover:bg-slate-700"
                  onClick={() => handleUserStatClick('student', 'Students')}
                >
                  Students
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="border-slate-600 text-slate-200 hover:bg-slate-700"
                  onClick={() => handleUserStatClick('teacher', 'Teachers')}
                >
                  Teachers
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="border-slate-600 text-slate-200 hover:bg-slate-700"
                  onClick={() => handleUserStatClick('parent', 'Parents')}
                >
                  Parents
                </Button>
                <Button size="sm" variant="outline" className="border-slate-600 text-slate-200 hover:bg-slate-700">
                  Import/Export
                </Button>
              </div>
              <div className="space-y-2 mt-3">
                <Button 
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
                  onClick={() => setCreateTeacherModalOpen(true)}
                >
                  Create Teacher Account
                </Button>
                <Button 
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => setCreateStudentModalOpen(true)}
                >
                  Create Student Account
                </Button>
                <Button 
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => setImportStudentsModalOpen(true)}
                >
                  Import Students from Excel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Modals */}
      <UserListModal
        isOpen={userModalOpen}
        onClose={() => setUserModalOpen(false)}
        userType={userModalType}
        title={userModalTitle}
        selectedSchoolId={selectedSchoolId}
      />

      <CreateSchoolModal
        isOpen={createSchoolModalOpen}
        onClose={() => setCreateSchoolModalOpen(false)}
        onSuccess={fetchAdminData}
      />

      <EditSchoolModal
        isOpen={editSchoolModalOpen}
        onClose={() => setEditSchoolModalOpen(false)}
        onSuccess={fetchAdminData}
        school={editingSchool}
      />

      <CreateCampusModal
        isOpen={createCampusModalOpen}
        onClose={() => setCreateCampusModalOpen(false)}
        onSuccess={fetchAdminData}
      />

      <EditCampusModal
        isOpen={editCampusModalOpen}
        onClose={() => setEditCampusModalOpen(false)}
        onSuccess={fetchAdminData}
        campus={editingCampus}
      />

      <CreateAcademicYearModal
        isOpen={createAcademicYearModalOpen}
        onClose={() => setCreateAcademicYearModalOpen(false)}
        onSuccess={fetchAdminData}
        selectedSchoolId={selectedSchoolId}
      />

      <EditAcademicYearModal
        isOpen={editAcademicYearModalOpen}
        onClose={() => setEditAcademicYearModalOpen(false)}
        onSuccess={fetchAdminData}
        academicYear={editingAcademicYear}
      />

      <CreateClassSectionModal
        isOpen={createClassSectionModalOpen}
        onClose={() => setCreateClassSectionModalOpen(false)}
        onSuccess={fetchAdminData}
        selectedSchoolId={selectedSchoolId}
      />

      <EditClassSectionModal
        isOpen={editClassSectionModalOpen}
        onClose={() => setEditClassSectionModalOpen(false)}
        onSuccess={fetchAdminData}
        classSection={editingClassSection}
        selectedSchoolId={selectedSchoolId}
      />

      <CreateSubjectModal
        isOpen={createSubjectModalOpen}
        onClose={() => setCreateSubjectModalOpen(false)}
        onSuccess={fetchAdminData}
        selectedSchoolId={selectedSchoolId}
      />

      <EditSubjectModal
        isOpen={editSubjectModalOpen}
        onClose={() => setEditSubjectModalOpen(false)}
        onSuccess={fetchAdminData}
        subject={editingSubject}
      />

      <CreateTeacherModal
        isOpen={createTeacherModalOpen}
        onClose={() => setCreateTeacherModalOpen(false)}
        onTeacherCreated={fetchAdminData}
        selectedSchoolId={selectedSchoolId || undefined}
      />
      
      <CreateStudentModal
        isOpen={createStudentModalOpen}
        onClose={() => setCreateStudentModalOpen(false)}
        onSuccess={fetchAdminData}
        selectedSchoolId={selectedSchoolId}
      />

      <ImportStudentsModal
        isOpen={importStudentsModalOpen}
        onClose={() => setImportStudentsModalOpen(false)}
        onSuccess={fetchAdminData}
        selectedSchoolId={selectedSchoolId || undefined}
      />
    </div>
  );
};

export default AdminDashboard;