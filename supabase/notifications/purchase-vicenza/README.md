# Purchases — H-IS Vicenza → Power Automate

Every purchase request sent from **Purchases → New purchase request** is
saved in the table `purchase_requests` (migration 0018) and forwarded by
the Edge Function `submit-form` (form_type `purchase_vicenza`) to the
webhook stored in the Supabase secret **`WEBHOOK_PURCHASE_VICENZA`**.

## Set-up

1. Power Automate → new *Instant cloud flow* → trigger
   **When an HTTP request is received** (who can trigger: *Anyone*).
2. *Use sample payload to generate schema* → paste `sample-payload.json`
   (or paste `request-schema.json` as the schema).
3. Add the steps you need, e.g.:
   - **Apply to each** over `items` → *Add a row into a table* (Excel)
     with name, link, quantity, unit_price, total, plus email and
     request_id from the trigger;
   - **Send an email (V2)** to the Office with the summary and `total`.
4. Save, copy the HTTP POST URL.
5. Supabase → Edge Functions → Secrets → add `WEBHOOK_PURCHASE_VICENZA`
   with that URL, then redeploy `submit-form`.

`notes` may be empty. `link` may be empty for items without a link.
If the webhook fails the request stays in the platform with status
"Not sent".
