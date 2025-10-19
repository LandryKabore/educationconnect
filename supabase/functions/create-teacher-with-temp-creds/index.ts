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

    const { firstName, middleInitial, lastName, prefix, gender, dob, username, tempPassword, schoolId, phone, staffNo, qualifications }: CreateTeacherRequest = await req.json();

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

    // Generate a placeholder user ID for the teacher profile
    const tempUserId = crypto.randomUUID();

    // Hash the temporary password (simple hash for demo)
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

    // Create temporary credentials with all teacher information including intended assignments
    const { error: credsError } = await supabase
      .from('teacher_temp_credentials')
      .insert({
        username: finalUsername,
        temp_password_hash: tempPasswordHash,
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