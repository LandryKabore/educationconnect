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

  console.log('Function started');

  try {
    const body = await req.json();
    console.log('Request body received:', body);

    const { username, password, teacherId }: CompleteSetupRequest = body;
    console.log('Parsed data:', { username, teacherId, hasPassword: !!password });

    // Validate input
    if (!username || !password || !teacherId) {
      console.error('Missing required fields');
      return new Response(
        JSON.stringify({ 
          error: 'Missing required fields: username, password, and teacherId are required',
          received: { username: !!username, password: !!password, teacherId: !!teacherId }
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

    console.log('Supabase client created');

    // Get temp credentials
    console.log('Fetching temp credentials for:', teacherId);
    const { data: tempCreds, error: tempCredsError } = await supabase
      .from('teacher_temp_credentials')
      .select('*')
      .eq('teacher_user_id', teacherId)
      .eq('is_used', false)
      .maybeSingle();

    if (tempCredsError) {
      console.error('Temp credentials error:', tempCredsError);
      return new Response(
        JSON.stringify({ 
          error: `Failed to fetch temp credentials: ${tempCredsError.message}`,
          details: tempCredsError
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    if (!tempCreds) {
      console.error('No temp credentials found');
      return new Response(
        JSON.stringify({ 
          error: 'Teacher temp credentials not found or already used',
          teacherId: teacherId
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404,
        }
      );
    }

    console.log('Found temp credentials for:', tempCreds.first_name, tempCreds.last_name);

    // For now, just return success to test the basic flow
    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Basic validation passed',
        data: {
          username,
          teacherName: `${tempCreds.first_name} ${tempCreds.last_name}`,
          schoolId: tempCreds.school_id
        }
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
        details: error.toString(),
        stack: error.stack
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
};

serve(handler);