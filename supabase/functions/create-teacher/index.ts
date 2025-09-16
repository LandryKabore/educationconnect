import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    const body = await req.json();
    const { 
      teacher_email, 
      teacher_first_name, 
      teacher_last_name, 
      teacher_school_id,
      teacher_phone,
      teacher_staff_no,
      teacher_qualifications,
      class_section_ids,
      subject_ids 
    } = body;

    console.log('Creating teacher with email:', teacher_email);

    // Create auth user with service role
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: teacher_email,
      email_confirm: true,
      user_metadata: {
        first_name: teacher_first_name,
        last_name: teacher_last_name,
        role: 'teacher',
        school_id: teacher_school_id
      }
    });

    if (authError) {
      console.error('Auth error:', authError);
      throw authError;
    }

    if (!authData.user) {
      throw new Error('Failed to create user');
    }

    console.log('Auth user created:', authData.user.id);

    // The trigger will create the profile and teacher_profile automatically
    // Now we just need to create teaching assignments

    // Get current academic year
    const { data: academicYear } = await supabaseAdmin
      .from('academic_years')
      .select('id')
      .eq('school_id', teacher_school_id)
      .eq('active', true)
      .single();

    // Create teaching assignments if academic year exists
    if (academicYear && class_section_ids?.length > 0 && subject_ids?.length > 0) {
      const assignments = [];
      for (const classSectionId of class_section_ids) {
        for (const subjectId of subject_ids) {
          assignments.push({
            teacher_user_id: authData.user.id,
            class_section_id: classSectionId,
            subject_id: subjectId,
            academic_year_id: academicYear.id
          });
        }
      }

      const { error: assignmentError } = await supabaseAdmin
        .from('teaching_assignments')
        .insert(assignments);

      if (assignmentError) {
        console.error('Assignment error:', assignmentError);
        // Don't fail the entire process
      }
    }

    // Update teacher profile with additional details
    const { error: updateError } = await supabaseAdmin
      .from('teacher_profiles')
      .update({
        staff_no: teacher_staff_no,
        qualifications: teacher_qualifications,
        phone: teacher_phone
      })
      .eq('user_id', authData.user.id);

    if (updateError) {
      console.error('Update error:', updateError);
      // Don't fail the process
    }

    // Generate magic link directly (since we have service role access)
    const tokenValue = btoa(crypto.getRandomValues(new Uint8Array(32)).join(''));
    const expiryTime = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const { error: magicLinkError } = await supabaseAdmin
      .from('magic_links')
      .insert({
        user_id: authData.user.id,
        token: tokenValue,
        expires_at: expiryTime.toISOString()
      });

    if (magicLinkError) {
      console.error('Magic link error:', magicLinkError);
      throw magicLinkError;
    }

    // Update teacher profile with last sent timestamp
    await supabaseAdmin
      .from('teacher_profiles')
      .update({ last_magic_link_sent: new Date().toISOString() })
      .eq('user_id', authData.user.id);

    return new Response(
      JSON.stringify({
        success: true,
        user_id: authData.user.id,
        magic_token: tokenValue
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    );
  }
})