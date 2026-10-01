/* Feature switches. Change and redeploy to toggle. */

/** Public self-registration (/signup). New accounts used to get the
    "parent" role automatically. Turned off: accounts are created by an
    admin. IMPORTANT: also turn off Supabase → Authentication → Sign In /
    Providers → "Allow new users to sign up", otherwise the Supabase API
    still accepts sign-ups that bypass this page. */
export const SIGNUP_ENABLED = false;
