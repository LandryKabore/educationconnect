import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateTeacherRequest {
  firstName: string;
  middleInitial?: string;
  lastName: string;
  prefix: string;
  gender: string;
  dob: string;
  username: string;
  tempPassword: string;
  schoolId: string;
  phone?: string;
  staffNo?: string;
  qualifications?: string[];
  subjectsTaught?: string;
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

    const { firstName, middleInitial, lastName, prefix, gender, dob, username, tempPassword, schoolId, phone, staffNo, qualifications, subjectsTaught }: CreateTeacherRequest = await req.json();

    console.log('Creating teacher with temp credentials:', { username, schoolId });

    // Check if username already exists and make it unique if needed
    let finalUsername = username;
    let counter = 1;
    
    while (true) {
      const { data: existingCreds } = await supabase
        .from('teacher_temp_credentials')
        .select('username')
        .eq('username', finalUsername)
        .maybeSingle();

      if (!existingCreds) {
        break; // Username is available
      }
      
      // Try with a number suffix
      finalUsername = `${username}${counter}`;
      counter++;
      
      // Prevent infinite loop
      if (counter > 100) {
        throw new Error('Unable to generate unique username');
      }
    }

    // Create actual auth user immediately
    console.log('Creating auth user for teacher...');
    const { data: authData, error: authCreateError } = await supabase.auth.admin.createUser({
      email: `${finalUsername}@teacher.local`,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        role: 'teacher',
        school_id: schoolId
      }
    });

    if (authCreateError || !authData.user) {
      console.error('Error creating auth user:', authCreateError);
      throw new Error(`Failed to create teacher account: ${authCreateError?.message}`);
    }

    const tempUserId = authData.user.id;
    console.log('Auth user created successfully:', tempUserId);

    // Hash the temporary password for storage
    const encoder = new TextEncoder();
    const data = encoder.encode(tempPassword);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const tempPasswordHash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Get current user (admin) from the authorization header
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('Unauthorized: No authorization header');
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (userError || !user) {
      throw new Error('Unauthorized: Admin access required');
    }

    // Create temporary credentials with all teacher information
    const { error: credsError } = await supabase
      .from('teacher_temp_credentials')
      .insert({
        username: finalUsername,
        temp_password_hash: tempPasswordHash,
        temp_password_plain: tempPassword,
        teacher_user_id: tempUserId,
        created_by: user.id,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        // Store teacher info in temp credentials
        first_name: firstName,
        middle_initial: middleInitial,
        last_name: lastName,
        prefix: prefix,
        gender: gender,
        dob: dob,
        school_id: schoolId,
        phone: phone,
        staff_no: staffNo,
        qualifications: qualifications
      });

    if (credsError) {
      console.error('Temp credentials creation error:', credsError);
      throw new Error(`Failed to create temp credentials: ${credsError.message}`);
    }

    console.log('Teacher temp credentials created successfully');

    // Update teacher profile with additional details (profile created by trigger)
    await supabase
      .from('teacher_profiles')
      .update({
        staff_no: staffNo,
        qualifications: qualifications,
        subjects_taught: subjectsTaught,
        phone: phone,
        username: finalUsername,
        prefix: prefix,
        gender: gender,
        dob: dob,
        first_login_completed: false
      })
      .eq('user_id', tempUserId);

    console.log('Teacher profile updated with details');

    return new Response(
      JSON.stringify({ 
        success: true, 
        teacherId: tempUserId,
        username: finalUsername,
        message: 'Teacher created successfully'
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