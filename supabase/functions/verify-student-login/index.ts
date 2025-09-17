const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VerifyStudentLoginRequest {
  username: string;
  password: string;
}

async function handler(req: Request): Promise<Response> {
  console.log(`${req.method} request received`);

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.57.4');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    const body: VerifyStudentLoginRequest = await req.json();
    console.log('Request body:', { username: body.username, hasPassword: !!body.password });

    const { username, password } = body;

    if (!username || !password) {
      return new Response(JSON.stringify({ 
        error: 'Missing required fields: username, password' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // First check if this is a temporary login
    const tempPasswordHash = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(password)
    );
    const tempPasswordHashHex = Array.from(new Uint8Array(tempPasswordHash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const { data: tempCreds, error: tempError } = await supabase
      .from('student_temp_credentials')
      .select('*')
      .eq('username', username)
      .eq('temp_password_hash', tempPasswordHashHex)
      .eq('is_used', false)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (tempError) {
      console.error('Error checking temp credentials:', tempError);
    }

    if (tempCreds) {
      // This is a temporary login - redirect to complete setup
      return new Response(JSON.stringify({ 
        temporary_login: true,
        student_id: tempCreds.student_user_id,
        first_name: tempCreds.first_name,
        last_name: tempCreds.last_name,
        username: username
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check for completed student account by looking up username in student_temp_credentials
    // then trying to sign in with the auth system
    const { data: studentRecord, error: studentError } = await supabase
      .from('student_temp_credentials')
      .select('student_user_id, first_name, last_name, is_used')
      .eq('username', username)
      .eq('is_used', true)
      .maybeSingle();

    if (studentError) {
      console.error('Error checking student record:', studentError);
      return new Response(JSON.stringify({ error: 'Database error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!studentRecord) {
      return new Response(JSON.stringify({ 
        error: 'Invalid username or password' 
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Try to sign in with the auth system using email format
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: `${username}@student.local`,
      password: password
    });

    if (signInError) {
      console.error('Auth sign in error:', signInError);
      return new Response(JSON.stringify({ 
        error: 'Invalid username or password' 
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Student authenticated successfully');

    return new Response(JSON.stringify({ 
      success: true,
      user: signInData.user,
      session: signInData.session,
      first_name: studentRecord.first_name,
      last_name: studentRecord.last_name,
      username: username
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

Deno.serve(handler);