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

  console.log('=== STARTING TEACHER SETUP ===');

  try {
    const { username, password, teacherId }: CompleteSetupRequest = await req.json();
    console.log('Request data:', { username, teacherId, hasPassword: !!password });

    // Validate input
    if (!username || !password || !teacherId) {
      console.error('Missing required fields');
      return new Response(
        JSON.stringify({ 
          error: 'Missing required fields: username, password, and teacherId are required'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get temp credentials
    console.log('1. Fetching temp credentials...');
    const { data: tempCreds, error: tempCredsError } = await supabase
      .from('teacher_temp_credentials')
      .select('*')
      .eq('teacher_user_id', teacherId)
      .eq('is_used', false)
      .maybeSingle();

    if (tempCredsError || !tempCreds) {
      console.error('Temp credentials error:', tempCredsError);
      return new Response(
        JSON.stringify({ 
          error: 'Teacher temp credentials not found or already used'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404,
        }
      );
    }

    console.log('Found temp credentials for:', tempCreds.first_name, tempCreds.last_name);

    // Check if auth user already exists
    console.log('2. Checking if auth user already exists...');
    const systemEmail = `${username}@system.internal`;
    
    const { data: existingUser } = await supabase.auth.admin.getUserById(teacherId);
    
    let authUserId = teacherId;
    
    if (!existingUser.user) {
      console.log('3. Creating new auth user...');
      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: systemEmail,
        password: password,
        email_confirm: true,
        user_metadata: {
          first_name: tempCreds.first_name,
          last_name: tempCreds.last_name,
          role: 'teacher',
          username: username,
          school_id: tempCreds.school_id
        }
      });

      if (authError || !authData.user) {
        console.error('Auth user creation error:', authError);
        return new Response(
          JSON.stringify({ 
            error: `Failed to create auth user: ${authError?.message}`
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
          }
        );
      }

      authUserId = authData.user.id;
      console.log('Auth user created:', authUserId);
    } else {
      console.log('Auth user already exists, updating password...');
      // Update existing user's password
      const { error: updateError } = await supabase.auth.admin.updateUserById(teacherId, {
        password: password,
        email: systemEmail,
        user_metadata: {
          first_name: tempCreds.first_name,
          last_name: tempCreds.last_name,
          role: 'teacher',
          username: username,
          school_id: tempCreds.school_id
        }
      });

      if (updateError) {
        console.error('Auth user update error:', updateError);
        return new Response(
          JSON.stringify({ 
            error: `Failed to update auth user: ${updateError.message}`
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
          }
        );
      }
    }

    // Upsert profile record
    console.log('4. Upserting profile record...');
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        user_id: authUserId,
        email: systemEmail,
        first_name: tempCreds.first_name,
        last_name: tempCreds.last_name,
        role: 'teacher'
      }, {
        onConflict: 'user_id'
      });

    if (profileError) {
      console.error('Profile upsert error:', profileError);
      return new Response(
        JSON.stringify({ 
          error: `Failed to create/update profile: ${profileError.message}`
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      );
    }

    // Upsert teacher profile record
    console.log('5. Upserting teacher profile record...');
    const { error: teacherProfileError } = await supabase
      .from('teacher_profiles')
      .upsert({
        user_id: authUserId,
        school_id: tempCreds.school_id,
        username: username,
        phone: tempCreds.phone,
        staff_no: tempCreds.staff_no,
        qualifications: tempCreds.qualifications,
        prefix: tempCreds.prefix,
        gender: tempCreds.gender,
        dob: tempCreds.dob,
        first_login_completed: true,
        hire_date: new Date().toISOString().split('T')[0]
      }, {
        onConflict: 'user_id'
      });

    if (teacherProfileError) {
      console.error('Teacher profile upsert error:', teacherProfileError);
      return new Response(
        JSON.stringify({ 
          error: `Failed to create/update teacher profile: ${teacherProfileError.message}`
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      );
    }

    // Mark temp credentials as used
    console.log('6. Marking temp credentials as used...');
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

    // Create teaching assignments from stored intentions in temp credentials
    console.log('7. Creating teaching assignments from stored intentions...');
    
    const { intended_class_section_ids, intended_subject_ids } = tempCreds;
    
    if (intended_class_section_ids && intended_subject_ids && 
        intended_class_section_ids.length > 0 && intended_subject_ids.length > 0) {
      
      // Get the active academic year for this school
      const { data: academicYear } = await supabase
        .from('academic_years')
        .select('id')
        .eq('school_id', tempCreds.school_id)
        .eq('active', true)
        .maybeSingle();

      if (academicYear) {
        console.log('Creating assignments for academic year:', academicYear.id);
        
        // Create teaching assignments for each class-subject combination
        for (const classSectionId of intended_class_section_ids) {
          for (const subjectId of intended_subject_ids) {
            const { error: assignmentError } = await supabase
              .from('teaching_assignments')
              .insert({
                teacher_user_id: authUserId,
                class_section_id: classSectionId,
                subject_id: subjectId,
                academic_year_id: academicYear.id
              });

            if (assignmentError) {
              console.error('Teaching assignment creation error:', assignmentError);
            } else {
              console.log('Created assignment:', { classSectionId, subjectId });
            }
          }
        }
      } else {
        console.log('No active academic year found');
      }
    } else {
      console.log('No intended assignments stored in temp credentials');
    }

    console.log('=== TEACHER SETUP COMPLETED SUCCESSFULLY ===');

    return new Response(
      JSON.stringify({ 
        success: true,
        userId: authUserId,
        message: 'Teacher setup completed successfully'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error('Function error:', error);
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