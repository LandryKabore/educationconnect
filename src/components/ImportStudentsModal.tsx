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

export function ImportStudentsModal({ isOpen, onClose, onSuccess, selectedSchoolId }: ImportStudentsModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [schools, setSchools] = useState<any[]>([]);
  const [schoolId, setSchoolId] = useState(selectedSchoolId || "");
  const [studentsData, setStudentsData] = useState<StudentData[]>([]);
  const [autoGenerate, setAutoGenerate] = useState(true);
  const [showAllStudents, setShowAllStudents] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch schools when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchSchools();
    }
  }, [isOpen]);

  const fetchSchools = async () => {
    const { data } = await supabase.from('schools').select('*').eq('active', true);
    if (data) setSchools(data);
  };

  const generateUsername = (firstName: string, middleName: string, lastName: string) => {
    const lastNameFormatted = lastName.toLowerCase().replace(/[^a-z]/g, '');
    const firstNameFormatted = firstName.toLowerCase().replace(/[^a-z]/g, '');
    const middleNameFormatted = middleName ? middleName.toLowerCase().replace(/[^a-z]/g, '') : '';
    
    if (middleNameFormatted) {
      return `${lastNameFormatted}.${middleNameFormatted}.${firstNameFormatted}`;
    } else {
      return `${lastNameFormatted}.${firstNameFormatted}`;
    }
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

      setStudentsData(processedStudents);
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

  const handleBulkImport = async () => {
    if (!schoolId || studentsData.length === 0) {
      toast({
        title: "Missing data",
        description: "Please select a school and upload student data",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const results = [];
      const errors = [];

      for (const student of studentsData) {
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

          if (error) throw error;
          results.push({ ...student, success: true });
        } catch (error: any) {
          console.error(`Error creating student ${student.username}:`, error);
          errors.push(`${student.firstName} ${student.lastName}: ${error.message}`);
          results.push({ ...student, success: false, error: error.message });
        }
      }

      const successCount = results.filter(r => r.success).length;
      const errorCount = errors.length;

      if (successCount > 0) {
        toast({
          title: "Import completed",
          description: `${successCount} students created successfully${errorCount > 0 ? `, ${errorCount} failed` : ''}`,
        });
      }

      if (errorCount > 0) {
        console.log('Import errors:', errors);
      }

      // Reset
      setStudentsData([]);
      onSuccess();
      onClose();

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

  const regenerateCredentials = () => {
    setStudentsData(prev => prev.map(student => ({
      ...student,
      username: generateUsername(student.firstName, student.middleName || '', student.lastName),
      tempPassword: generateTempPassword()
    })));
  };

  return (
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
              onClick={handleBulkImport} 
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
  );
}