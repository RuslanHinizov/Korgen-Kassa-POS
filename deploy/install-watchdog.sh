#!/bin/sh
# Installs the watchdog as a cron job (every 5 minutes) on the server. Run once:
#   sh deploy/install-watchdog.sh
set -eu
DIR=/opt/korgen
[ -f "$DIR/deploy/watchdog.sh" ] || { echo "run from the server after the code is in $DIR"; exit 1; }
chmod +x "$DIR/deploy/watchdog.sh"
cat > /etc/cron.d/korgen-watchdog <<EOF
# Korgen Kassa server watchdog
*/5 * * * * root /bin/sh $DIR/deploy/watchdog.sh >> /var/log/korgen-watchdog.log 2>&1
EOF
chmod 644 /etc/cron.d/korgen-watchdog
# keep the log small
cat > /etc/logrotate.d/korgen-watchdog <<EOF
/var/log/korgen-watchdog.log {
  weekly
  rotate 4
  compress
  missingok
  notifempty
}
EOF
echo "installed: /etc/cron.d/korgen-watchdog (every 5 minutes, log: /var/log/korgen-watchdog.log)"
echo "test message:  sh $DIR/deploy/watchdog.sh --test"
