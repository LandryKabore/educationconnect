import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CompleteSetupRequest {
  username: string;
  password: string;
  teacherId: string;
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

    const { username, password, teacherId }: CompleteSetupRequest = await req.json();

    console.log('=== STARTING TEACHER SETUP ===');
    console.log('Request data:', { username, teacherId, passwordLength: password?.length });

    // Validate input
    if (!username || !password || !teacherId) {
      console.error('Missing required fields:', { username: !!username, password: !!password, teacherId: !!teacherId });
      throw new Error('Missing required fields: username, password, and teacherId are required');
    }

    // First, get teacher info from temp credentials
    console.log('1. Fetching temp credentials...');
    const { data: tempCreds, error: tempCredsError } = await supabase
      .from('teacher_temp_credentials')
      .select('*')
      .eq('teacher_user_id', teacherId)
      .eq('is_used', false)
      .maybeSingle();

    if (tempCredsError) {
      console.error('Temp credentials query error:', tempCredsError);
      throw new Error(`Failed to query temp credentials: ${tempCredsError.message}`);
    }
    
    if (!tempCreds) {
      console.error('No temp credentials found for teacherId:', teacherId);
      throw new Error('Teacher temp credentials not found or already used');
    }

    console.log('Found temp credentials:', { 
      username: tempCreds.username, 
      firstName: tempCreds.first_name, 
      lastName: tempCreds.last_name,
      schoolId: tempCreds.school_id 
    });

    // Create system email using username for Supabase auth
    const systemEmail = `${username}@system.internal`;
    console.log('2. Creating auth user with email:', systemEmail);

    // Create real auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: systemEmail,
      password: password,
      email_confirm: true, // Skip email confirmation
      user_metadata: {
        first_name: tempCreds.first_name,
        last_name: tempCreds.last_name,
        role: 'teacher',
        username: username,
        school_id: tempCreds.school_id
      }
    });

    if (authError) {
      console.error('Auth user creation error:', authError);
      throw new Error(`Failed to create auth user: ${authError.message}`);
    }
    
    if (!authData.user) {
      console.error('No user returned from auth creation');
      throw new Error('No user returned from auth creation');
    }

    console.log('Auth user created successfully:', authData.user.id);

    // Create new profile record
    console.log('3. Creating profile record...');
    const { error: profileCreateError } = await supabase
      .from('profiles')
      .insert({
        user_id: authData.user.id,
        email: systemEmail,
        first_name: tempCreds.first_name,
        last_name: tempCreds.last_name,
        role: 'teacher'
      });

    if (profileCreateError) {
      console.error('Profile create error:', profileCreateError);
      // Clean up auth user
      console.log('Cleaning up auth user due to profile error...');
      await supabase.auth.admin.deleteUser(authData.user.id);
      throw new Error(`Failed to create profile: ${profileCreateError.message}`);
    }

    console.log('Profile created successfully');

    // Create teacher profile record
    console.log('4. Creating teacher profile record...');
    const { error: teacherCreateError } = await supabase
      .from('teacher_profiles')
      .insert({
        user_id: authData.user.id,
        school_id: tempCreds.school_id,
        username: username,
        phone: tempCreds.phone,
        staff_no: tempCreds.staff_no,
        qualifications: tempCreds.qualifications,
        first_login_completed: true,
        hire_date: new Date().toISOString().split('T')[0] // Current date as hire date
      });

    if (teacherCreateError) {
      console.error('Teacher profile create error:', teacherCreateError);
      // Clean up auth user and profile
      console.log('Cleaning up due to teacher profile error...');
      await supabase.auth.admin.deleteUser(authData.user.id);
      await supabase.from('profiles').delete().eq('user_id', authData.user.id);
      throw new Error(`Failed to create teacher profile: ${teacherCreateError.message}`);
    }

    console.log('Teacher profile created successfully');

    // Mark temp credentials as used
    console.log('5. Marking temp credentials as used...');
    const { error: credsUpdateError } = await supabase
      .from('teacher_temp_credentials')
      .update({
        is_used: true,
        used_at: new Date().toISOString()
      })
      .eq('teacher_user_id', teacherId);

    if (credsUpdateError) {
      console.error('Temp credentials update error:', credsUpdateError);
      // Don't fail the whole process for this
    } else {
      console.log('Temp credentials marked as used');
    }

    // Update any other references (teaching assignments, etc.)
    console.log('6. Updating teaching assignments...');
    const { error: assignmentUpdateError } = await supabase
      .from('teaching_assignments')
      .update({ teacher_user_id: authData.user.id })
      .eq('teacher_user_id', teacherId);

    if (assignmentUpdateError) {
      console.error('Teaching assignments update error:', assignmentUpdateError);
      // Don't fail the whole process for this
    } else {
      console.log('Teaching assignments updated');
    }

    console.log('=== TEACHER SETUP COMPLETED SUCCESSFULLY ===');

    return new Response(
      JSON.stringify({ 
        success: true,
        userId: authData.user.id
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error('Error in complete-teacher-setup function:', error);
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