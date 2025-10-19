import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@4.0.0";
import React from "npm:react@18.3.1";
import { renderAsync } from "npm:@react-email/components@0.0.22";
import { AdminInvitationEmail } from "./_templates/admin-invitation.tsx";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

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
    const { email, firstName, lastName, schoolId } = await req.json();

    console.log('Creating admin user:', { email, firstName, lastName, schoolId });

    // Validate inputs
    if (!email || !firstName || !lastName || !schoolId) {
      throw new Error('Missing required fields');
    }

    // Get school name for email
    const { data: school, error: schoolError } = await supabaseAdmin
      .from('schools')
      .select('name')
      .eq('id', schoolId)
      .single();

    if (schoolError || !school) {
      throw new Error('School not found');
    }

    // Generate a secure random password (user will reset it)
    const tempPassword = crypto.randomUUID();

    // Create the auth user
    const { data: newUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
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

    // Wait for profile creation
    let retries = 5;
    let profileExists = false;
    
    while (retries > 0 && !profileExists) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('user_id')
        .eq('user_id', newUser.user.id)
        .single();
      
      if (profile) {
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
      
      await supabaseAdmin
        .from('profiles')
        .insert({
          user_id: newUser.user.id,
          email,
          first_name: firstName,
          last_name: lastName,
          role: 'admin',
          status: 'active',
        });
    }

    // Verify user_role was created
    const { data: userRole } = await supabaseAdmin
      .from('user_roles')
      .select('id')
      .eq('user_id', newUser.user.id)
      .eq('role', 'school_admin')
      .eq('school_id', schoolId)
      .single();

    if (!userRole) {
      console.log('User role not created by trigger, creating manually');
      
      await supabaseAdmin
        .from('user_roles')
        .insert({
          user_id: newUser.user.id,
          role: 'school_admin',
          school_id: schoolId,
          active: true,
          assigned_by: user.id,
        });
    }

    // Generate password reset link
    const { data: resetData, error: resetError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: email,
    });

    if (resetError) {
      console.error('Error generating reset link:', resetError);
      throw resetError;
    }

    console.log('Password reset link generated');

    // Render email template
    const emailHtml = await renderAsync(
      React.createElement(AdminInvitationEmail, {
        adminName: `${firstName} ${lastName}`,
        schoolName: school.name,
        setupLink: resetData.properties.action_link,
      })
    );

    // Send invitation email
    let emailSent = false;
    const { error: emailError } = await resend.emails.send({
      from: 'School Management <onboarding@resend.dev>',
      to: [email],
      subject: `Welcome as School Administrator for ${school.name}`,
      html: emailHtml,
    });

    if (emailError) {
      console.error('Error sending email:', emailError);
      console.log('Admin user created but email could not be sent. This is normal in testing mode.');
    } else {
      console.log('Invitation email sent successfully');
      emailSent = true;
    }

    return new Response(
      JSON.stringify({
        success: true,
        user_id: newUser.user.id,
        email_sent: emailSent,
        message: emailSent 
          ? 'Admin user created and invitation sent' 
          : 'Admin user created (email not sent - verify domain at resend.com/domains)',
        setup_link: resetData.properties.action_link,
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
