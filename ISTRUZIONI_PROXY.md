# Proxy personale per i calendari Google (fix definitivo "CORS bloccato")

## Perché serve

I feed Octorate rispondono con gli header CORS e il browser li scarica
direttamente. I feed di `calendar.google.com` (Anfiteatro, Scaro,
Vico Garibaldi, LaValletta) invece **no**: devono passare da un proxy.

I proxy pubblici gratuiti sono inaffidabili: corsproxy.io senza API key
funziona solo da domini di sviluppo (non da Firebase Hosting), altri sono
morti, allorigins è spesso lento, codetabs limita a ~5 richieste/secondo.
La v1.2.1 li interroga in parallelo (molto meglio di prima), ma la
soluzione definitiva è un proxy tuo: gratuito, 100.000 richieste/giorno.

## Setup Cloudflare Worker (≈5 minuti, una volta sola)

1. Vai su https://dash.cloudflare.com e crea un account gratuito
   (non serve avere un dominio).
2. Menu a sinistra → **Workers & Pages** → **Create** → **Create Worker**.
3. Dai un nome, es. `ical-proxy` → **Deploy**.
4. Clicca **Edit code**, cancella tutto il codice di esempio e incolla
   il contenuto di `cloudflare-worker-proxy.js` → **Deploy**.
5. Copia l'URL del worker, es. `https://ical-proxy.tuonome.workers.dev`.
6. Apri `config.js` del gestionale e imposta:

   ```js
   const PERSONAL_PROXY = 'https://ical-proxy.tuonome.workers.dev/?url=';
   ```

   (attenzione: deve finire con `?url=`)
7. Rideploya il sito (`firebase deploy --only hosting`).

## Verifica

Apri nel browser:

```
https://ical-proxy.tuonome.workers.dev/?url=https%3A%2F%2Fcalendar.google.com%2Fcalendar%2Fical%2F...%2Fbasic.ics
```

Se vedi il testo che inizia con `BEGIN:VCALENDAR`, funziona.
Da quel momento il gestionale userà sempre il tuo proxy come prima
scelta; i proxy pubblici restano solo come riserva.

## Aggiornamento v1.5.0 (obbligatorio: rideploya il worker)

Il worker è stato rivisto:

- risposta con `Cache-Control: public, max-age=120` invece di `no-store`
  (prima il browser non riusava mai nulla e ogni refresh ripartiva da zero);
- errori upstream restituiti con status 502 e messaggio leggibile, così
  nella sidebar si distingue "feed vuoto" da "rate-limit di Google";
- `ALLOWED_ORIGINS`: se ci inserisci il dominio del tuo sito Firebase, il
  worker smette di essere utilizzabile da chiunque altro. Lascialo vuoto
  per mantenere il comportamento precedente.

Lato app la strategia di fetch è cambiata: il proxy personale viene provato
**in sequenza** (2 tentativi) e solo se fallisce partono i proxy pubblici in
parallelo, con annullamento automatico dei perdenti. Prima partivano ~6
richieste per calendario anche quando il worker rispondeva subito, ed erano
proprio loro a provocare i rate-limit che si volevano evitare.

**Rideploya il worker**: dash.cloudflare.com → il tuo worker → Edit code →
incolla il nuovo contenuto di `cloudflare-worker-proxy.js` → Deploy.

## Aggiornamento v1.3 (fix Vico Garibaldi / LaValletta "CORS bloccato")

Il worker è stato aggiornato: ora riprova automaticamente fino a 3 volte
quando Google risponde 429 (rate-limit sulle raffiche di richieste .ics)
e usa una cache edge di 5 minuti. **Rideploya il worker**: apri il tuo
worker su dash.cloudflare.com → Edit code → incolla il nuovo contenuto di
`cloudflare-worker-proxy.js` → Deploy. Lato app, i feed Google vengono ora
caricati al massimo 2 alla volta con partenze distanziate, così Google non
blocca più gli ultimi calendari della raffica.

## Note

- Il worker accetta solo `calendar.google.com` e `admin.octorate.com`:
  non può essere abusato da terzi per raggiungere altri siti.
- Piano gratuito Cloudflare: 100.000 richieste/giorno — il gestionale
  ne usa poche decine al giorno.
- Se in futuro aggiungi calendari da un altro dominio, aggiungi l'host
  alla lista `ALLOWED_HOSTS` in cima al worker.
