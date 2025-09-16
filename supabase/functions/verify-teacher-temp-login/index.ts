import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VerifyTempLoginRequest {
  username: string;
  tempPassword: string;
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

    const { username, tempPassword }: VerifyTempLoginRequest = await req.json();

    console.log('Verifying temp login for username:', username);

    // Hash the provided password
    const encoder = new TextEncoder();
    const data = encoder.encode(tempPassword);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const tempPasswordHash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Find temp credentials
    const { data: tempCreds, error: credsError } = await supabase
      .from('teacher_temp_credentials')
      .select('*')
      .eq('username', username)
      .eq('temp_password_hash', tempPasswordHash)
      .eq('is_used', false)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (credsError || !tempCreds) {
      console.log('Invalid temp credentials:', { username, credsError });
      throw new Error('Invalid username or password');
    }

    // Get school info
    const { data: school, error: schoolError } = await supabase
      .from('schools')
      .select('name')
      .eq('id', tempCreds.school_id)
      .maybeSingle();

    if (schoolError || !school) {
      console.error('School fetch error:', schoolError);
      throw new Error('School not found');
    }

    console.log('Temp login verified successfully for:', username);

    return new Response(
      JSON.stringify({ 
        success: true,
        teacherInfo: {
          user_id: tempCreds.teacher_user_id,
          profile: {
            first_name: tempCreds.first_name,
            last_name: tempCreds.last_name,
            email: null // Will be set during setup
          },
          teacher: {
            school_id: tempCreds.school_id,
            school: { name: school.name },
            first_name: tempCreds.first_name,
            middle_initial: tempCreds.middle_initial,
            last_name: tempCreds.last_name,
            phone: tempCreds.phone,
            staff_no: tempCreds.staff_no,
            qualifications: tempCreds.qualifications
          }
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error('Error in verify-teacher-temp-login function:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Login failed',
        details: error.toString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
};

serve(handler);