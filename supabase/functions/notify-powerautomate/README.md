# notify-powerautomate

Edge Function chiamata dal form Check-in / Check-out (studenti e dipendenti)
dopo l'invio. Inoltra i dati a un flow Power Automate. L'URL del flow resta
nel secret `POWER_AUTOMATE_WEBHOOK_URL` e non arriva mai al browser; la
funzione accetta solo utenti loggati con ruolo `it` o `admin`.

## Setup

1. **Power Automate** → nuovo flow automatizzato con trigger
   *When an HTTP request is received*. "Who can trigger the flow": **Anyone**
   (la protezione è l'URL segreto + il controllo ruolo nella funzione).
   "Use sample payload to generate schema" → incolla `sample-payload.json`.
   Salva e copia l'**HTTP URL** generato.
2. **Supabase → Edge Functions → Secrets** → aggiungi
   `POWER_AUTOMATE_WEBHOOK_URL` = l'URL copiato.
   (Facoltativo: `ALLOWED_ORIGINS` = dominio della piattaforma, es.
   `https://xxx.pages.dev`, per limitare il CORS.)
3. **Supabase → Edge Functions → Deploy a new function → Via Editor**,
   nome `notify-powerautomate`, incolla `index.ts`, lascia **Verify JWT**
   attivo, Deploy.

## Campi utili nel flow

- `operation_label`: `Consegna` (Check-out) o `Restituzione` (Check-in)
- `form_type`: `student_checkout`, `student_checkin`, `employee_checkout`, `employee_checkin`
- `email`, `first_name`, `last_name`, `school_or_company`, `parent_email_1/2`
- `macbook_id`, `ipad_id`, `accessories_id`, `devices`
- Firma come immagine: `base64ToBinary(triggerBody()?['signature_base64'])`
  (JPEG) — es. allegato `firma.jpg` in un'email.
- `photos[]` (solo studenti): foto dispositivo/danni, stesso formato.
- `submitted_by.email`: l'utente IT che ha compilato il form (verificato lato server).
