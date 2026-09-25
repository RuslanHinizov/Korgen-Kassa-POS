#!/bin/sh
# Server watchdog — run every 5 minutes from cron (see deploy/install-watchdog.sh).
#
# Checks: the app + database answer (/api/health, from inside and through https), all containers run,
# disk space, memory, the newest nightly backup, and the TLS certificate. A dead app is restarted once
# it has failed twice in a row. Every problem is sent to Telegram (if TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID
# are in .env.production) once per hour, and a "back to normal" note is sent when it clears.
#
#   sh deploy/watchdog.sh           normal run
#   sh deploy/watchdog.sh --test    send a test message and exit
#
# Overridable for testing: KORGEN_DIR, CONTAINER_PREFIX, WATCH_SERVICES, HEALTH_URL, STATE_DIR, TELEGRAM_API_BASE
set -u

DIR=${KORGEN_DIR:-/opt/korgen}
PREFIX=${CONTAINER_PREFIX:-korgen}
SERVICES=${WATCH_SERVICES:-"web caddy postgres backup"}
STATE=${STATE_DIR:-/var/lib/korgen-watchdog}
API=${TELEGRAM_API_BASE:-https://api.telegram.org}
ENVFILE="$DIR/.env.production"
COOLDOWN=3600
mkdir -p "$STATE"
SINK="$STATE/.curl.out"   # curl body goes here (portable; no /dev/null)

envval() { [ -f "$ENVFILE" ] && grep -E "^$1=" "$ENVFILE" | head -n1 | cut -d= -f2-; }
TOKEN=${TELEGRAM_BOT_TOKEN:-$(envval TELEGRAM_BOT_TOKEN)}
CHAT=${TELEGRAM_CHAT_ID:-$(envval TELEGRAM_CHAT_ID)}
DOMAIN=${DOMAIN:-$(envval DOMAIN)}
URL=${HEALTH_URL:-"https://$DOMAIN/api/health"}
HOST=$(hostname)
NOW=$(date +%s)

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*"; }

tg() {
  log "ALERT: $1"
  [ -n "$TOKEN" ] && [ -n "$CHAT" ] || return 0
  curl -sS -m 10 -o "$SINK" "$API/bot$TOKEN/sendMessage" --data-urlencode "chat_id=$CHAT" --data-urlencode "text=$1" || true
}

if [ "${1:-}" = "--test" ]; then tg "✅ Watchdog $HOST: тестовое сообщение. Уведомления работают."; exit 0; fi

# problem(key, message): alert at most once per COOLDOWN; ok(key): clear and announce recovery
problem() {
  key=$1; msg=$2
  f="$STATE/$key.alerted"
  last=0; [ -f "$f" ] && last=$(cat "$f")
  if [ $((NOW - last)) -ge $COOLDOWN ]; then tg "🔴 $HOST: $msg"; echo "$NOW" > "$f"; fi
  echo "$NOW" > "$STATE/$key.bad"
}
ok() {
  key=$1; msg=$2
  if [ -f "$STATE/$key.alerted" ]; then tg "🟢 $HOST: $msg"; rm -f "$STATE/$key.alerted"; fi
  rm -f "$STATE/$key.bad" "$STATE/$key.fails"
}

# ---- 1. containers
webstate=running
for s in $SERVICES; do
  name="$PREFIX-$s-1"
  state=$(docker inspect -f '{{.State.Status}}' "$name" 2>/dev/null || echo missing)
  [ "$s" = web ] && webstate=$state
  if [ "$state" != "running" ]; then
    problem "container-$s" "контейнер $s не работает ($state). Пробую запустить."
    docker start "$name" >/dev/null 2>&1 || true
  else
    ok "container-$s" "контейнер $s снова работает"
  fi
done

# fails KEY: count consecutive failed checks (an alert needs 2 in a row, so one hiccup stays quiet)
fails() { n=0; [ -f "$STATE/$1.fails" ] && n=$(cat "$STATE/$1.fails"); n=$((n + 1)); echo "$n" > "$STATE/$1.fails"; echo "$n"; }

# ---- 2. the app + database, from inside the web container
inside=0
if [ "$webstate" = running ]; then
  if docker exec "$PREFIX-web-1" node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then inside=1; fi
  if [ "$inside" = 1 ]; then
    ok "app" "приложение отвечает"
  else
    n=$(fails app)
    if [ "$n" -ge 2 ]; then
      problem "app" "приложение или база не отвечает ($n проверки подряд). Перезапускаю приложение."
      log "restarting $PREFIX-web-1"
      docker restart "$PREFIX-web-1" >/dev/null 2>&1 || true
      echo 0 > "$STATE/app.fails"
    fi
  fi
fi

# ---- 3. the public address (DNS, certificate, Caddy)
if [ -n "${DOMAIN:-}" ] || [ -n "${HEALTH_URL:-}" ]; then
  code=$(curl -sS -m 15 -o "$SINK" -w '%{http_code}' "$URL" 2>/dev/null) || true
  [ -n "$code" ] || code=000
  if [ "$code" = "200" ]; then
    ok "public" "сайт снова доступен по адресу $URL"
  elif [ "$inside" = 1 ]; then
    n=$(fails public)
    [ "$n" -ge 2 ] && problem "public" "сайт недоступен снаружи ($URL → $code), хотя приложение работает: проверьте Caddy / DNS / сертификат."
  fi
fi

# ---- 4. disk (system disk) and memory
used=$(df -P / 2>/dev/null | awk 'NR==2 {gsub("%","",$5); print $5}')
case "$used" in ''|*[!0-9]*) used=0 ;; esac
[ "$used" -le 100 ] || used=0
if [ "${used:-0}" -ge 85 ]; then problem "disk" "диск заполнен на ${used}%."; else ok "disk" "места на диске достаточно (${used}%)"; fi
avail=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 9999)
if [ "${avail:-9999}" -lt 150 ]; then problem "memory" "мало свободной памяти: ${avail} МБ."; else ok "memory" "память в норме"; fi

# ---- 5. nightly backup not older than 30 hours (only where the backup container exists)
case " $SERVICES " in *" backup "*)
  newest=$(docker exec "$PREFIX-backup-1" sh -c 'ls -1t /backups/daily/*.dump 2>/dev/null | head -n1 | xargs -r stat -c %Y' 2>/dev/null || true)
  if [ -z "$newest" ]; then problem "backup" "не найдено ни одной резервной копии."
  elif [ $((NOW - newest)) -gt 108000 ]; then problem "backup" "последняя резервная копия старше 30 часов."
  else ok "backup" "резервные копии создаются"; fi
;; esac

# ---- 6. TLS certificate (only when a real domain is configured)
if [ -n "${DOMAIN:-}" ] && command -v openssl >/dev/null 2>&1; then
  end=$(echo | openssl s_client -connect 127.0.0.1:443 -servername "$DOMAIN" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
  if [ -n "$end" ]; then
    days=$(( ($(date -d "$end" +%s) - NOW) / 86400 ))
    if [ "$days" -lt 10 ]; then problem "cert" "сертификат HTTPS истекает через $days дн."; else ok "cert" "сертификат HTTPS в порядке ($days дн.)"; fi
  fi
fi

exit 0
