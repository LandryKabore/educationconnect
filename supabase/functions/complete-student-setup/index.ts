const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CompleteStudentSetupRequest {
  username: string;
  tempPassword: string;
  newPassword: string;
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
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Parse request body
    const body: CompleteStudentSetupRequest = await req.json();
    console.log('Request body:', { username: body.username, hasPassword: !!body.newPassword });

    const { username, tempPassword, newPassword } = body;

    if (!username || !tempPassword || !newPassword) {
      return new Response(JSON.stringify({ 
        error: 'Missing required fields: username, tempPassword, newPassword' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Hash the provided temporary password to compare
    const tempPasswordHash = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(tempPassword)
    );
    const tempPasswordHashHex = Array.from(new Uint8Array(tempPasswordHash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Find and verify the student temporary credentials
    const { data: studentCreds, error: credsError } = await supabase
      .from('student_temp_credentials')
      .select('*')
      .eq('username', username)
      .eq('temp_password_hash', tempPasswordHashHex)
      .eq('is_used', false)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (credsError) {
      console.error('Error fetching student credentials:', credsError);
      return new Response(JSON.stringify({ error: 'Database error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!studentCreds) {
      return new Response(JSON.stringify({ 
        error: 'Invalid credentials or expired temporary access' 
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Found valid student credentials for:', studentCreds.student_user_id);

    // Check if auth user already exists
    const { data: existingAuthUser, error: existingUserError } = await supabase.auth.admin.getUserById(studentCreds.student_user_id);
    
    let authUser;
    if (existingAuthUser?.user && !existingUserError) {
      // Update existing user's password
      console.log('Updating existing auth user password');
      const { data: updatedUser, error: updateError } = await supabase.auth.admin.updateUserById(
        studentCreds.student_user_id,
        { password: newPassword }
      );
      
      if (updateError) {
        console.error('Error updating user password:', updateError);
        return new Response(JSON.stringify({ 
          error: 'Failed to update password',
          details: updateError.message 
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      authUser = updatedUser.user;
    } else {
      // Create new auth user
      console.log('Creating new auth user');
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        id: studentCreds.student_user_id,
        email: `${username}@student.local`,
        password: newPassword,
        email_confirm: true,
        user_metadata: {
          role: 'student',
          username: username,
          first_name: studentCreds.first_name,
          last_name: studentCreds.last_name,
          school_id: studentCreds.school_id
        }
      });

      if (createError) {
        console.error('Error creating auth user:', createError);
        return new Response(JSON.stringify({ 
          error: 'Failed to create user account',
          details: createError.message 
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      authUser = newUser.user;
    }

    // Upsert profile
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        user_id: studentCreds.student_user_id,
        email: `${username}@student.local`,
        first_name: studentCreds.first_name,
        last_name: studentCreds.last_name,
        role: 'student'
      });

    if (profileError) {
      console.error('Error creating/updating profile:', profileError);
    }

    // Upsert student profile
    const { error: studentProfileError } = await supabase
      .from('student_profiles')
      .upsert({
        user_id: studentCreds.student_user_id,
        school_id: studentCreds.school_id,
        student_no: studentCreds.student_no,
      });

    if (studentProfileError) {
      console.error('Error creating/updating student profile:', studentProfileError);
    }

    // Auto-enroll student in their class based on grade_level
    if (studentCreds.grade_level) {
      console.log('Auto-enrolling student in class for grade level:', studentCreds.grade_level);
      
      // Find the class section that matches their grade level
      const { data: classSection, error: classFindError } = await supabase
        .from('class_sections')
        .select('id, academic_year_id')
        .eq('school_id', studentCreds.school_id)
        .or(`grade_level.eq.${studentCreds.grade_level},name.eq.${studentCreds.grade_level}`)
        .maybeSingle();

      if (classFindError) {
        console.error('Error finding class section:', classFindError);
      } else if (classSection) {
        console.log('Found class section:', classSection);
        
        // Check if already enrolled
        const { data: existingEnrollment } = await supabase
          .from('enrollments')
          .select('id')
          .eq('student_user_id', studentCreds.student_user_id)
          .eq('class_section_id', classSection.id)
          .maybeSingle();

        if (!existingEnrollment) {
          // Enroll the student
          const { error: enrollmentError } = await supabase
            .from('enrollments')
            .insert({
              student_user_id: studentCreds.student_user_id,
              class_section_id: classSection.id,
              academic_year_id: classSection.academic_year_id,
              status: 'active'
            });

          if (enrollmentError) {
            console.error('Error enrolling student:', enrollmentError);
          } else {
            console.log('Student successfully enrolled in class');
          }
        } else {
          console.log('Student already enrolled in class');
        }
      } else {
        console.log('No matching class section found for grade level:', studentCreds.grade_level);
      }
    }

    // Mark temporary credentials as used
    const { error: markUsedError } = await supabase
      .from('student_temp_credentials')
      .update({ 
        is_used: true, 
        used_at: new Date().toISOString() 
      })
      .eq('id', studentCreds.id);

    if (markUsedError) {
      console.error('Error marking credentials as used:', markUsedError);
    }

    console.log('Student setup completed successfully');

    return new Response(JSON.stringify({ 
      success: true,
      user_id: studentCreds.student_user_id,
      username: username,
      message: 'Student account setup completed successfully'
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