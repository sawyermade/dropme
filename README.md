# DropMe

A node js file uploader for ppl to drop you shit

## Requirements

- Node.js 18+ and npm

## Clone

```bash
git clone https://github.com/sawyermade/dropme.git
cd dropme
```

## Install

```bash
npm install
cp .env.example .env
```

Edit `.env` and set a real `SESSION_SECRET` (used to sign session cookies — anyone
with this value can forge a logged-in session, so make it long and random):

```bash
openssl rand -hex 32
```

Paste the output in as `SESSION_SECRET=...` in `.env`. `PORT` defaults to `3000`
if unset.

## Create users

```bash
npm run adduser
```

This prompts for a username and password and stores a bcrypt-hashed credential in
`users.json` at the repo root (created automatically on first run). There's no
signup page — every account is created this way, on the machine running the
server. Run it again any time to add another user or overwrite an existing user's
password.

Usernames may only contain letters, numbers, hyphens, and underscores, since the
username doubles as the upload folder name (see below).

`users.json` is gitignored — it's per-deployment data, not part of the repo.

## Run locally

```bash
npm start
```

Visit `http://localhost:3000`, log in, then drag & drop, paste, or browse to
select files and hit Upload.

## Run on a remote server

1. On the server, install Node.js 18+, then clone and install as above:

   ```bash
   git clone https://github.com/sawyermade/dropme.git
   cd dropme
   npm install
   cp .env.example .env
   ```

2. Edit `.env` — set `SESSION_SECRET` (see above) and a `PORT` if you don't want
   the default `3000`. If it's being hosted under an existing site instead of
   its own (sub)domain, also set `BASE_PATH` (see below).

3. Create at least one user with `npm run adduser`.

4. Keep the app running and auto-restarting with a process manager, e.g.
   [pm2](https://pm2.keymetrics.io/):

   ```bash
   npm install -g pm2
   pm2 start server.js --name dropme
   pm2 save
   pm2 startup   # prints a command to run so pm2 survives a reboot
   ```

5. Put a reverse proxy in front of it (nginx, Caddy, etc.) to handle your domain
   and TLS, and proxy to the app's local port.

   **Option A — its own (sub)domain**, e.g. `dropme.your.domain.com`, serving
   from the root:

   ```nginx
   server {
       listen 443 ssl;
       server_name dropme.your.domain.com;

       ssl_certificate     /etc/letsencrypt/live/dropme.your.domain.com/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/dropme.your.domain.com/privkey.pem;

       location / {
           proxy_pass http://localhost:3000;
           proxy_set_header Host $host;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           client_max_body_size 0;
       }
   }
   ```

   **Option B — a path under an existing site**, e.g.
   `your.domain.com/dropme`. Set `BASE_PATH=/dropme` in `.env` (must match the
   nginx location below, no trailing slash) and add this `location` block
   inside that site's existing `server { ... }`:

   ```nginx
   location /dropme {
       proxy_pass http://127.0.0.1:3000;
       proxy_set_header Host $host;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
       client_max_body_size 0;
   }
   ```

   `client_max_body_size 0;` disables nginx's default 1 MB body-size cap, which
   would otherwise reject any upload over 1 MB — set it to a specific limit
   (e.g. `2048m`) instead of `0` if you want to cap upload size.

   Either way, only expose ports 80/443 on the server's firewall — leave the
   app's port (e.g. `3000`) closed to the outside world so it's only reachable
   through the proxy.

## Where files are stored

Uploads land in `uploads/<username>/`, where `<username>` is whoever is logged
in. The folder is created automatically the first time that user uploads
something. Files keep their original name; uploading a file with the same name
as one already there overwrites it.

`uploads/` is gitignored — uploaded files live only on the server, not in the repo.

## What's gitignored (and why)

These hold real data/secrets and are never committed — on a fresh clone (or a
new server) you need to recreate them yourself using the steps above:

- `.env` — `PORT`, `SESSION_SECRET`, and `BASE_PATH`
- `users.json` — bcrypt-hashed login credentials
- `uploads/` — everything anyone has uploaded
