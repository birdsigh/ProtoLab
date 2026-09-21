#!/usr/bin/env python3
"""Local MCP server for ProtoLab. Python stdlib only."""

from __future__ import annotations

import io
import json
import os
import re
import socket
import sys
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

try:
    import tomllib
except ModuleNotFoundError:
    tomllib = None

CONFIG = Path(os.environ.get("PROTOLAB_CONFIG", "~/.config/protolab/config")).expanduser()
WORKSPACE = Path(
    os.environ.get("MCP_WORKSPACE_ROOT")
    or os.environ.get("CLAUDE_PROJECT_DIR")
    or os.getcwd()
).resolve()
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,62}$")
NAME_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,31}$")
RESERVED = {"settings", "api", "favicon.ico", "robots.txt"}
SKIP_FILES = {".DS_Store", "Thumbs.db", ".gitignore", ".protolab"}
MAX_ZIP_BYTES = 25 * 1024 * 1024
MAX_ENTRIES = 500
PENDING: dict[str, dict[str, str]] = {}


class ToolError(Exception):
    pass


def parse_simple_toml(text: str) -> dict:
    data: dict = {}
    section = data
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("[") and line.endswith("]"):
            section = data
            for part in line[1:-1].strip().split("."):
                section = section.setdefault(part, {})
        elif "=" in line:
            key, value = line.split("=", 1)
            value = value.strip()
            if len(value) >= 2 and value[0] == '"' and value[-1] == '"':
                value = value[1:-1]
            section[key.strip()] = value
    return data


def read_config(path: Path = CONFIG) -> dict:
    if not path.exists():
        return {"labs": {}}
    text = path.read_text(encoding="utf-8")
    cfg = tomllib.loads(text) if tomllib else parse_simple_toml(text)
    cfg.setdefault("labs", {})
    return cfg


