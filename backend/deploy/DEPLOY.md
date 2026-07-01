# Deploying the backend to homebase (DigitalOcean)

Goal: the Python server runs on the droplet, reachable at
`https://api.johnspace.xyz`, so the deployed frontend can connect over WSS.

## 1. DNS — Moniker
Add one record for `johnspace.xyz`:

| Type | Host / Name | Value | TTL |
|------|-------------|-------|-----|
| A    | `api`       | `<droplet public IPv4>` | default (3600) |

The droplet's public IPv4 is on its DigitalOcean page (not the `100.x` Tailscale
address — that's private). This is an A record to **your own** server, so there's
no subdomain-takeover exposure. Propagation is usually minutes; verify with
`dig api.johnspace.xyz +short` (should return the droplet IP).

## 2. DigitalOcean — firewall
Open inbound **80** and **443** (plus 22 for SSH) on:
- the **DO Cloud Firewall** attached to the droplet (if any), and
- the droplet's local firewall: `sudo ufw allow 80,443,22/tcp && sudo ufw enable`

Caddy needs 80 (ACME HTTP challenge) and 443 (HTTPS). **Heads-up:** if homebase
already serves other sites on 80/443 (existing nginx/Caddy/Apache), do NOT start
a second proxy — add the `api.johnspace.xyz` block to that existing proxy instead
(see note at the bottom).

## 3. Droplet — install + run the backend
```bash
sudo apt update && sudo apt install -y python3-venv git
sudo mkdir -p /opt/battleship && sudo chown $USER /opt/battleship
git clone https://github.com/mnky9800n/battleship.git /opt/battleship
cd /opt/battleship/backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m pytest          # sanity: 10 tests pass
```

Run it under systemd:
```bash
sudo useradd -r -s /usr/sbin/nologin battleship 2>/dev/null || true
sudo chown -R battleship /opt/battleship
sudo cp deploy/battleship-api.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now battleship-api
systemctl status battleship-api          # should be active (running)
curl -s localhost:8000/health            # {"status":"ok"}
```

## 4. Droplet — Caddy (TLS + reverse proxy)
```bash
sudo apt install -y caddy        # or the official Caddy apt repo
sudo cp /opt/battleship/backend/Caddyfile /etc/caddy/Caddyfile
sudo systemctl restart caddy
```
Caddy auto-provisions the Let's Encrypt cert for `api.johnspace.xyz` (needs the
DNS A record live and ports 80/443 open). Verify from your laptop:
```bash
curl -s https://api.johnspace.xyz/health     # {"status":"ok"} over HTTPS
```

## 5. Point the frontend at it
In `.github/workflows/deploy.yml`, set `REACT_APP_API_URL=https://api.johnspace.xyz`
in the build env, then push. The Pages build becomes the **online** (server-backed)
build. Do this only **after** step 4 verifies, so the public site isn't pointed at
a backend that isn't up yet.

## The AI opponent's brain (ANTHROPIC_API_KEY)
The vs-AI opponent uses Claude to pick moves and taunt. Give the service an
Anthropic API key, or it silently falls back to the hunt/target algorithm with
canned taunts (the game still works, just no LLM):
```bash
sudo systemctl edit battleship-api    # add an [Service] Environment= line, or:
# echo 'ANTHROPIC_API_KEY=sk-ant-...' | sudo tee -a /etc/battleship.env  (and EnvironmentFile= in the unit)
sudo systemctl restart battleship-api
```
The player's optional Sentience key is passed per-game from the client and never
stored server-side; nothing to configure for it.

## Updating later
```bash
cd /opt/battleship && git pull
cd backend && .venv/bin/pip install -r requirements.txt   # if requirements changed (e.g. anthropic)
sudo systemctl restart battleship-api
```

## If homebase already runs a reverse proxy on 80/443
Skip the Caddy install. Add a vhost for `api.johnspace.xyz` to the existing proxy
that terminates TLS and `proxy_pass` / `reverse_proxy` to `127.0.0.1:8000`, with
the WebSocket upgrade enabled (nginx: `proxy_set_header Upgrade $http_upgrade;`
and `Connection "upgrade"`). The uvicorn service (step 3) is the same either way.
