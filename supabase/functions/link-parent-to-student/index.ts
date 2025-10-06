const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LinkParentRequest {
  linkId: string;
  parentUserId: string;
  verificationCode: string;
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

    const { linkId, parentUserId, verificationCode } = body;

    if (!linkId || !parentUserId || !verificationCode) {
      return new Response(JSON.stringify({ 
        error: 'Missing required fields: linkId, parentUserId, verificationCode' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify the link exists and matches the verification code
    const { data: linkData, error: linkError } = await supabase
      .from('parent_student_links')
      .select('*')
      .eq('id', linkId)
      .eq('verification_code', verificationCode)
      .eq('status', 'pending')
      .maybeSingle();

    if (linkError || !linkData) {
      console.error('Link verification error:', linkError);
      return new Response(JSON.stringify({ 
        error: 'Invalid or expired verification code' 
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
      
      // Get user data from auth
      const { data: userData, error: userError } = await supabase.auth.admin.getUserById(parentUserId);
      
      if (userError || !userData.user) {
        console.error('Error fetching user data:', userError);
        return new Response(JSON.stringify({ 
          error: 'User not found' 
        }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Create profile
      const { error: createProfileError } = await supabase
        .from('profiles')
        .insert({
          user_id: parentUserId,
          email: userData.user.email,
          first_name: userData.user.user_metadata?.first_name,
          last_name: userData.user.user_metadata?.last_name,
          role: 'parent'
        });

      if (createProfileError) {
        console.error('Error creating profile:', createProfileError);
        return new Response(JSON.stringify({ 
          error: 'Failed to create parent profile' 
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
          school_id: userData.user.user_metadata?.school_id
        });

      if (createParentProfileError) {
        console.error('Error creating parent_profiles entry:', createParentProfileError);
      }

      console.log('Parent profile created successfully');
    }

    // Update the parent-student link
    const { error: updateError } = await supabase
      .from('parent_student_links')
      .update({
        parent_user_id: parentUserId,
        status: 'active',
        updated_at: new Date().toISOString()
      })
      .eq('id', linkId);

    if (updateError) {
      console.error('Error updating parent link:', updateError);
      return new Response(JSON.stringify({ 
        error: 'Failed to link parent to student',
        details: updateError.message 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Parent-student link updated successfully');

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
