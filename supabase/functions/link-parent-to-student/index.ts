const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LinkParentRequest {
  linkId: string;
  parentUserId: string;
  verificationCode: string;
  parentEmail: string;
  parentFirstName?: string;
  parentLastName?: string;
  schoolId: string;
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
    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.57.4');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    const body: LinkParentRequest = await req.json();
    console.log('Request body:', { linkId: body.linkId, parentUserId: body.parentUserId });

    const { linkId, parentUserId, verificationCode, parentEmail, parentFirstName, parentLastName, schoolId } = body;

    if (!linkId || !parentUserId || !verificationCode || !parentEmail || !schoolId) {
      return new Response(JSON.stringify({ 
        error: 'Missing required fields: linkId, parentUserId, verificationCode, parentEmail, schoolId' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify the link exists and matches the verification code
    // We look for a pending link that serves as the "template" for this verification code
    const { data: pendingLink, error: pendingError } = await supabase
      .from('parent_student_links')
      .select('*')
      .eq('verification_code', verificationCode)
      .eq('status', 'pending')
      .is('parent_user_id', null)
      .maybeSingle();

    if (pendingError || !pendingLink) {
      console.error('Link verification error:', pendingError);
      return new Response(JSON.stringify({ 
        error: 'Invalid or expired verification code' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if this parent is already linked to this student
    const { data: existingLink } = await supabase
      .from('parent_student_links')
      .select('id')
      .eq('parent_user_id', parentUserId)
      .eq('student_user_id', pendingLink.student_user_id)
      .eq('status', 'active')
      .maybeSingle();

    if (existingLink) {
      return new Response(JSON.stringify({ 
        error: 'You are already linked to this student' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if parent profile exists, if not create it
    const { data: parentProfile, error: profileError } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('user_id', parentUserId)
      .maybeSingle();

    if (profileError) {
      console.error('Error checking parent profile:', profileError);
    }

    if (!parentProfile) {
      console.log('Parent profile not found, creating it...');
      
      // Validate firstName and lastName are provided for profile creation
      if (!parentFirstName || !parentLastName) {
        return new Response(JSON.stringify({ 
          error: 'First name and last name are required for new parent accounts' 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Create profile using provided data
      const { error: createProfileError } = await supabase
        .from('profiles')
        .insert({
          user_id: parentUserId,
          email: parentEmail,
          first_name: parentFirstName,
          last_name: parentLastName,
          role: 'parent'
        });

      if (createProfileError) {
        console.error('Error creating profile:', createProfileError);
        return new Response(JSON.stringify({ 
          error: 'Failed to create parent profile',
          details: createProfileError.message
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Create parent_profiles entry
      const { error: createParentProfileError } = await supabase
        .from('parent_profiles')
        .insert({
          user_id: parentUserId,
          school_id: schoolId
        });

      if (createParentProfileError) {
        console.error('Error creating parent_profiles entry:', createParentProfileError);
        return new Response(JSON.stringify({ 
          error: 'Failed to create parent_profiles entry',
          details: createParentProfileError.message
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log('Parent profile created successfully');
    }

    // Create a new active link for this parent (keep the pending link for future use)
    const { error: insertError } = await supabase
      .from('parent_student_links')
      .insert({
        parent_user_id: parentUserId,
        student_user_id: pendingLink.student_user_id,
        verification_method: 'code',
        verification_code: verificationCode,
        status: 'active'
      });

    if (insertError) {
      console.error('Error creating parent link:', insertError);
      return new Response(JSON.stringify({ 
        error: 'Failed to link parent to student',
        details: insertError.message 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Parent-student link created successfully');

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Parent successfully linked to student'
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
