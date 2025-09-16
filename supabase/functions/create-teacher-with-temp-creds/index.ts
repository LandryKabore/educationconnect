import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateTeacherRequest {
  firstName: string;
  lastName: string;
  username: string;
  tempPassword: string;
  schoolId: string;
  phone?: string;
  staffNo?: string;
  qualifications?: string[];
  classSectionIds?: string[];
  subjectIds?: string[];
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { firstName, lastName, username, tempPassword, schoolId, phone, staffNo, qualifications, classSectionIds, subjectIds }: CreateTeacherRequest = await req.json();

    console.log('Creating teacher with temp credentials:', { username, schoolId });

    // Check if username already exists
    const { data: existingCreds } = await supabase
      .from('teacher_temp_credentials')
      .select('username')
      .eq('username', username)
      .maybeSingle();

    if (existingCreds) {
      throw new Error('Username already exists');
    }

    // Generate a placeholder user ID for the teacher profile
    const tempUserId = crypto.randomUUID();

    // Hash the temporary password (simple hash for demo)
    const encoder = new TextEncoder();
    const data = encoder.encode(tempPassword);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const tempPasswordHash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Get current user (admin)
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized: Admin access required');
    }

    // Create teacher profile first
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        user_id: tempUserId,
        email: `temp_${username}@temp.local`, // Temporary email
        first_name: firstName,
        last_name: lastName,
        role: 'teacher'
      });

    if (profileError) {
      console.error('Profile creation error:', profileError);
      throw new Error(`Failed to create profile: ${profileError.message}`);
    }

    // Create teacher profile
    const { error: teacherError } = await supabase
      .from('teacher_profiles')
      .insert({
        user_id: tempUserId,
        school_id: schoolId,
        username: username,
        staff_no: staffNo,
        qualifications: qualifications,
        phone: phone,
        hire_date: new Date().toISOString().split('T')[0],
        first_login_completed: false,
        temp_password_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
      });

    if (teacherError) {
      console.error('Teacher profile creation error:', teacherError);
      // Clean up profile
      await supabase.from('profiles').delete().eq('user_id', tempUserId);
      throw new Error(`Failed to create teacher profile: ${teacherError.message}`);
    }

    // Create temporary credentials
    const { error: credsError } = await supabase
      .from('teacher_temp_credentials')
      .insert({
        username: username,
        temp_password_hash: tempPasswordHash,
        teacher_user_id: tempUserId,
        created_by: user.id,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      });

    if (credsError) {
      console.error('Temp credentials creation error:', credsError);
      // Clean up created records
      await supabase.from('teacher_profiles').delete().eq('user_id', tempUserId);
      await supabase.from('profiles').delete().eq('user_id', tempUserId);
      throw new Error(`Failed to create temp credentials: ${credsError.message}`);
    }

    // Create teaching assignments if provided
    if (classSectionIds && subjectIds && classSectionIds.length > 0 && subjectIds.length > 0) {
      // Get current academic year for the school
      const { data: academicYear } = await supabase
        .from('academic_years')
        .select('id')
        .eq('school_id', schoolId)
        .eq('active', true)
        .single();

      if (academicYear) {
        const assignments = [];
        for (const classSectionId of classSectionIds) {
          for (const subjectId of subjectIds) {
            assignments.push({
              teacher_user_id: tempUserId,
              class_section_id: classSectionId,
              subject_id: subjectId,
              academic_year_id: academicYear.id
            });
          }
        }

        const { error: assignmentError } = await supabase
          .from('teaching_assignments')
          .insert(assignments);

        if (assignmentError) {
          console.error('Teaching assignments creation error:', assignmentError);
          // Don't fail the entire operation, just log the error
        }
      }
    }

    console.log('Teacher created successfully with temp credentials');

    return new Response(
      JSON.stringify({ 
        success: true, 
        teacherId: tempUserId,
        username: username
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error('Error in create-teacher-with-temp-creds function:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error',
        details: error.toString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
};

serve(handler);