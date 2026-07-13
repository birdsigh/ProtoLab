# ProtoLab deploy contract

For agents deploying prototypes TO a running ProtoLab. Deploying ProtoLab
itself is wrangler from this repo — a different verb; see README.md.

Static HTML only. Backend, auth, database, or build steps → wrong tool;
say so and stop.

## Config resolution (per invocation, first match wins)

1. `PROTOLAB_URL` + `PROTOLAB_TOKEN` env vars (explicit override)
2. `PROTOLAB_LAB=<name>` env var selecting a config entry
3. Lab named in the user's request ("deploy this to the work lab")
4. `default` from config
5. Exactly one lab configured → use it
6. Otherwise: ask, never guess

Config lives at `~/.config/protolab/config` (TOML, chmod 600):

```toml
default = "personal"

[labs.personal]
url = "https://lab.example.com"
token = "plab_..."
```

Also check `./.protolab` in the working directory before giving up
(sandboxed sessions where `$HOME` doesn't persist). Must be gitignored.

## API (bearer token: `Authorization: Bearer plab_...`)

- `PUT /api/prototypes/<slug>` — body: zip of the folder
  (`Content-Type: application/zip`), or a raw single HTML file
  (`Content-Type: text/html`) stored as `index.html`.
  Returns `{ url, slug, files, bytes }`.
- `DELETE /api/prototypes/<slug>` — remove a prototype.
- `GET /api/health` — validates token; `{ ok, lab_name, base_url }`.

Slugs: lowercase alphanumeric + hyphens, 1–63 chars. Reserved: `settings`,
`api`, `favicon.ico`, `robots.txt`, `_` prefix.

## Behavior

- Always echo the **full URL** from the response, never just the slug
  (slugs are per-lab namespaces).
- 401 → say "token for '<alias>' was revoked — re-pair?" not a raw error.
- Zips must contain `index.html` at the root. Cap: 25 MB, 500 entries.

## First run (pairing)

1. Ask for the lab URL only.
2. `POST /api/pair` with body `{ "requester": "<hostname>" }` →
   `{ code, expires_at }` (5-minute TTL, rate-limited).
3. Tell the user: "open <url>/settings and approve code <CODE>".
4. Poll `GET /api/pair/<code>`: 202 pending → keep polling;
   200 `{ token }` → returned exactly once, write config; 410 → expired
   or denied, start over.
5. Ask for a local alias (suggest the domain's short name). First lab
   paired becomes default. Dedupe by URL — re-pairing an existing URL
   updates that entry.
