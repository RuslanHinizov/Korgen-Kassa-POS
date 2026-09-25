# Monitoring, error reports and phone alerts

Three layers, from "inside the app" to "outside the server":

| Layer | What it catches | Where you see it |
|---|---|---|
| **Error reports** (in the app) | browser errors, failing pages, API 500s, users' error screens | `/superadmin/errors` (+ red badge on the super admin page) |
| **Support chat** | what users write to you | `/superadmin/support` |
| **Server watchdog** (cron on the VPS, every 5 min) | app/DB not answering (auto-restart), a container down, site unreachable through https, disk ≥ 85 %, memory < 150 MB, no backup for 30 h, TLS certificate < 10 days | Telegram + `/var/log/korgen-watchdog.log` |
| **External monitor** (UptimeRobot) | the whole server is dead / unreachable from the internet | e-mail / phone push |

## 1. Phone alerts through Telegram (optional but recommended)
Without it errors and chat messages are still stored — you just have to open the panel to see them.

1. In Telegram open **@BotFather** → `/newbot` → give a name and a username ending in `bot` → copy the **token** (looks like `123456:ABC…`). Keep it secret.
2. Open your new bot and press **Start**, send it any message.
3. Open in a browser `https://api.telegram.org/bot<TOKEN>/getUpdates` → find `"chat":{"id":123456789` — that number is your **chat id**.
4. On the server add two lines to `/opt/korgen/.env.production`:
   ```
   TELEGRAM_BOT_TOKEN=123456:ABC…
   TELEGRAM_CHAT_ID=123456789
   ```
5. Restart the app so it picks them up: `cd /opt/korgen && docker compose --env-file .env.production -f docker-compose.prod.yml up -d`
6. Test: `sh deploy/watchdog.sh --test` (message arrives) and, in `/superadmin/errors`, press **Ошибка сервера** (an alert arrives).

What arrives: 🔴 new error / error came back / same error 10-100-1000 times, 💬 new support message (max one per conversation per 2 min), 🔴/🟢 watchdog problems and recoveries. At most 20 app alerts per hour and one watchdog alert per problem per hour.

## 2. Server watchdog (on the VPS, once)
```
cd /opt/korgen && sh deploy/install-watchdog.sh
```
Runs every 5 minutes from `/etc/cron.d/korgen-watchdog`. An app that fails two checks in a row is restarted automatically; you are told. Look at the log: `tail /var/log/korgen-watchdog.log`.

## 3. External monitor (catches "the server itself is down")
A script on the dead server cannot report that the server is dead, so use a free outside service:
1. Register at **uptimerobot.com** (free plan).
2. **Add New Monitor** → type *HTTP(s)* → URL `https://korgenkassa.kz/api/health` → interval 5 minutes.
3. Alert contacts: your e-mail, and install the UptimeRobot phone app for push notifications.

`/api/health` answers 200 only when the app **and** the database work (503 otherwise).

## How error reports work
- The browser reports uncaught errors, rejected promises, error screens and any of our own API calls that answered 5xx; the server reports everything thrown while rendering a page or running an API route.
- The same error (ids/numbers ignored) is one row with a counter; **«Отметить исправленной»** closes it and it re-opens by itself (and alerts you) if it comes back.
- Offline / network failures ("Failed to fetch") and browser-extension noise are ignored on purpose — an offline till is not a bug.
- Test buttons on the errors page prove the pipeline end to end.
