import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CompleteSetupRequest {
  email: string;
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

    const { email, password, teacherId }: CompleteSetupRequest = await req.json();

    console.log('Completing teacher setup for:', { teacherId, email });

    // Create real auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true, // Skip email confirmation
      user_metadata: {
        first_name: '',
        last_name: '',
        role: 'teacher'
      }
    });

    if (authError || !authData.user) {
      throw new Error(`Failed to create auth user: ${authError?.message}`);
    }

    console.log('Auth user created:', authData.user.id);

    // Update the existing profile with the real user ID and email
    const { error: profileUpdateError } = await supabase
      .from('profiles')
      .update({
        user_id: authData.user.id,
        email: email
      })
      .eq('user_id', teacherId);

    if (profileUpdateError) {
      console.error('Profile update error:', profileUpdateError);
      // Clean up auth user
      await supabase.auth.admin.deleteUser(authData.user.id);
      throw new Error(`Failed to update profile: ${profileUpdateError.message}`);
    }

    // Update teacher profile
    const { error: teacherUpdateError } = await supabase
      .from('teacher_profiles')
      .update({
        user_id: authData.user.id,
        first_login_completed: true
      })
      .eq('user_id', teacherId);

    if (teacherUpdateError) {
      console.error('Teacher profile update error:', teacherUpdateError);
      throw new Error(`Failed to update teacher profile: ${teacherUpdateError.message}`);
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