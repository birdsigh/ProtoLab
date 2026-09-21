# ProtoLab MCP

Portable local MCP plugin for deploying static HTML prototypes. It reads
`~/.config/protolab/config` and keeps credentials out of project directories
and agent sandboxes.

## Claude Cowork / Claude Code

1. Open **Customize → Plugins**.
2. Choose the option to install/upload a plugin from a file.
3. Select the packaged `protolab-mcp.zip` file.
4. Enable the ProtoLab connector if prompted.

## Codex

Add this repository as a local marketplace, then install the plugin:

```sh
codex plugin marketplace add /path/to/ProtoLab
codex plugin add protolab-mcp@protolab
```

The Codex plugin uses the same MCP server and deployment skill as the Claude
bundle.

Ask the agent to “check ProtoLab status”. If a project already contains
`.protolab`, the agent can import it once into the global host config. The
original project file is deliberately left untouched until you delete it.

## Development

```sh
claude --plugin-dir ./plugins/protolab-mcp
```

Validate with:

```sh
claude plugin validate ./plugins/protolab-mcp
```
