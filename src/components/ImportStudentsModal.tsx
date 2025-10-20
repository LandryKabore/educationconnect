import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Upload, Download, Loader2, RefreshCw } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import * as XLSX from 'xlsx';
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
import { Input } from "@/components/ui/input";

interface ImportStudentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  selectedSchoolId?: string;
}

interface StudentData {
  firstName: string;
  middleName?: string;
  lastName: string;
  gradeLevel?: string;
  studentNo?: string;
  username: string;
  tempPassword: string;
}

interface DuplicateStudent extends StudentData {
  originalUsername: string;
  suggestedUsername: string;
  rowIndex: number;
}

export function ImportStudentsModal({ isOpen, onClose, onSuccess, selectedSchoolId }: ImportStudentsModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [schools, setSchools] = useState<any[]>([]);
  const [schoolId, setSchoolId] = useState(selectedSchoolId || "");
  const [studentsData, setStudentsData] = useState<StudentData[]>([]);
  const [autoGenerate, setAutoGenerate] = useState(true);
  const [showAllStudents, setShowAllStudents] = useState(false);
  const [importErrors, setImportErrors] = useState<Array<{student: string, reason: string}>>([]);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [duplicateStudents, setDuplicateStudents] = useState<DuplicateStudent[]>([]);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch schools when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchSchools();
    }
  }, [isOpen]);

  const fetchSchools = async () => {
    try {
      // Check if user is super admin
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: isSuperAdmin } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'super_admin')
        .eq('active', true)
        .maybeSingle();

      let query = supabase
        .from('schools')
        .select('*')
        .eq('active', true);

      // If not super admin, filter by schools this admin manages
      if (!isSuperAdmin) {
        const { data: adminSchools } = await supabase
          .from('user_roles')
          .select('school_id')
          .eq('user_id', user.id)
          .eq('role', 'school_admin')
          .eq('active', true);

        const schoolIds = adminSchools?.map(r => r.school_id).filter(Boolean) || [];
        if (schoolIds.length > 0) {
          query = query.in('id', schoolIds);
        } else {
          setSchools([]);
          return;
        }
      }

      const { data } = await query;
      if (data) setSchools(data);
    } catch (error) {
      console.error('Error fetching schools:', error);
    }
  };

  const generateUsername = (firstName: string, middleName: string, lastName: string, suffix?: number) => {
    const lastNameFormatted = lastName.toLowerCase().replace(/[^a-z]/g, '');
    const firstNameFormatted = firstName.toLowerCase().replace(/[^a-z]/g, '');
    const middleNameFormatted = middleName ? middleName.toLowerCase().replace(/[^a-z]/g, '') : '';
    
    let baseUsername = '';
    if (middleNameFormatted) {
      baseUsername = `${lastNameFormatted}.${middleNameFormatted}.${firstNameFormatted}`;
    } else {
      baseUsername = `${lastNameFormatted}.${firstNameFormatted}`;
    }
    
    return suffix ? `${baseUsername}${suffix}` : baseUsername;
  };

  const generateAlternativeUsername = (student: StudentData, existingUsernames: Set<string>): string => {
    // Try with middle name first if not already used
    if (student.middleName && !student.username.includes(student.middleName.toLowerCase())) {
      const withMiddle = generateUsername(student.firstName, student.middleName, student.lastName);
      if (!existingUsernames.has(withMiddle)) return withMiddle;
    }
    
    // Try adding numbers
    let suffix = 1;
    let newUsername = generateUsername(student.firstName, student.middleName || '', student.lastName, suffix);
    while (existingUsernames.has(newUsername)) {
      suffix++;
      newUsername = generateUsername(student.firstName, student.middleName || '', student.lastName, suffix);
    }
    
    return newUsername;
  };

  const generateTempPassword = () => {
    let result = '';
    for (let i = 0; i < 4; i++) {
      result += Math.floor(Math.random() * 10).toString();
    }
    return result;
  };

  const downloadTemplate = () => {
    const templateData = [
      {
        'First Name': 'David',
        'Middle Name': '',
        'Last Name': 'Okafor',
        'Class': 'Grade 9A'
      },
      {
        'First Name': 'Daniel',
        'Middle Name': 'Amara',
        'Last Name': 'Nzinga',
        'Class': 'Grade 9A'
      },
      {
        'First Name': 'Fatou',
        'Middle Name': 'Kwame',
        'Last Name': 'Lamine',
        'Class': 'Grade 9A'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Students');
    XLSX.writeFile(wb, 'student_import_template.xlsx');
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

      const processedStudents: StudentData[] = jsonData.map((row, index) => {
        const firstName = row['First Name'] || row['first_name'] || row['firstName'] || '';
        const middleName = row['Middle Name'] || row['middle_name'] || row['middleName'] || '';
        const lastName = row['Last Name'] || row['last_name'] || row['lastName'] || '';
        const gradeLevel = row['Class'] || row['class'] || row['Grade Level'] || row['grade_level'] || row['gradeLevel'] || '';
        const studentNo = row['Student Number'] || row['student_number'] || row['studentNo'] || '';

        if (!firstName || !lastName) {
          throw new Error(`Row ${index + 2}: First Name and Last Name are required`);
        }

        const username = generateUsername(firstName, middleName, lastName);
        const tempPassword = autoGenerate ? generateTempPassword() : '';

        return {
          firstName,
          middleName: middleName || undefined,
          lastName,
          gradeLevel: gradeLevel || undefined,
          studentNo: studentNo || undefined,
          username,
          tempPassword
        };
      });

      // Detect duplicates
      const usernameCount = new Map<string, number>();
      const duplicates: DuplicateStudent[] = [];
      const validStudents: StudentData[] = [];
      
      processedStudents.forEach((student, index) => {
        const count = usernameCount.get(student.username) || 0;
        usernameCount.set(student.username, count + 1);
        
        if (count > 0) {
          // This is a duplicate
          const existingUsernames = new Set(processedStudents.map(s => s.username));
          const suggested = generateAlternativeUsername(student, existingUsernames);
          duplicates.push({
            ...student,
            originalUsername: student.username,
            suggestedUsername: suggested,
            rowIndex: index + 2
          });
        } else {
          validStudents.push(student);
        }
      });

      if (duplicates.length > 0) {
        setDuplicateStudents(duplicates);
        setStudentsData(validStudents);
        setShowDuplicateDialog(true);
      } else {
        setStudentsData(processedStudents);
      }
      toast({
        title: "File processed successfully",
        description: `Found ${processedStudents.length} students to import`,
      });
    } catch (error: any) {
      console.error('Error processing file:', error);
      toast({
        title: "Error processing file",
        description: error.message || "Failed to process Excel file",
        variant: "destructive"
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleBulkImport = async (studentsToImport?: StudentData[]) => {
    const students = studentsToImport || studentsData;
    
    if (!schoolId || students.length === 0) {
      toast({
        title: "Missing data",
        description: "Please select a school and upload student data",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    const failedImports: Array<{student: string, reason: string}> = [];
    
    try {
      let successCount = 0;

      for (const student of students) {
        try {
          const { data, error } = await supabase.functions.invoke('create-student-with-temp-creds', {
            body: {
              firstName: student.firstName,
              middleName: student.middleName || null,
              lastName: student.lastName,
              schoolId: schoolId,
              gradeLevel: student.gradeLevel || null,
              studentNo: student.studentNo || null,
              username: student.username,
              tempPassword: student.tempPassword
            }
          });

          // Extract detailed error message from response
          if (error) {
            // Try to get detailed error from the response body
            const errorMessage = data?.error || error.message || 'Unknown error occurred';
            throw new Error(errorMessage);
          }
          
          // Check if response has error
          if (data && data.error) {
            throw new Error(data.error);
          }
          
          successCount++;
        } catch (error: any) {
          console.error(`Error creating student ${student.username}:`, error);
          const studentName = `${student.firstName}${student.middleName ? ' ' + student.middleName : ''} ${student.lastName}`;
          const errorReason = error.message || 'Unknown error';
          failedImports.push({
            student: `${studentName} (${student.username})`,
            reason: errorReason
          });
        }
      }

      if (successCount > 0) {
        toast({
          title: "Import completed",
          description: `${successCount} students created successfully${failedImports.length > 0 ? `, ${failedImports.length} failed` : ''}`,
        });
      }

      if (failedImports.length > 0) {
        setImportErrors(failedImports);
        setShowErrorDialog(true);
      } else {
        // Only reset and close if no errors
        setStudentsData([]);
        setDuplicateStudents([]);
        onSuccess();
        onClose();
      }

    } catch (error: any) {
      console.error('Bulk import error:', error);
      toast({
        title: "Import failed",
        description: error.message || "Failed to import students",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApproveDuplicates = async () => {
    // Add approved duplicates to studentsData
    const approvedStudents = duplicateStudents.map(dup => ({
      firstName: dup.firstName,
      middleName: dup.middleName,
      lastName: dup.lastName,
      gradeLevel: dup.gradeLevel,
      studentNo: dup.studentNo,
      username: dup.suggestedUsername,
      tempPassword: dup.tempPassword
    }));
    
    setShowDuplicateDialog(false);
    setStudentsData(prev => [...prev, ...approvedStudents]);
    setDuplicateStudents([]);
    
    toast({
      title: "Duplicates resolved",
      description: `${approvedStudents.length} students added with new usernames`,
    });
  };

  const updateDuplicateUsername = (index: number, newUsername: string) => {
    setDuplicateStudents(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], suggestedUsername: newUsername };
      return updated;
    });
  };

  const regenerateCredentials = () => {
    setStudentsData(prev => prev.map(student => ({
      ...student,
      username: generateUsername(student.firstName, student.middleName || '', student.lastName),
      tempPassword: generateTempPassword()
    })));
  };

  return (
    <>
      {/* Duplicate Username Dialog */}
      <AlertDialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <AlertDialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Duplicate Usernames Detected</AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>
                The following students have duplicate usernames. We've suggested alternative usernames.
                You can edit them if needed, then approve to add them to the import list.
              </p>
              <div className="space-y-4 rounded-md border p-4">
                {duplicateStudents.map((dup, index) => (
                  <div key={index} className="border-b pb-4 last:border-b-0 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-foreground">
                          {dup.firstName} {dup.middleName} {dup.lastName}
                        </p>
                        <p className="text-sm text-muted-foreground">Row {dup.rowIndex}</p>
                        {dup.gradeLevel && (
                          <p className="text-sm text-muted-foreground">{dup.gradeLevel}</p>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">Original:</span>
                        <span className="font-mono text-destructive line-through">{dup.originalUsername}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">New:</span>
                        <Input
                          value={dup.suggestedUsername}
                          onChange={(e) => updateDuplicateUsername(index, e.target.value)}
                          className="font-mono flex-1"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowDuplicateDialog(false);
              setDuplicateStudents([]);
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleApproveDuplicates}>
              Approve & Add to Import
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Error Dialog */}
      <AlertDialog open={showErrorDialog} onOpenChange={setShowErrorDialog}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Import Failed for {importErrors.length} Student{importErrors.length > 1 ? 's' : ''}</AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>The following students could not be imported. Please review the errors below:</p>
              <div className="max-h-[400px] overflow-y-auto space-y-3 rounded-md border p-4">
                {importErrors.map((error, index) => (
                  <div key={index} className="border-b pb-3 last:border-b-0">
                    <p className="font-semibold text-foreground">{error.student}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      <span className="font-medium">Reason:</span> {error.reason}
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-sm">
                Common issues:
              </p>
              <ul className="text-sm list-disc list-inside space-y-1">
                <li>Duplicate usernames in your file</li>
                <li>Student already exists in the system</li>
                <li>Missing required information</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => {
              setShowErrorDialog(false);
              setImportErrors([]);
            }}>
              I Understand
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import Students from Excel</DialogTitle>
          </DialogHeader>
        
        <div className="space-y-6">
          {/* School Selection */}
          <div className="space-y-2">
            <Label htmlFor="school">School *</Label>
            <Select value={schoolId} onValueChange={setSchoolId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a school" />
              </SelectTrigger>
              <SelectContent>
                {schools.map((school) => (
                  <SelectItem key={school.id} value={school.id}>
                    {school.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Template Download */}
          <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
            <div className="flex-1">
              <h3 className="font-medium">Download Template</h3>
              <p className="text-sm text-muted-foreground">
                Download the Excel template with the required columns
              </p>
            </div>
            <Button type="button" variant="outline" onClick={downloadTemplate}>
              <Download className="h-4 w-4 mr-2" />
              Download Template
            </Button>
          </div>

          {/* File Upload */}
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Label htmlFor="file-upload">Upload Excel File</Label>
              <div className="flex items-center gap-2">
                <Label htmlFor="autoGenerate" className="text-sm">Auto-generate passwords</Label>
                <Switch
                  id="autoGenerate"
                  checked={autoGenerate}
                  onCheckedChange={setAutoGenerate}
                />
              </div>
            </div>
            
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
                id="file-upload"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Upload Excel File
              </Button>
              
              {studentsData.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={regenerateCredentials}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Regenerate Credentials
                </Button>
              )}
            </div>
          </div>

          {/* Preview */}
          {studentsData.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-medium">Preview ({studentsData.length} students)</h3>
              <div className="max-h-64 overflow-y-auto border rounded-md">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="p-2 text-left">Name</th>
                      <th className="p-2 text-left">Class</th>
                      <th className="p-2 text-left">Student #</th>
                      <th className="p-2 text-left">Username</th>
                      <th className="p-2 text-left">Temp Password</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(showAllStudents ? studentsData : studentsData.slice(0, 10)).map((student, index) => (
                      <tr key={index} className="border-b">
                        <td className="p-2">
                          {student.firstName} {student.middleName} {student.lastName}
                        </td>
                        <td className="p-2">{student.gradeLevel || '-'}</td>
                        <td className="p-2">{student.studentNo || '-'}</td>
                        <td className="p-2 font-mono">{student.username}</td>
                        <td className="p-2 font-mono">{student.tempPassword}</td>
                      </tr>
                    ))}
                    {studentsData.length > 10 && !showAllStudents && (
                      <tr>
                        <td colSpan={5} className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => setShowAllStudents(true)}
                            className="text-primary hover:underline"
                          >
                            ... and {studentsData.length - 10} more students (click to show all)
                          </button>
                        </td>
                      </tr>
                    )}
                    {showAllStudents && studentsData.length > 10 && (
                      <tr>
                        <td colSpan={5} className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => setShowAllStudents(false)}
                            className="text-primary hover:underline"
                          >
                            Show less
                          </button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              onClick={() => handleBulkImport()} 
              disabled={loading || studentsData.length === 0 || !schoolId}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                `Import ${studentsData.length} Students`
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}