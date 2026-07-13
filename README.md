<p>
  <a href="https://sprettynice.com">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://sprettynice.com/github/img/protolab-light.png">
      <source media="(prefers-color-scheme: light)" srcset="https://sprettynice.com/github/img/protolab-dark.png">
      <img alt="ProtoLab" src="https://sprettynice.com/github/img/protolab-dark.png" width="420">
    </picture>
  </a>
</p>

<p align="center">A single deploy target for throwaway prototypes and artefacts, served through Cloudflare R2</p>

A single Cloudflare Worker that hosts throwaway HTML prototypes.
Prototype files live in R2, metadata in D1. The Worker serves the
prototypes, a public gallery at `/`, and its own management page at
`/settings` (behind Cloudflare Access). Deploying a prototype is one
authenticated HTTP call from anywhere — no repo checkout, no wrangler.

Full design: [SPEC.md](SPEC.md). Deploy contract for agents/skills:
[AGENTS.md](AGENTS.md). A ready-made client, the `deploy-prototype`
skill, ships separately in [birdsigh/skills](https://github.com/birdsigh/skills).

## Requirements

- Cloudflare account on the **Workers paid plan**. This is not optional:
  unzipping deploys exceeds the free plan's 10 ms CPU budget, and the
  rate-limiting binding used for pairing requires paid.
- A custom domain on a Cloudflare zone (Access cannot protect
  `*.workers.dev`).
- Node + npm, `wrangler login`.

## Setup

```sh
npm install
scripts/setup.sh
```

The script creates the R2 bucket and D1 database, applies the schema,
sets `COOKIE_SECRET`, and deploys — then prints the one-time manual
checklist (Access app over `/settings*`, custom domain, team domain +
AUD vars). Afterwards:

```sh
scripts/setup.sh --check https://your-domain
```

Setup is not done until `--check` passes; it verifies the management
surface is actually locked down.

## Deploying a prototype

```sh
curl -X PUT https://your-domain/api/prototypes/my-idea \
  -H "Authorization: Bearer plab_..." \
  -H "Content-Type: application/zip" \
  --data-binary @proto.zip
```

Or a single file: send it with `Content-Type: text/html` and it becomes
`index.html`. Tokens are minted on `/settings`, or via the pairing flow
(`POST /api/pair`) described in AGENTS.md.

## Repo layout

```
src/                   Worker: router, auth, API handlers, serving, settings UI
test/                  vitest unit tests (fake R2/D1, no wrangler needed)
schema.sql             D1 schema (idempotent)
scripts/               setup.sh (guided setup + --check verification)
wrangler.toml.example  bindings and routes template
```

`setup.sh` copies `wrangler.toml.example` to `wrangler.toml`, which is
gitignored — it accumulates deployment-specific values (database id,
custom domain, Access team domain + AUD). Secrets are never in the repo
(`wrangler secret put COOKIE_SECRET`); prototype content never touches
git.

## License

MIT — see [LICENSE](LICENSE).
