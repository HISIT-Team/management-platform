# Accessori smarriti → Power Automate

Il modulo **IT → Accessori smarriti** (`/lost-accessories/new`) invia ogni
segnalazione alla Edge Function `submit-form` (form_type `lost_accessories`),
che la inoltra al flow il cui URL è nel secret **`WEBHOOK_LOST_ACCESSORIES`**.

Il flow riceve **anche nome, cognome ed email dei genitori**; lo storico in
Supabase (`lost_accessories_log`, migrazione 0023) invece **non** li salva.

## Setup
1. Power Automate → nuovo flow automatizzato → trigger
   **When an HTTP request is received**, "Who can trigger the flow": **Anyone**
   (la protezione è l'URL segreto + il controllo permessi nella funzione).
2. **Use sample payload to generate schema** → incolla `sample-payload.json`.
3. Aggiungi le azioni che servono (riga Excel, email ai genitori, ecc.).
   Campi utili:
   - `type` (`student` / `employee`), `type_label` (Studente / Dipendente)
   - `first_name`, `last_name`, `email`, `school_or_company`
   - `parent_email_1`, `parent_email_2` (vuoti per i dipendenti)
   - `accessories` (codici), `accessories_labels` (testi), `accessories_text`
     (testo unico, es. "Alimentatore Mac, Cavo MagSafe per Mac"), `accessories_count`
   - `notes`
   - `_submitted_by_email`: chi ha compilato il modulo (verificato lato server)
4. Salva, copia l'**HTTP URL** del trigger.
5. Supabase → Edge Functions → Secrets → aggiungi
   `WEBHOOK_LOST_ACCESSORIES` = l'URL copiato.
6. Rifai il deploy di `submit-form` (contiene il nuovo tipo di modulo).

Codici accessori: `mac_charger` (Alimentatore Mac), `ipad_charger`
(Alimentatore iPad), `mac_magsafe_cable` (Cavo MagSafe per Mac),
`ipad_usbc_cable` (Cavo Type-C per iPad).
