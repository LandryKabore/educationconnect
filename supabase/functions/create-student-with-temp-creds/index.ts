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
  classSectionId?: string | null;
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
      tempPassword,
      classSectionId 
    } = body;

    if (!firstName || !lastName || !schoolId || !username || !tempPassword) {
      return new Response(JSON.stringify({ 
        error: 'Missing required fields: firstName, lastName, schoolId, username, tempPassword' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check for existing username and make it unique if needed
    let finalUsername = username;
    let counter = 1;
    
    while (true) {
      const { data: existingStudent } = await supabase
        .from('student_temp_credentials')
        .select('username')
        .eq('username', finalUsername)
        .maybeSingle();

      if (!existingStudent) {
        break; // Username is available
      }
      
      // Try with a number suffix
      finalUsername = `${username}${counter}`;
      counter++;
      
      // Prevent infinite loop
      if (counter > 100) {
        return new Response(JSON.stringify({ error: 'Unable to generate unique username' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    console.log('Final username:', finalUsername);

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

    // Create actual auth user immediately
    console.log('Creating auth user for student...');
    const { data: authData, error: authCreateError } = await supabase.auth.admin.createUser({
      email: `${finalUsername}@student.local`,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        role: 'student',
        school_id: schoolId
      }
    });

    if (authCreateError || !authData.user) {
      console.error('Error creating auth user:', authCreateError);
      return new Response(JSON.stringify({ 
        error: 'Failed to create student account',
        details: authCreateError?.message 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const studentUserId = authData.user.id;
    console.log('Auth user created successfully:', studentUserId);

    // Hash password for temp credentials table
    const tempPasswordHash = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(tempPassword)
    );
    const tempPasswordHashHex = Array.from(new Uint8Array(tempPasswordHash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Insert student temporary credentials
    const { data: studentData, error: insertError } = await supabase
      .from('student_temp_credentials')
      .insert({
        student_user_id: studentUserId,
        username: finalUsername,
        temp_password_hash: tempPasswordHashHex,
        temp_password_plain: tempPassword, // Store plain text for admin access
        first_name: firstName,
        middle_name: middleName || null,
        last_name: lastName,
        school_id: schoolId,
        grade_level: gradeLevel || null,
        student_no: studentNo || null,
        class_section_id: classSectionId || null,
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

    console.log('Student temp credentials created successfully:', studentData);

    // Note: profile, student_profile, and user_role are created automatically via the handle_new_user trigger
    console.log('Waiting for automatic profile creation via trigger...');

    // Auto-enroll student in their class if class_section_id is provided
    if (classSectionId) {
      console.log('Auto-enrolling student in class section:', classSectionId);
      
      const { data: section, error: sectionError } = await supabase
        .from('class_sections')
        .select('id, academic_year_id')
        .eq('id', classSectionId)
        .maybeSingle();
      
      if (sectionError) {
        console.error('Error finding class section:', sectionError);
      } else if (section) {
        console.log('Found class section:', section);
        
        // Enroll the student
        const { error: enrollmentError } = await supabase
          .from('enrollments')
          .insert({
            student_user_id: studentUserId,
            class_section_id: section.id,
            academic_year_id: section.academic_year_id,
            status: 'active'
          });

        if (enrollmentError) {
          console.error('Error enrolling student:', enrollmentError);
        } else {
          console.log('Student successfully enrolled in class');
        }
      } else {
        console.log('Class section not found');
      }
    }

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
      username: finalUsername,
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