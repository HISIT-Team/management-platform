# send-auth-email — auth emails from Microsoft 365 (no Resend)

Supabase Auth calls this function (Send Email Hook) every time it must send
an email: sign-up confirmation, password reset, email change, invite, magic
link, codes. The function sends it through **Microsoft Graph** from the
school mailbox (e.g. `itsupport@h-farmschool.com`), with the platform's
layout. Once the hook is on, Supabase no longer uses the SMTP settings
(Resend).

The Entra app can send **only** from that mailbox: the permission is
granted in Exchange with *RBAC for Applications*, limited to one mailbox.

---

## 1. Entra ID — register the app (Entra admin center)

1. **App registrations → New registration**
   - Name: `HIS Management Platform – Mail`
   - Supported account types: **Accounts in this organizational directory only** (single tenant)
   - Redirect URI: none → **Register**
2. From **Overview** copy **Application (client) ID** and **Directory (tenant) ID**.
3. **Certificates & secrets → New client secret** (e.g. 24 months) → copy the
   **Value** now (it is shown once). Put a reminder in your calendar a few
   weeks before it expires.
4. **API permissions: do NOT add `Mail.Send`.** Granted here it would allow
   sending as *any* mailbox of the tenant. The permission is given in
   Exchange (step 2), limited to the itsupport mailbox.
5. **Enterprise applications** → search the app → copy its **Object ID**
   (this is the *service principal* Object ID: NOT the one shown under App
   registrations).

## 2. Exchange Online — allow sending only from itsupport (PowerShell)

Requires the ExchangeOnlineManagement module and an Exchange admin account.

```powershell
Connect-ExchangeOnline

# Pointer to the Entra app (AppId = client ID, ObjectId = Enterprise applications Object ID)
New-ServicePrincipal -AppId <CLIENT_ID> -ObjectId <ENTERPRISE_APP_OBJECT_ID> -DisplayName "HIS Management Platform - Mail"

# Scope with only the itsupport mailbox
New-ManagementScope -Name "HIS Platform - itsupport only" -RecipientRestrictionFilter "PrimarySmtpAddress -eq 'itsupport@h-farmschool.com'"

# Send permission, limited to that scope
New-ManagementRoleAssignment -App <CLIENT_ID> -Role "Application Mail.Send" -CustomResourceScope "HIS Platform - itsupport only"

# Check: InScope must be True for itsupport…
Test-ServicePrincipalAuthorization -Identity <CLIENT_ID> -Resource itsupport@h-farmschool.com | Format-Table
# …and False for any other mailbox
Test-ServicePrincipalAuthorization -Identity <CLIENT_ID> -Resource <another mailbox> | Format-Table
```

Microsoft applies the change within **30 minutes – 2 hours**: if the first
test email fails with 403 / ErrorAccessDenied, wait and retry.

## 3. Supabase — function and secrets

1. **Edge Functions → Deploy a new function** → name `send-auth-email` →
   paste `index.ts` → in the function settings turn **OFF "Verify JWT"**
   (or CLI: `supabase functions deploy send-auth-email --no-verify-jwt`).
   Supabase Auth calls it without a user token; the request is protected by
   the hook signature instead.
2. **Authentication → Hooks → Send Email hook → Add hook**
   - Type: **HTTPS**
   - URL: `https://<project-ref>.supabase.co/functions/v1/send-auth-email`
   - **Generate secret** → copy it (`v1,whsec_…`) → Create.
3. **Edge Functions → Secrets** — add:

   | Name | Value |
   |---|---|
   | `SEND_EMAIL_HOOK_SECRET` | the `v1,whsec_…` secret from step 2 |
   | `MS_TENANT_ID` | Directory (tenant) ID |
   | `MS_CLIENT_ID` | Application (client) ID |
   | `MS_CLIENT_SECRET` | client secret Value |
   | `MAIL_FROM` | `itsupport@h-farmschool.com` |
   | `MAIL_FROM_NAME` | optional, default `H-IS Management Platform` |

4. Test: from the login page use **"Password dimenticata"** with your
   account. The email must arrive from itsupport. If not: Edge Functions →
   send-auth-email → **Logs**.
5. When it works, Resend is no longer used: you can remove the SMTP
   settings (Authentication → Emails → SMTP) and close the Resend account.

## Notes

- **Disable the hook = instant rollback**: Authentication → Hooks → turn
  off the Send Email hook and Supabase goes back to the SMTP settings.
- Replies to these emails reach the itsupport mailbox.
- The emails are not saved in itsupport's Sent Items.
- The email texts are in `index.ts` (function `buildEmails`).
- Email change: with "Secure email change" on, two emails are sent (to the
  current and to the new address), as Supabase requires.