def quote_toml(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def write_config(cfg: dict) -> None:
    lines: list[str] = []
    if cfg.get("default"):
        lines.append(f"default = {quote_toml(cfg['default'])}")
    for name, lab in cfg.get("labs", {}).items():
        lines.extend([
            "",
            f"[labs.{name}]",
            f"url = {quote_toml(lab['url'])}",
            f"token = {quote_toml(lab['token'])}",
        ])
    CONFIG.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    temp = CONFIG.with_name(f".{CONFIG.name}.{os.getpid()}.tmp")
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write("\n".join(lines) + "\n")
        os.replace(temp, CONFIG)
        CONFIG.chmod(0o600)
    finally:
        if temp.exists():
            temp.unlink()


def normalize_url(value: str) -> str:
    raw = value.strip()
    if not raw.startswith(("http://", "https://")):
        raw = "https://" + raw
    parsed = urllib.parse.urlparse(raw)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ToolError(f"Invalid lab URL: {value}")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ToolError("Lab URL must not contain credentials, a query, or a fragment")
    return f"{parsed.scheme}://{parsed.netloc}".rstrip("/")


def request(method: str, url: str, body: bytes | None = None,
            headers: dict[str, str] | None = None) -> tuple[int, dict | str]:
    req = urllib.request.Request(url, data=body, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            raw, status = response.read(), response.status
    except urllib.error.HTTPError as error:
        raw, status = error.read(), error.code
    except urllib.error.URLError as error:
        raise ToolError(f"Cannot reach {url}: {error.reason}") from error
    try:
        return status, json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return status, raw.decode("utf-8", "replace")


def api_error(data: dict | str) -> str:
    return str(data.get("error", data)) if isinstance(data, dict) else data


def resolve_lab(name: str | None = None) -> tuple[str, str, str]:
    env_url, env_token = os.environ.get("PROTOLAB_URL"), os.environ.get("PROTOLAB_TOKEN")
    if env_url and env_token:
        return "env-override", normalize_url(env_url), env_token
    cfg = read_config()
    labs = cfg["labs"]
    selected = os.environ.get("PROTOLAB_LAB") or name or cfg.get("default")
    if selected:
        if selected not in labs:
            raise ToolError(f"Lab '{selected}' not found. Configured: {', '.join(labs) or 'none'}")
    elif len(labs) == 1:
        selected = next(iter(labs))
    elif not labs:
        raise ToolError("No global labs configured. Pair a lab first.")
    else:
        raise ToolError(f"Choose a lab. Configured: {', '.join(labs)}")
    lab = labs[selected]
    return selected, normalize_url(lab["url"]), lab["token"]


def validate_slug(slug: str) -> None:
    if not SLUG_RE.fullmatch(slug):
        raise ToolError("Slug must be lowercase alphanumeric plus hyphens, 1-63 characters")
    if slug in RESERVED or slug.startswith("_"):
        raise ToolError(f"Slug '{slug}' is reserved")


def derive_slug(path: Path) -> str:
    raw = path.name if path.is_dir() else path.stem
    return re.sub(r"[^a-z0-9-]+", "-", raw.lower()).strip("-")[:63]


def source_path(value: str) -> Path:
    path = Path(value).expanduser()
    if not path.is_absolute():
        path = WORKSPACE / path
    path = path.resolve()
    if not path.exists():
        raise ToolError(f"Source does not exist: {path}")
    return path


def archive_folder(folder: Path) -> bytes:
    if not (folder / "index.html").is_file():
        raise ToolError(f"{folder} has no index.html at its root")
    output = io.BytesIO()
    count = 0
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(folder.rglob("*")):
            if not path.is_file() or path.name in SKIP_FILES or ".git" in path.parts:
                continue
            count += 1
            if count > MAX_ENTRIES:
                raise ToolError(f"More than {MAX_ENTRIES} files")
            archive.write(path, path.relative_to(folder).as_posix())
    data = output.getvalue()
    if len(data) > MAX_ZIP_BYTES:
        raise ToolError(f"Archive is {len(data)} bytes; limit is {MAX_ZIP_BYTES}")
    return data


def lab_summary() -> str:
    cfg = read_config()
    labs = cfg["labs"]
    if not labs:
        return "No global labs configured. Pair a lab or import an existing config."
    rows = [f"Global config: {CONFIG}"]
    for name, lab in labs.items():
        suffix = " (default)" if cfg.get("default") == name else ""
        rows.append(f"- {name}: {lab['url']}{suffix}")
    return "\n".join(rows)


def tool_status(args: dict) -> str:
    summary = lab_summary()
    if not read_config()["labs"]:
        return summary
    name, url, token = resolve_lab(args.get("lab"))
    status, data = request("GET", f"{url}/api/health", headers={"Authorization": f"Bearer {token}"})
    if status == 401:
        raise ToolError(f"Token for '{name}' was revoked. Re-pair?")
    if status != 200:
        raise ToolError(f"Health check failed ({status}): {api_error(data)}")
    return f"{summary}\nHealthy: {name} -> {data.get('base_url', url)}"


def tool_import_project_config(args: dict) -> str:
    source = Path(args.get("path") or (WORKSPACE / ".protolab")).expanduser().resolve()
    if CONFIG.exists():
        raise ToolError(f"Global config already exists at {CONFIG}; refusing to overwrite it")
    if not source.exists():
        raise ToolError(f"No config at {source}")
    cfg = read_config(source)
    if not cfg["labs"]:
        raise ToolError("Project config has no labs")
    write_config(cfg)
    return f"Imported {len(cfg['labs'])} lab(s) into global config {CONFIG}. The project file was left untouched."


def alias_for_url(url: str) -> str:
    host = urllib.parse.urlparse(url).hostname or "lab"
    pieces = host.split(".")
    raw = pieces[-2] if len(pieces) > 1 else pieces[0]
    return re.sub(r"[^a-z0-9_-]", "-", raw.lower()).strip("-") or "lab"


def tool_pair_start(args: dict) -> str:
    url = normalize_url(args["url"])
    alias = args.get("alias") or alias_for_url(url)
    if not NAME_RE.fullmatch(alias):
        raise ToolError("Alias must be lowercase alphanumeric, hyphen, or underscore")
    body = json.dumps({"requester": socket.gethostname()}).encode()
    status, data = request("POST", f"{url}/api/pair", body,
                           {"Content-Type": "application/json"})
    if status == 429:
        raise ToolError("Pairing is rate limited; wait a minute and retry")
    if status != 200 or not isinstance(data, dict):
        raise ToolError(f"Pairing failed ({status}): {api_error(data)}")
    code = str(data["code"])
    PENDING[code] = {"url": url, "alias": alias}
    return f"Open {url}/settings and approve code {code}. Then run finish pairing with code {code}."


def tool_pair_finish(args: dict) -> str:
    code = args["code"].upper()
    pending = PENDING.get(code)
    if not pending:
        raise ToolError("Unknown pairing code in this session. Start pairing again.")
    status, data = request("GET", f"{pending['url']}/api/pair/{code}")
    if status == 202:
        return "Pairing is still pending. Approve the code in ProtoLab settings, then try again."
    if status == 410:
        PENDING.pop(code, None)
        raise ToolError("Pairing expired or was denied. Start pairing again.")
    if status != 200 or not isinstance(data, dict) or not data.get("token"):
        raise ToolError(f"Pairing failed ({status}): {api_error(data)}")
    cfg = read_config()
    labs = cfg["labs"]
    existing = next((name for name, lab in labs.items()
                     if normalize_url(lab["url"]) == pending["url"]), None)
    alias = existing or pending["alias"]
    if alias in labs and alias != existing and normalize_url(labs[alias]["url"]) != pending["url"]:
        raise ToolError(f"Alias '{alias}' already points to another lab")
    first = not labs
    labs[alias] = {"url": pending["url"], "token": data["token"]}
    if first or not cfg.get("default"):
        cfg["default"] = alias
    write_config(cfg)
    PENDING.pop(code, None)
    return f"Paired '{alias}' -> {pending['url']}. Saved globally at {CONFIG}."


def tool_deploy(args: dict) -> str:
    path = source_path(args["path"])
    if path.is_dir():
        body, content_type = archive_folder(path), "application/zip"
    elif path.is_file() and path.suffix.lower() in {".html", ".htm"}:
        body, content_type = path.read_bytes(), "text/html"
    else:
        raise ToolError("Source must be a folder or an HTML file")
    slug = args.get("slug") or derive_slug(path)
    validate_slug(slug)
    name, url, token = resolve_lab(args.get("lab"))
    status, data = request(
        "PUT", f"{url}/api/prototypes/{slug}", body,
        {"Authorization": f"Bearer {token}", "Content-Type": content_type},
    )
    if status == 401:
        raise ToolError(f"Token for '{name}' was revoked. Re-pair?")
    if status != 200 or not isinstance(data, dict):
        raise ToolError(f"Deploy failed ({status}): {api_error(data)}")
    return f"Deployed: {data['url']} ({data['files']} file(s), {data['bytes']} bytes, lab: {name})"


def tool_remove(args: dict) -> str:
    slug = args["slug"]
    validate_slug(slug)
    name, url, token = resolve_lab(args.get("lab"))
    status, data = request("DELETE", f"{url}/api/prototypes/{slug}",
                           headers={"Authorization": f"Bearer {token}"})
    if status == 401:
        raise ToolError(f"Token for '{name}' was revoked. Re-pair?")
    if status != 200:
        raise ToolError(f"Remove failed ({status}): {api_error(data)}")
    return f"Removed '{slug}' from '{name}' ({url})"


TOOLS = [
    {
        "name": "protolab_status",
        "description": "List globally configured ProtoLab labs and health-check the selected/default lab.",
        "inputSchema": {"type": "object", "properties": {"lab": {"type": "string"}}},
        "annotations": {"readOnlyHint": True},
    },
    {
        "name": "protolab_import_project_config",
        "description": "Copy an existing .protolab config into the global host config. Never overwrites an existing global config.",
        "inputSchema": {
            "type": "object",
            "properties": {"path": {"type": "string", "description": "Absolute path to .protolab"}},
        },
    },
    {
        "name": "protolab_pair_start",
        "description": "Start one-time pairing with a ProtoLab and return the approval code.",
        "inputSchema": {
            "type": "object", "required": ["url"],
            "properties": {"url": {"type": "string"}, "alias": {"type": "string"}},
        },
    },
    {
        "name": "protolab_pair_finish",
        "description": "Claim an approved pairing code and save the token in the host's global ProtoLab config.",
        "inputSchema": {
            "type": "object", "required": ["code"],
            "properties": {"code": {"type": "string"}},
        },
    },
    {
        "name": "protolab_deploy",
        "description": "Deploy a static HTML file or folder to ProtoLab. Existing content at the slug is replaced.",
        "inputSchema": {
            "type": "object", "required": ["path"],
            "properties": {
                "path": {"type": "string"}, "slug": {"type": "string"}, "lab": {"type": "string"},
            },
        },
        "annotations": {"destructiveHint": True},
    },
    {
        "name": "protolab_remove",
        "description": "Delete a deployed prototype from ProtoLab.",
        "inputSchema": {
            "type": "object", "required": ["slug"],
            "properties": {"slug": {"type": "string"}, "lab": {"type": "string"}},
        },
        "annotations": {"destructiveHint": True},
    },
]

HANDLERS = {
    "protolab_status": tool_status,
    "protolab_import_project_config": tool_import_project_config,
    "protolab_pair_start": tool_pair_start,
    "protolab_pair_finish": tool_pair_finish,
    "protolab_deploy": tool_deploy,
    "protolab_remove": tool_remove,
}


def send(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def result(request_id, value: dict) -> None:
    send({"jsonrpc": "2.0", "id": request_id, "result": value})


def handle(message: dict) -> None:
    method = message.get("method")
    request_id = message.get("id")
    if method == "initialize":
        requested = message.get("params", {}).get("protocolVersion", "2025-06-18")
        result(request_id, {
            "protocolVersion": requested,
            "capabilities": {"tools": {}},
            "serverInfo": {"name": "protolab", "version": "0.1.0"},
        })
    elif method == "ping":
        result(request_id, {})
    elif method == "tools/list":
        result(request_id, {"tools": TOOLS})
    elif method == "tools/call":
        params = message.get("params", {})
        try:
            handler = HANDLERS.get(params.get("name"))
            if not handler:
                raise ToolError(f"Unknown tool: {params.get('name')}")
            text = handler(params.get("arguments") or {})
            result(request_id, {"content": [{"type": "text", "text": text}]})
        except (ToolError, KeyError, OSError, ValueError) as error:
            result(request_id, {
                "content": [{"type": "text", "text": str(error)}],
                "isError": True,
            })
    elif request_id is not None:
        send({"jsonrpc": "2.0", "id": request_id,
              "error": {"code": -32601, "message": f"Method not found: {method}"}})


def main() -> None:
    for line in sys.stdin:
        try:
            message = json.loads(line)
            handle(message)
        except Exception as error:
            print(f"ProtoLab MCP error: {error}", file=sys.stderr, flush=True)


if __name__ == "__main__":
    main()
