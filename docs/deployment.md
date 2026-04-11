# Deployment

Current live host: single DigitalOcean droplet (NYC1), RHEL 9, public
IP `157.245.90.29` with a reserved IP `164.90.254.222` that
`nostuh.com` / `www.nostuh.com` resolve to.

## Process layout

- **API**: Node 22 (nvm), served by pm2 as app `api` on port 50000.
  Config: `api/classes/config.json` (gitignored), source of truth for
  DB credentials and the API listen port. Restart: `pm2 restart api`.
  Env vars passed via pm2 on restart: `ZEQ_ADMIN_USER`, `ZEQ_ADMIN_PASS`
  used by the first-admin bootstrap on startup (see [auth.md](auth.md)).
- **Web**: static dist served by nginx from `/srv/zeq/www/src/dist`.
  Build with `cd www/src && npx vite build`. Nginx is configured in
  `/etc/nginx/conf.d/nostuh.com.conf` with a `/api` `proxy_pass` to
  `http://127.0.0.1:50000`.
- **DB**: MariaDB on localhost, database `zeq`, user `zork`. Legacy
  tables (`eq`, `eqmobs`, `kya_info`, `users`) must not be dropped;
  all new tables use the `game_*` prefix plus the bug-reports family.
- **Uploads**: bug report attachments live at
  `/srv/zeq/api/uploads/bugs/{bug_id}/{idx}_{hex}.{jpg|png}`. Cleaned
  up on bug delete by the DELETE endpoint (disk first, DB row second).

## Firewall

RHEL 9 uses firewalld. Open services on this droplet:
```
cockpit dhcpv6-client http https ssh
```
There is no DigitalOcean cloud firewall attached at the platform
layer; if one gets added later, it must also allow `HTTP 80` and
`HTTPS 443` for renewals.

## SSL / HTTPS

Provisioned via Let's Encrypt + `python3-certbot-nginx`. One-time
setup:

```bash
sudo dnf install -y certbot python3-certbot-nginx
sudo firewall-cmd --add-service=https --permanent
sudo firewall-cmd --reload
sudo certbot --nginx -d nostuh.com -d www.nostuh.com \
     --agree-tos --email jnostuh@gmail.com --redirect --non-interactive
```

What this produced:
- Cert files at `/etc/letsencrypt/live/nostuh.com/`
  (`fullchain.pem`, `privkey.pem`, `cert.pem`, `chain.pem`).
- An automatic 443 `ssl` server block added to
  `/etc/nginx/conf.d/nostuh.com.conf` alongside a 301 redirect on 80
  for both `nostuh.com` and `www.nostuh.com`.
- `systemd` timer `certbot-renew.timer` (enabled) that runs twice
  daily and renews any cert within 30 days of expiry. Verify with:
  ```
  sudo systemctl list-timers | grep certbot
  sudo certbot renew --dry-run
  sudo certbot certificates
  ```
- Current expiry: **2026-07-09** (renews automatically ~60 days in).

### Gotcha: certbot leaves the 443 block without the existing vhost directives

`certbot --nginx` generates a new 443 block but only preserves the
existing directives it recognises. Double-check that the `/api`
`proxy_pass`, `root`, `access_log`, and `error_log` all survive any
subsequent certbot run. Diff against the backup if ever in doubt —
every run writes a `.nginx-backup` file alongside the config.

### Manual nginx edit needed the first time

The default `server_name` was `localhost nostuh.com` — `www.nostuh.com`
had to be added before `certbot install --cert-name nostuh.com --nginx`
would install the cert into both domains. If you add more aliases
later, update `server_name` first, then run the install again.

## DNS

`nostuh.com` and `www.nostuh.com` point at the DigitalOcean reserved
IP `164.90.254.222` via no-ip DNS (user-managed, not via DigitalOcean
DNS). The reserved IP routes to the droplet over the internal
`10.10.0.0/24` private network — traffic arrives on the droplet as if
from the internal gateway `10.10.0.2`, which is why `ip addr` on the
droplet shows only the non-reserved `157.245.90.29`.

## Restart checklist

After any code change:

```bash
# API
pm2 restart api --update-env

# Web (if frontend changed)
cd /srv/zeq/www/src && npx vite build

# Sanity
curl -sI https://nostuh.com/                    # expect 200
curl -sI https://nostuh.com/api/auth/me         # expect 200 + {ok:true,data:null}
cd /srv/zeq/scripts/test && node responsive.mjs # expect 12/12 passed
```

## Importing/re-importing Zcreator data

```
cd /srv/zeq/scripts
node import_zcreator.mjs          # skip if data present
node import_zcreator.mjs --force  # truncate game_* tables and re-import
```

`--force` only truncates `game_*` tables. It never touches `users`,
`sessions`, `bug_reports`, `bug_attachments`, `eq`, `eqmobs`, or
`kya_info`. See [data-import.md](data-import.md) for the parser rules.
