/* Feature switches. Change and redeploy to toggle. */

/** Public self-registration (/signup). New accounts get the `guest` role
    (enforced in Supabase by supabase/migrations/0007_guest_default_role.sql)
    and land on /guest until an admin assigns a real role.
    If you turn this off, also turn off Supabase → Authentication →
    Sign In / Providers → "Allow new users to sign up". */
export const SIGNUP_ENABLED = true;

/**
 * Budget is off in the production application by default.  This switch is
 * deliberately local to this deployment: the V1 application keeps its
 * current behaviour even though both applications share Supabase.
 *
 * To restore it, set NEXT_PUBLIC_BUDGET_ENABLED=true in the production
 * deployment environment and redeploy.  Because it is a public Next.js
 * variable, its value is compiled into the browser bundle at build time.
 */
export const BUDGET_ENABLED = process.env.NEXT_PUBLIC_BUDGET_ENABLED === 'true';

/** Link to the school's privacy notice (informativa privacy, GDPR art. 13).
    When set, it appears in the footer of every page and sign-up requires the
    user to confirm they have read it. Leave '' until the DPO provides the URL. */
export const PRIVACY_POLICY_URL = '';
