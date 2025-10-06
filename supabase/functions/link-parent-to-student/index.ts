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

    // Ensure parent profile exists (wait for trigger to complete if needed)
    let profileExists = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('user_id', parentUserId)
        .single();
      
      if (profile) {
        profileExists = true;
        break;
      }
      
      // Wait 200ms before retrying
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    if (!profileExists) {
      console.error('Parent profile not found after retries:', parentUserId);
      return new Response(
        JSON.stringify({ error: 'Parent profile not created yet. Please try again in a moment.' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
        JSON.stringify({ error: 'Failed to activate link' }),
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
