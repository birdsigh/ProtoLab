---
name: deploy-prototype
description: Deploy, publish, remove, or configure static HTML prototypes on ProtoLab. Use whenever the user asks to deploy, host, publish, share, or remove a static prototype, mockup, demo page, or HTML site with ProtoLab. Do not use for backends, databases, authentication, server-side rendering, or build-dependent source projects.
---

# ProtoLab deployments

Use the bundled `protolab_*` MCP tools. The local MCP process keeps credentials
in `~/.config/protolab/config`, outside project folders and agent sandboxes.

## Setup

Call `protolab_status` first when setup is uncertain.

- If an existing `.protolab` should be migrated, ask permission, resolve its
  absolute path, then call `protolab_import_project_config` with that path.
- Otherwise ask only for the lab URL, call `protolab_pair_start`, relay its
  approval code, and wait for the user to approve it. Then call
  `protolab_pair_finish` with that code.
- Never ask the user to paste a token.

## Scope

ProtoLab accepts only static HTML. A folder must contain `index.html` at its
root. A single `.html` file is also accepted. Stop if the requested source
needs a backend, database, auth, server-side rendering, or a build step.

## Required confirmation

Deployment is public and replaces any existing prototype using the same slug.
Before every `protolab_deploy` call, show and get explicit approval for:

- lab alias and host
- exact source path
- slug and full resulting URL
- warning that the slug may already exist and will be overwritten

Always pass an absolute source path to `protolab_deploy` so the workflow works
consistently across MCP hosts.

A same-turn instruction qualifies only when it explicitly identifies the lab,
source, slug, and says to proceed. Always echo the resolved plan first.

After deployment, return the complete URL reported by the tool.

Before `protolab_remove`, confirm the lab and slug unless the user explicitly
authorized both in the same turn.
