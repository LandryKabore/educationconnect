import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Create Supabase client with service role for admin operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Verify the caller is a super admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Check if user is super admin
    const { data: roles, error: rolesError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'super_admin')
      .eq('active', true)
      .single();

    if (rolesError || !roles) {
      throw new Error('Only super admins can create admin users');
    }

    // Get request body
    const { email, password, firstName, lastName, schoolId } = await req.json();

    console.log('Creating admin user:', { email, firstName, lastName, schoolId });

    // Validate inputs
    if (!email || !password || !firstName || !lastName || !schoolId) {
      throw new Error('Missing required fields');
    }

    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    // Create the auth user
    const { data: newUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        role: 'school_admin',
        school_id: schoolId,
      },
    });

    if (createUserError) {
      console.error('Error creating auth user:', createUserError);
      throw createUserError;
    }

    console.log('Auth user created:', newUser.user.id);

    // The handle_new_user trigger will create the profile and user_role
    // But we need to ensure the profile exists before proceeding
    let retries = 5;
    let profileExists = false;
    
    while (retries > 0 && !profileExists) {
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('user_id')
        .eq('user_id', newUser.user.id)
        .single();
      
      if (!profileError && profile) {
        profileExists = true;
        console.log('Profile confirmed');
      } else {
        console.log('Waiting for profile creation...', retries);
        await new Promise(resolve => setTimeout(resolve, 500));
        retries--;
      }
    }

    if (!profileExists) {
      console.error('Profile was not created by trigger, creating manually');
      
      // Manually create profile if trigger failed
      const { error: manualProfileError } = await supabaseAdmin
        .from('profiles')
        .insert({
          user_id: newUser.user.id,
          email,
          first_name: firstName,
          last_name: lastName,
          role: 'admin',
          status: 'active',
        });

      if (manualProfileError) {
        console.error('Error creating profile manually:', manualProfileError);
        throw manualProfileError;
      }
    }

    // Verify user_role was created
    const { data: userRole, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('id')
      .eq('user_id', newUser.user.id)
      .eq('role', 'school_admin')
      .eq('school_id', schoolId)
      .single();

    if (roleError || !userRole) {
      console.log('User role not created by trigger, creating manually');
      
      // Manually create user role if trigger failed
      const { error: manualRoleError } = await supabaseAdmin
        .from('user_roles')
        .insert({
          user_id: newUser.user.id,
          role: 'school_admin',
          school_id: schoolId,
          active: true,
          assigned_by: user.id,
        });

      if (manualRoleError) {
        console.error('Error creating user role manually:', manualRoleError);
        throw manualRoleError;
      }
    }

    console.log('Admin user created successfully');

    return new Response(
      JSON.stringify({
        success: true,
        user_id: newUser.user.id,
        message: 'Admin user created successfully',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error in create-admin-user function:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
