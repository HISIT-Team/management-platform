/* Feature switches. Change and redeploy to toggle. */

/** Public self-registration (/signup). New accounts get the `guest` role
    (enforced in Supabase by supabase/migrations/0007_guest_default_role.sql)
    and land on /guest until an admin assigns a real role.
    If you turn this off, also turn off Supabase → Authentication →
    Sign In / Providers → "Allow new users to sign up". */
export const SIGNUP_ENABLED = true;
