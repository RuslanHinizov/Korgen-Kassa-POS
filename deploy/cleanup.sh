#!/bin/sh
# Frees disk space on the live server. Safe: it never touches the database, uploaded pictures or the running app.
#   sh /opt/korgen/deploy/cleanup.sh
# It removes: unused Docker images and build cache, the uploaded source archive, old pre-update backups (keeps the
# newest 3), old till program installers (keeps the newest version), old system logs and package cache.
set -u
echo "== disk before"; df -h / | tail -1

echo "== docker: unused images and build cache"
docker image prune -af >/dev/null 2>&1 || true
docker builder prune -af >/dev/null 2>&1 || true

echo "== uploaded source archive"
rm -f /root/korgen-src.tar.gz

echo "== old backups (keeping the newest 3 of each kind)"
for pattern in "pre-update-*.dump" "before-reset-*.dump"; do
  ls -1t /opt/korgen-backups/$pattern 2>/dev/null | tail -n +4 | while read -r f; do rm -f "$f"; done
done

echo "== old till program installers (keeping the newest version)"
cd /opt/korgen/till-updates 2>/dev/null && {
  newest=$(grep -m1 '^version:' latest.yml 2>/dev/null | sed 's/version: *//')
  if [ -n "$newest" ]; then
    for f in "Korgen Kassa Setup "*; do
      [ -e "$f" ] || continue
      case "$f" in *"$newest"*) ;; *) rm -f "$f" ;; esac
    done
  fi
}

echo "== system logs and package cache"
journalctl --vacuum-size=100M >/dev/null 2>&1 || true
apt-get clean >/dev/null 2>&1 || true

echo "== disk after"; df -h / | tail -1
echo "App check:"; docker exec korgen-web-1 node -e "fetch('http://localhost:3000/api/ping').then(r=>console.log(r.ok?'OK':'FAIL'))" 2>/dev/null || echo "could not check"
