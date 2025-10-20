const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateStudentRequest {
  firstName: string;
  middleName?: string | null;
  lastName: string;
  schoolId: string;
  gradeLevel?: string | null;
  studentNo?: string | null;
  username: string;
  tempPassword: string;
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
    console.log('Edge function called - create-student-with-temp-creds');
    
    // Initialize Supabase client with service role key for admin operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    console.log('Supabase URL:', supabaseUrl);
    
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.57.4');
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Parse request body
    const body: CreateStudentRequest = await req.json();
    console.log('Request body:', body);

    const { 
      firstName, 
      middleName, 
      lastName, 
      schoolId,
      gradeLevel,
      studentNo, 
      username, 
      tempPassword 
    } = body;

    if (!firstName || !lastName || !schoolId || !username || !tempPassword) {
      return new Response(JSON.stringify({ 
        error: 'Missing required fields: firstName, lastName, schoolId, username, tempPassword' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check for existing username
    const { data: existingStudent, error: checkError } = await supabase
      .from('student_temp_credentials')
      .select('username')
      .eq('username', username)
      .maybeSingle();

    if (checkError) {
      console.error('Error checking existing username:', checkError);
      return new Response(JSON.stringify({ error: 'Database error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (existingStudent) {
      console.log('Username already exists:', username);
      return new Response(JSON.stringify({ error: 'Username already exists' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Username is available');

    // Get admin authorization header
    const authHeader = req.headers.get('Authorization');
    console.log('Auth header present:', !!authHeader);
    
    if (!authHeader) {
      console.log('No authorization header found');
      return new Response(JSON.stringify({ error: 'Authorization header required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify admin user
    console.log('Verifying admin user...');
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(JSON.stringify({ error: 'Unauthorized', details: authError?.message }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('User authenticated:', user.id);

    // Generate student user ID and hash password
    const studentUserId = crypto.randomUUID();
    const tempPasswordHash = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(tempPassword)
    );
    const tempPasswordHashHex = Array.from(new Uint8Array(tempPasswordHash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    console.log('Generated student user ID:', studentUserId);

    // Insert student temporary credentials
    const { data: studentData, error: insertError } = await supabase
      .from('student_temp_credentials')
      .insert({
        student_user_id: studentUserId,
        username: username,
        temp_password_hash: tempPasswordHashHex,
        temp_password_plain: tempPassword, // Store plain text for admin access
        first_name: firstName,
        middle_name: middleName || null,
        last_name: lastName,
        school_id: schoolId,
        grade_level: gradeLevel || null,
        student_no: studentNo || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting student credentials:', insertError);
      return new Response(JSON.stringify({ 
        error: 'Failed to create student credentials',
        details: insertError.message 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Student created successfully:', studentData);

    // Generate parent verification code (6-digit numeric code)
    const parentVerificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    console.log('Creating parent-student link with verification code:', parentVerificationCode);
    
    // Create parent-student link entry with verification code
    // parent_user_id will be filled when parent uses the verification code
    const { error: linkError } = await supabase
      .from('parent_student_links')
      .insert({
        student_user_id: studentUserId,
        parent_user_id: null, // Will be updated when parent verifies
        verification_code: parentVerificationCode,
        verification_method: 'code',
        status: 'pending'
      });

    if (linkError) {
      console.error('Error creating parent link:', linkError);
      // Don't fail the student creation, just log the error
    } else {
      console.log('Parent verification link created successfully');
    }

    return new Response(JSON.stringify({ 
      success: true,
      student_id: studentUserId,
      username: username,
      parent_verification_code: parentVerificationCode,
      message: 'Student created successfully with temporary credentials and parent verification code'
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