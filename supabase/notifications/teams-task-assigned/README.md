# Notifica Teams quando una task viene assegnata

Il trigger `it_tasks_notify_assignees` (migrazione `0013`) chiama un flow
Power Automate quando una task viene creata o le si aggiungono assegnatari.
Notifica solo le persone **appena aggiunte**, non chi fa la modifica, e
salta chi non ha l'email in `it_task_members`.

## 1. Supabase
1. Table Editor → `it_task_members`: compila `email` per ogni persona del team
   (l'indirizzo con cui usa Teams).
2. SQL Editor: esegui `supabase/migrations/0013_task_assignment_notifications.sql`.
3. Dopo aver creato il flow (punto 2), salva gli indirizzi nel Vault:
   ```sql
   select vault.create_secret('<HTTP URL del flow>', 'task_notify_webhook_url');
   select vault.create_secret('https://<dominio della piattaforma>', 'platform_url');
   ```
   Per cambiarli in seguito:
   ```sql
   select vault.update_secret((select id from vault.secrets where name = 'task_notify_webhook_url'), '<nuovo URL>');
   ```

## 2. Power Automate
1. Nuovo flow automatizzato → trigger **When an HTTP request is received**,
   "Who can trigger the flow": **Anyone**.
   **Use sample payload to generate schema** → incolla `sample-payload.json`.
2. **Apply to each** → input: `recipients`.
3. Dentro il ciclo: **Post card in a chat or channel** (Microsoft Teams)
   - Post as: **Flow bot**
   - Post in: **Chat with Flow bot**
   - Recipient: `email` (del ciclo) → espressione `items('Apply_to_each')?['email']`
   - Adaptive Card: incolla `adaptive-card.json`
4. Salva e copia l'**HTTP URL** del trigger → Vault (punto 1.3).

Se il ciclo si chiama "For each", nella card sostituisci
`items('Apply_to_each')` con `items('For_each')`.

Nella card usa i campi `*_card` (già "puliti" per il JSON): con quelli un
titolo con virgolette o una descrizione su più righe non rompono la card.

## Verifica
Assegna una task a un collega (non a te stesso). Se non arriva nulla:
- Power Automate → cronologia del flow: è partito?
- SQL Editor: `select * from net._http_response order by created desc limit 5;`
  mostra le ultime chiamate dal database e la risposta del flow.
