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

    console.log('Completing teacher setup for:', { teacherId, username });

    // First, get teacher info from temp credentials
    const { data: tempCreds, error: tempCredsError } = await supabase
      .from('teacher_temp_credentials')
      .select('*')
      .eq('teacher_user_id', teacherId)
      .eq('is_used', false)
      .maybeSingle();

    if (tempCredsError || !tempCreds) {
      throw new Error(`Teacher temp credentials not found: ${tempCredsError?.message}`);
    }

    console.log('Found temp credentials for teacher:', tempCreds.first_name, tempCreds.last_name);

    // Create system email using username for Supabase auth
    const systemEmail = `${username}@system.internal`;

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

    if (authError || !authData.user) {
      throw new Error(`Failed to create auth user: ${authError?.message}`);
    }

    console.log('Auth user created:', authData.user.id);

    // Create new profile record
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
      await supabase.auth.admin.deleteUser(authData.user.id);
      throw new Error(`Failed to create profile: ${profileCreateError.message}`);
    }

    // Create teacher profile record
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
      await supabase.auth.admin.deleteUser(authData.user.id);
      await supabase.from('profiles').delete().eq('user_id', authData.user.id);
      throw new Error(`Failed to create teacher profile: ${teacherCreateError.message}`);
    }

    // Mark temp credentials as used
    const { error: credsUpdateError } = await supabase
      .from('teacher_temp_credentials')
      .update({
        is_used: true,
        used_at: new Date().toISOString()
      })
      .eq('teacher_user_id', teacherId);

    if (credsUpdateError) {
      console.error('Temp credentials update error:', credsUpdateError);
    }

    // Update any other references (teaching assignments, etc.)
    const { error: assignmentUpdateError } = await supabase
      .from('teaching_assignments')
      .update({ teacher_user_id: authData.user.id })
      .eq('teacher_user_id', teacherId);

    if (assignmentUpdateError) {
      console.error('Teaching assignments update error:', assignmentUpdateError);
    }

    console.log('Teacher setup completed successfully');

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