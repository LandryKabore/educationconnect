import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LinkParentRequest {
  linkId: string;
  parentUserId: string;
  verificationCode: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const { linkId, parentUserId, verificationCode }: LinkParentRequest = await req.json();

    if (!linkId || !parentUserId || !verificationCode) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the link exists and matches the verification code
    const { data: link, error: fetchError } = await supabase
      .from('parent_student_links')
      .select('*')
      .eq('id', linkId)
      .eq('verification_code', verificationCode)
      .eq('status', 'pending')
      .is('parent_user_id', null)
      .single();

    if (fetchError || !link) {
      return new Response(
        JSON.stringify({ error: 'Invalid verification code or link not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Ensure parent profile exists - create if needed
    let { data: profile } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('user_id', parentUserId)
      .single();
    
    if (!profile) {
      // Profile doesn't exist - get user data and create it
      const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(parentUserId);
      
      if (userError || !user) {
        console.error('Failed to get user data:', userError);
        return new Response(
          JSON.stringify({ error: 'User not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Create profile
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          user_id: parentUserId,
          email: user.email,
          first_name: user.user_metadata?.first_name,
          last_name: user.user_metadata?.last_name,
          role: 'parent'
        });

      if (profileError) {
        console.error('Failed to create profile:', profileError);
        return new Response(
          JSON.stringify({ error: 'Failed to create parent profile' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Create parent_profiles record
      const { error: parentProfileError } = await supabase
        .from('parent_profiles')
        .insert({
          user_id: parentUserId,
          school_id: user.user_metadata?.school_id
        });

      if (parentProfileError) {
        console.error('Failed to create parent_profiles:', parentProfileError);
        // Don't fail the whole operation for this
      }
    }

    // Update the link to active status with the parent user ID
    const { error: updateError } = await supabase
      .from('parent_student_links')
      .update({
        parent_user_id: parentUserId,
        status: 'active'
      })
      .eq('id', linkId);

    if (updateError) {
      console.error('Error updating parent link:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to activate link', details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Parent linked successfully' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in link-parent-to-student function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
