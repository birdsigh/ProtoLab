// Management UI, served at /settings (behind Access; JWT re-verified by
// the router). Single inline page, no build step, no external deps.
// Talks to /settings/api/* same-origin.
//
// NOTE: the page's own JavaScript deliberately avoids template literals
// (backticks / ${}) because it lives inside this TS template string.

// Wordmark logos, inlined as data URIs so the page stays a single response
// with no extra routes. Generated from image/protolab-{dark,light}.png:
// background dropped to alpha (they ship as flat grayscale), resized to
// 280px wide (2x the 28px display height). "ink-dark" = black wordmark
// (light theme); "ink-light" = white wordmark (dark theme).
export const LOGO_INK_DARK = "data:image/png;base64,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";
export const LOGO_INK_LIGHT = "data:image/png;base64,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";

export function settingsPage(): Response {
  const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" type="image/png" href="/favicon.ico">
<title>ProtoLab &mdash; Settings</title>
<script>
// Resolve theme before first paint: stored choice (if under a year old)
// wins, otherwise follow the system. data-theme-source records which, so
// the system-change listener knows whether to follow along.
(function () {
  var mode = null;
  try {
    var s = JSON.parse(localStorage.getItem("protolab-theme") || "null");
    if (s && (s.mode === "light" || s.mode === "dark") &&
        Date.now() - (s.ts || 0) < 31536000000) {
      mode = s.mode;
    } else if (s) {
      localStorage.removeItem("protolab-theme");
    }
  } catch (e) {}
  document.documentElement.setAttribute("data-theme-source", mode ? "stored" : "system");
  document.documentElement.setAttribute("data-theme",
    mode || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
})();
</script>
<style>
/* Theme is resolved to data-theme on <html> by the head script below:
   stored choice (localStorage, 1-year expiry) wins, else system. */
:root {
  color-scheme: light;
  --bg: #ffffff;
  --fg: #1c2734;
  --muted: #627080;
  --border: #e4e8ed;
  --card: #f7f9fb;
  --accent: #17639f;
  --accent-ink: #15395e;
  --danger: #ab372c;
  --ok: #2d6a46;
  --warn: #7d5a10;
  --accent-pale: #e6eff7;
  --danger-pale: #f7e5e1;
  --ok-pale: #e0efe6;
  --warn-pale: #f7efd2;
  --highlight: #d9e7f3;
  --ring: rgba(23, 99, 159, 0.22);
  --radius: 6px;
  --shadow-sm: 0 1px 2px 0 rgba(23, 40, 69, 0.06);
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --bg: #14181e;
  --fg: #e4e8ee;
  --muted: #94a0af;
  --border: #2b323c;
  --card: #1a2028;
  --accent: #7fb2dd;
  --accent-ink: #a8cce9;
  --danger: #e08d83;
  --ok: #7dc79a;
  --warn: #d9b166;
  --accent-pale: rgba(127, 178, 221, 0.13);
  --danger-pale: rgba(224, 141, 131, 0.13);
  --ok-pale: rgba(125, 199, 154, 0.13);
  --warn-pale: rgba(217, 177, 102, 0.14);
  --highlight: #2a4258;
  --ring: rgba(127, 178, 221, 0.3);
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.4);
}
* { box-sizing: border-box; }
body {
  margin: 0 auto;
  padding: 28px 20px 64px;
  max-width: 900px;
  background: var(--bg);
  color: var(--fg);
  font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    Helvetica, Arial, sans-serif;
  font-variant-numeric: lining-nums;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
::selection { background: var(--highlight); color: var(--fg); }
h1 { font-size: 21px; font-weight: 600; line-height: 1.2; margin: 0; }
.page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 0 0 6px;
}
.page-head + p { margin: 0 0 28px; color: var(--muted); }
img.logo { height: 28px; display: block; }
img.logo-for-dark { display: none; }
:root[data-theme="dark"] img.logo-for-light { display: none; }
:root[data-theme="dark"] img.logo-for-dark { display: block; }
.theme-toggle { padding: 5px 8px; line-height: 0; }
.theme-toggle svg { width: 15px; height: 15px; }
.theme-toggle .icon-sun { display: none; }
:root[data-theme="dark"] .theme-toggle .icon-sun { display: inline; }
:root[data-theme="dark"] .theme-toggle .icon-moon { display: none; }
section { margin-bottom: 40px; }
h2 {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.25;
  margin: 0 0 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th {
  text-align: left;
  font-weight: 600;
  font-size: 12px;
  color: var(--muted);
  padding: 6px 8px;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}
td {
  padding: 8px;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}
td.num { white-space: nowrap; color: var(--muted); }
a {
  color: var(--accent);
  text-decoration: underline;
  text-decoration-skip-ink: auto;
  text-underline-offset: 3px;
  text-decoration-thickness: 1px;
}
a:hover { color: var(--accent-ink); text-decoration-thickness: 2px; }
a:focus-visible {
  outline: none;
  border-radius: 2px;
  box-shadow: 0 0 0 3px var(--ring);
}
code, .mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
}
button {
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  padding: 4px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg);
  color: var(--fg);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease,
    color 0.15s ease;
}
button:hover { background: var(--card); border-color: var(--muted); }
button:focus-visible {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--ring);
}
button:disabled { opacity: 0.5; cursor: default; box-shadow: none; }
button.danger { color: var(--danger); }
button.danger:hover {
  background: var(--danger-pale);
  border-color: var(--danger);
}
button.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
button.primary:hover {
  background: var(--accent-ink);
  border-color: var(--accent-ink);
}
:root[data-theme="dark"] button.primary { color: #10131a; }
.actions { white-space: nowrap; }
.actions button { margin-right: 4px; }
.badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 9px;
  border-radius: 999px;
  background: var(--card);
  color: var(--muted);
}
.badge.protected { color: var(--warn); background: var(--warn-pale); }
.badge.open, .badge.active { color: var(--ok); background: var(--ok-pale); }
.badge.revoked { color: var(--danger); background: var(--danger-pale); }
.err {
  display: none;
  margin: 8px 0;
  padding: 8px 12px;
  background: var(--danger-pale);
  border-left: 3px solid var(--danger);
  border-radius: var(--radius);
  color: var(--danger);
  font-size: 13px;
}
.err.show { display: block; }
.note {
  margin: 8px 0;
  padding: 8px 12px;
  background: var(--ok-pale);
  border-left: 3px solid var(--ok);
  border-radius: var(--radius);
  color: var(--ok);
  font-size: 13px;
}
.empty { color: var(--muted); font-style: italic; padding: 10px 8px; }
form.row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
input[type="text"], input[type="password"] {
  font: inherit;
  font-size: 13px;
  padding: 5px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg);
  color: var(--fg);
  box-shadow: var(--shadow-sm);
}
input[type="text"]:focus-visible, input[type="password"]:focus-visible {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--ring);
}
::placeholder { color: var(--muted); opacity: 0.8; }
input.title-edit { width: 100%; font-size: 13px; padding: 2px 6px; }
/* The native file inputs are hidden; visible <button>s proxy .click() to
   them so the pickers share the ordinary button styling. Styling the
   ::file-selector-button pseudo is not reliable: Chromium resolves its
   styles (custom properties, themed selectors, even light-dark()) against
   a stale light-theme cascade under [data-theme="dark"]. */
.file-name {
  color: var(--muted);
  font-size: 12px;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.filepick { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; }
td.title-cell { cursor: text; max-width: 220px; overflow: hidden; text-overflow: ellipsis; }
td.title-cell:hover { text-decoration: underline dotted; }
.token-reveal {
  display: none;
  margin-top: 10px;
  padding: 10px 12px;
  background: var(--warn-pale);
  border-left: 3px solid var(--warn);
  border-radius: var(--radius);
}
.token-reveal.show { display: block; }
.token-reveal .tok {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  word-break: break-all;
  user-select: all;
  -webkit-user-select: all;
  display: block;
  margin: 6px 0;
}
.token-reveal p { margin: 0; font-size: 12px; color: var(--warn); }
.pair {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  padding: 12px 14px;
  margin-bottom: 8px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: var(--shadow-sm);
}
.pair .code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 3px;
}
.pair .meta { flex: 1; min-width: 180px; color: var(--muted); font-size: 12px; }
.pair .meta strong { color: var(--fg); font-weight: 500; }
.pair .cd { font-variant-numeric: tabular-nums; }
.hint { color: var(--muted); font-size: 12px; margin: 6px 0 0; }
</style>
</head>
<body>
<header class="page-head">
  <h1><img class="logo logo-for-light" src="${LOGO_INK_DARK}" alt="ProtoLab settings"><img
      class="logo logo-for-dark" src="${LOGO_INK_LIGHT}" alt="ProtoLab settings"></h1>
  <button type="button" class="theme-toggle" id="theme-toggle"
    title="Toggle light/dark theme" aria-label="Toggle light/dark theme">
    <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
    <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
  </button>
</header>
<p>Manage prototypes, deploy tokens, and pairing requests.</p>

<section id="sec-protos">
  <h2>Prototypes</h2>
  <div class="err" id="proto-err"></div>
  <table>
    <thead>
      <tr>
        <th>Title</th><th>Slug</th><th>Link</th><th>Updated</th>
        <th>Size</th><th>Access</th><th></th>
      </tr>
    </thead>
    <tbody id="proto-body"></tbody>
  </table>
  <p class="hint">Click a title to rename it.</p>
</section>

<section id="sec-upload">
  <h2>Upload</h2>
  <div class="err" id="upload-err"></div>
  <div class="note" id="upload-ok" style="display:none"></div>
  <form class="row" id="upload-form">
    <input type="text" id="upload-slug" placeholder="slug" autocomplete="off"
      spellcheck="false" maxlength="63" style="width:160px">
    <span class="filepick">zip: <button type="button"
      id="upload-zip-btn">Choose file</button></span>
    <span class="filepick">or folder: <button type="button"
      id="upload-folder-btn">Choose folder</button></span>
    <span class="file-name" id="upload-pick-name">nothing chosen</span>
    <input type="file" id="upload-zip" accept=".zip,application/zip" hidden>
    <input type="file" id="upload-folder" webkitdirectory multiple hidden>
    <button type="submit" class="primary" id="upload-btn">Deploy</button>
  </form>
  <p class="hint">A selected folder is zipped in the browser (stored, no
    compression) before upload. Lowercase letters, digits, hyphens for the slug.</p>
</section>

<section id="sec-tokens">
  <h2>Deploy tokens</h2>
  <div class="err" id="token-err"></div>
  <table>
    <thead>
      <tr><th>Name</th><th>Created</th><th>Last used</th><th>Status</th><th></th></tr>
    </thead>
    <tbody id="token-body"></tbody>
  </table>
  <p class="hint">Click a name to rename it.</p>
  <form class="row" id="mint-form" style="margin-top:10px">
    <input type="text" id="mint-name" placeholder="token name" autocomplete="off">
    <button type="submit" class="primary">Mint token</button>
  </form>
  <div class="token-reveal" id="token-reveal">
    <p>Copy this token now &mdash; it is shown only once.</p>
    <span class="tok" id="token-plain"></span>
    <button type="button" id="token-copy">Copy</button>
    <button type="button" id="token-dismiss">Dismiss</button>
  </div>
</section>

<section id="sec-pairs">
  <h2>Pairing requests</h2>
  <div class="err" id="pair-err"></div>
  <div id="pair-list"></div>
  <p class="hint">Approve only if the <strong>code</strong> matches what the
    requesting machine printed &mdash; hostnames are self-reported.</p>
</section>

<script>
(function () {
  "use strict";

  // ---------- helpers ----------

  function $(id) { return document.getElementById(id); }

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (k === "text") n.textContent = attrs[k];
        else if (k === "onclick") n.addEventListener("click", attrs[k]);
        else n.setAttribute(k, attrs[k]);
      }
    }
    if (children) {
      for (var i = 0; i < children.length; i++) n.appendChild(children[i]);
    }
    return n;
  }

  function showErr(box, msg) {
    box.textContent = msg;
    box.classList.add("show");
  }
  function clearErr(box) {
    box.textContent = "";
    box.classList.remove("show");
  }

  function api(method, path, opts) {
    // X-ProtoLab is the CSRF guard: the Worker rejects mutations without it.
    var init = { method: method, headers: { "X-ProtoLab": "1" } };
    if (opts && opts.json !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(opts.json);
    } else if (opts && opts.form) {
      init.body = opts.form;
    }
    return fetch(path, init).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (data) {
        if (!res.ok) {
          var msg = data && data.error ? data.error : "HTTP " + res.status;
          throw new Error(msg);
        }
        return data;
      });
    });
  }

  function fmtBytes(n) {
    if (typeof n !== "number" || !isFinite(n)) return "?";
    if (n < 1024) return n + " B";
    var units = ["KB", "MB", "GB"];
    var i = -1;
    do { n = n / 1024; i++; } while (n >= 1024 && i < units.length - 1);
    return (n >= 10 ? Math.round(n) : n.toFixed(1)) + " " + units[i];
  }

  function fmtDate(s) {
    if (!s) return "never";
    var d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  }

  var SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62})$/;
  var RESERVED = { settings: 1, api: 1, "favicon.ico": 1, "robots.txt": 1 };

  // ---------- prototypes ----------

  var protoErr = $("proto-err");
  var protoBody = $("proto-body");

  function loadPrototypes() {
    return api("GET", "/settings/api/prototypes").then(function (data) {
      clearErr(protoErr);
      var list = (data && data.prototypes) || [];
      list.sort(function (a, b) {
        return String(b.updated_at || "").localeCompare(String(a.updated_at || ""));
      });
      renderPrototypes(list);
    }).catch(function (e) {
      showErr(protoErr, "Could not load prototypes: " + e.message);
    });
  }

  function renderPrototypes(list) {
    protoBody.textContent = "";
    if (!list.length) {
      protoBody.appendChild(el("tr", null, [
        el("td", { colspan: "7", "class": "empty", text: "No prototypes yet." })
      ]));
      return;
    }
    for (var i = 0; i < list.length; i++) {
      protoBody.appendChild(protoRow(list[i]));
    }
  }

  function protoRow(p) {
    var titleTd = el("td", { "class": "title-cell", title: "Click to edit", text: p.title });
    titleTd.addEventListener("click", function () { editTitle(titleTd, p); });

    var link = el("a", {
      href: "/" + encodeURIComponent(p.slug) + "/",
      target: "_blank",
      rel: "noopener",
      text: "/" + p.slug + "/"
    });

    var badge = p.protected
      ? el("span", { "class": "badge protected", text: "protected" })
      : el("span", { "class": "badge open", text: "open" });

    var upBtn = el("button", { type: "button", text: "Upload zip", onclick: function () {
      pickZipFile(function (file) { uploadVersion(p.slug, file); });
    }});
    var pwBtn = p.protected
      ? el("button", { type: "button", text: "Remove password", onclick: function () {
          removePassword(p.slug);
        }})
      : el("button", { type: "button", text: "Set password", onclick: function () {
          setPassword(p.slug);
        }});
    var delBtn = el("button", { type: "button", "class": "danger", text: "Delete",
      onclick: function () { deleteProto(p.slug); } });

    return el("tr", null, [
      titleTd,
      el("td", { "class": "mono", text: p.slug }),
      el("td", null, [link]),
      el("td", { "class": "num", text: fmtDate(p.updated_at) }),
      el("td", { "class": "num", text: fmtBytes(p.bytes) + " \\u00b7 " + p.files +
        (p.files === 1 ? " file" : " files") }),
      el("td", null, [badge]),
      el("td", { "class": "actions" }, [upBtn, pwBtn, delBtn])
    ]);
  }

  function editTitle(td, p) {
    if (td.querySelector("input")) return;
    var input = el("input", { type: "text", "class": "title-edit", maxlength: "200" });
    input.value = p.title;
    td.textContent = "";
    td.appendChild(input);
    input.focus();
    input.select();
    var done = false;
    function finish(save) {
      if (done) return;
      done = true;
      var v = input.value.trim();
      if (!save || v === "" || v === p.title) {
        td.textContent = p.title;
        return;
      }
      api("PUT", "/settings/api/prototypes/" + encodeURIComponent(p.slug) + "/title",
        { json: { title: v } }
      ).then(function () {
        clearErr(protoErr);
        p.title = v;
        td.textContent = v;
      }).catch(function (e) {
        td.textContent = p.title;
        showErr(protoErr, "Rename of \\"" + p.slug + "\\" failed: " + e.message);
      });
    }
    input.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") { ev.preventDefault(); finish(true); }
      else if (ev.key === "Escape") finish(false);
    });
    input.addEventListener("blur", function () { finish(true); });
  }

  function pickZipFile(cb) {
    var inp = document.createElement("input");
    inp.type = "file";
    inp.accept = ".zip,application/zip";
    inp.addEventListener("change", function () {
      if (inp.files && inp.files[0]) cb(inp.files[0]);
    });
    inp.click();
  }

  function uploadVersion(slug, file) {
    clearErr(protoErr);
    var fd = new FormData();
    fd.append("file", file, slug + ".zip");
    api("POST", "/settings/api/prototypes/" + encodeURIComponent(slug), { form: fd })
      .then(function () { return loadPrototypes(); })
      .catch(function (e) {
        showErr(protoErr, "Upload to \\"" + slug + "\\" failed: " + e.message);
      });
  }

  function setPassword(slug) {
    var pw = window.prompt("Password for \\"" + slug + "\\" (viewers will need it):");
    if (pw === null) return;
    if (pw === "") {
      showErr(protoErr, "Password for \\"" + slug + "\\" cannot be empty.");
      return;
    }
    clearErr(protoErr);
    api("PUT", "/settings/api/prototypes/" + encodeURIComponent(slug) + "/password",
      { json: { password: pw } }
    ).then(function () { return loadPrototypes(); })
     .catch(function (e) {
       showErr(protoErr, "Setting password on \\"" + slug + "\\" failed: " + e.message);
     });
  }

  function removePassword(slug) {
    if (!window.confirm("Remove the password from \\"" + slug + "\\"? It becomes public.")) return;
    clearErr(protoErr);
    api("DELETE", "/settings/api/prototypes/" + encodeURIComponent(slug) + "/password")
      .then(function () { return loadPrototypes(); })
      .catch(function (e) {
        showErr(protoErr, "Removing password from \\"" + slug + "\\" failed: " + e.message);
      });
  }

  function deleteProto(slug) {
    if (!window.confirm("Delete \\"" + slug + "\\" and all its files? This cannot be undone.")) return;
    clearErr(protoErr);
    api("DELETE", "/settings/api/prototypes/" + encodeURIComponent(slug))
      .then(function () { return loadPrototypes(); })
      .catch(function (e) {
        showErr(protoErr, "Delete of \\"" + slug + "\\" failed: " + e.message);
      });
  }

  // ---------- client-side zip (STORE only, no compression) ----------

  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) {
      c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  // entries: [{ name: string (forward slashes), data: Uint8Array }]
  function buildStoredZip(entries) {
    var enc = new TextEncoder();
    var chunks = [];
    var central = [];
    var offset = 0;
    var now = new Date();
    var dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) |
      (Math.floor(now.getSeconds() / 2));
    var dosDate = ((now.getFullYear() - 1980) << 9) |
      ((now.getMonth() + 1) << 5) | now.getDate();
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var nameBytes = enc.encode(e.name);
      var crc = crc32(e.data);
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);   // local file header signature
      lh.setUint16(4, 20, true);           // version needed
      lh.setUint16(6, 0x0800, true);       // flags: UTF-8 names
      lh.setUint16(8, 0, true);            // method: STORE
      lh.setUint16(10, dosTime, true);
      lh.setUint16(12, dosDate, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, e.data.length, true); // compressed size (== stored)
      lh.setUint32(22, e.data.length, true); // uncompressed size
      lh.setUint16(26, nameBytes.length, true);
      lh.setUint16(28, 0, true);           // extra length
      chunks.push(new Uint8Array(lh.buffer), nameBytes, e.data);
      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true);   // central directory signature
      ch.setUint16(4, 20, true);           // version made by
      ch.setUint16(6, 20, true);           // version needed
      ch.setUint16(8, 0x0800, true);       // flags: UTF-8 names
      ch.setUint16(10, 0, true);           // method: STORE
      ch.setUint16(12, dosTime, true);
      ch.setUint16(14, dosDate, true);
      ch.setUint32(16, crc, true);
      ch.setUint32(20, e.data.length, true);
      ch.setUint32(24, e.data.length, true);
      ch.setUint16(28, nameBytes.length, true);
      // 30..41: extra/comment/disk/attrs all zero
      ch.setUint32(42, offset, true);      // local header offset
      central.push(new Uint8Array(ch.buffer), nameBytes);
      offset += 30 + nameBytes.length + e.data.length;
    }
    var cdSize = 0;
    for (var j = 0; j < central.length; j++) cdSize += central[j].length;
    var eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, 0x06054b50, true);   // end of central directory
    eocd.setUint16(8, entries.length, true);
    eocd.setUint16(10, entries.length, true);
    eocd.setUint32(12, cdSize, true);
    eocd.setUint32(16, offset, true);      // central directory offset
    var parts = chunks.concat(central, [new Uint8Array(eocd.buffer)]);
    return new Blob(parts, { type: "application/zip" });
  }

  function zipFolder(fileList) {
    var files = [];
    for (var i = 0; i < fileList.length; i++) files.push(fileList[i]);
    var work = files.map(function (f) {
      var rel = f.webkitRelativePath || f.name;
      var parts = rel.split("/");
      if (parts.length > 1) parts.shift(); // drop the selected folder's own name
      var name = parts.join("/");
      var base = parts[parts.length - 1];
      if (!name || base === ".DS_Store" || base === "Thumbs.db") return null;
      return f.arrayBuffer().then(function (buf) {
        return { name: name, data: new Uint8Array(buf) };
      });
    }).filter(function (x) { return x !== null; });
    return Promise.all(work).then(function (entries) {
      if (!entries.length) throw new Error("Selected folder has no usable files.");
      return buildStoredZip(entries);
    });
  }

  // ---------- upload section ----------

  var uploadErr = $("upload-err");
  var uploadOk = $("upload-ok");
  var uploadForm = $("upload-form");
  var slugInput = $("upload-slug");
  var zipInput = $("upload-zip");
  var folderInput = $("upload-folder");
  var uploadBtn = $("upload-btn");

  var pickName = $("upload-pick-name");

  function updatePickName() {
    if (zipInput.files.length) {
      pickName.textContent = zipInput.files[0].name;
    } else if (folderInput.files.length) {
      var n = folderInput.files.length;
      pickName.textContent = n + (n === 1 ? " file" : " files") + " from folder";
    } else {
      pickName.textContent = "nothing chosen";
    }
  }

  $("upload-zip-btn").addEventListener("click", function () { zipInput.click(); });
  $("upload-folder-btn").addEventListener("click", function () { folderInput.click(); });

  zipInput.addEventListener("change", function () {
    if (zipInput.files.length) folderInput.value = "";
    updatePickName();
  });
  folderInput.addEventListener("change", function () {
    if (folderInput.files.length) zipInput.value = "";
    updatePickName();
  });

  uploadForm.addEventListener("submit", function (ev) {
    ev.preventDefault();
    clearErr(uploadErr);
    uploadOk.style.display = "none";
    var slug = slugInput.value.trim().toLowerCase();
    if (!SLUG_RE.test(slug) || RESERVED[slug] || slug.charAt(0) === "_") {
      showErr(uploadErr, "Invalid slug: lowercase letters, digits, and hyphens, " +
        "1-63 chars, not a reserved name.");
      return;
    }
    var getBlob;
    if (zipInput.files.length) {
      getBlob = Promise.resolve(zipInput.files[0]);
    } else if (folderInput.files.length) {
      getBlob = zipFolder(folderInput.files);
    } else {
      showErr(uploadErr, "Choose a zip file or a folder to deploy.");
      return;
    }
    uploadBtn.disabled = true;
    uploadBtn.textContent = "Deploying\\u2026";
    getBlob.then(function (blob) {
      var fd = new FormData();
      fd.append("file", blob, slug + ".zip");
      return api("POST", "/settings/api/prototypes/" + encodeURIComponent(slug),
        { form: fd });
    }).then(function (r) {
      uploadOk.textContent = "";
      uploadOk.appendChild(document.createTextNode("Deployed " + slug + " (" +
        r.files + (r.files === 1 ? " file, " : " files, ") +
        fmtBytes(r.bytes) + ") \\u2014 "));
      var href = r.url || ("/" + slug + "/");
      uploadOk.appendChild(el("a", { href: href, target: "_blank",
        rel: "noopener", text: href }));
      uploadOk.style.display = "block";
      slugInput.value = "";
      zipInput.value = "";
      folderInput.value = "";
      updatePickName();
      return loadPrototypes();
    }).catch(function (e) {
      showErr(uploadErr, "Deploy failed: " + e.message);
    }).then(function () {
      uploadBtn.disabled = false;
      uploadBtn.textContent = "Deploy";
    });
  });

  // ---------- theme ----------

  var rootEl = document.documentElement;
  $("theme-toggle").addEventListener("click", function () {
    var next = rootEl.getAttribute("data-theme") === "dark" ? "light" : "dark";
    rootEl.setAttribute("data-theme", next);
    rootEl.setAttribute("data-theme-source", "stored");
    try {
      localStorage.setItem("protolab-theme",
        JSON.stringify({ mode: next, ts: Date.now() }));
    } catch (e) {}
  });
  var themeMq = window.matchMedia("(prefers-color-scheme: dark)");
  if (themeMq.addEventListener) {
    themeMq.addEventListener("change", function (ev) {
      if (rootEl.getAttribute("data-theme-source") !== "stored") {
        rootEl.setAttribute("data-theme", ev.matches ? "dark" : "light");
      }
    });
  }

  // ---------- tokens ----------

  var tokenErr = $("token-err");
  var tokenBody = $("token-body");
  var mintForm = $("mint-form");
  var mintName = $("mint-name");
  var tokenReveal = $("token-reveal");
  var tokenPlain = $("token-plain");

  function loadTokens() {
    return api("GET", "/settings/api/tokens").then(function (data) {
      clearErr(tokenErr);
      renderTokens((data && data.tokens) || []);
    }).catch(function (e) {
      showErr(tokenErr, "Could not load tokens: " + e.message);
    });
  }

  function renderTokens(list) {
    tokenBody.textContent = "";
    if (!list.length) {
      tokenBody.appendChild(el("tr", null, [
        el("td", { colspan: "5", "class": "empty", text: "No tokens yet." })
      ]));
      return;
    }
    for (var i = 0; i < list.length; i++) {
      tokenBody.appendChild(tokenRow(list[i]));
    }
  }

  function tokenRow(t) {
    var revoked = !!t.revoked_at;
    var status = revoked
      ? el("span", { "class": "badge revoked", text: "revoked" })
      : el("span", { "class": "badge active", text: "active" });
    var actions = el("td", { "class": "actions" });
    if (!revoked) {
      actions.appendChild(el("button", { type: "button", "class": "danger",
        text: "Revoke", onclick: function () { revokeToken(t); } }));
    }
    var nameTd = el("td", { "class": "title-cell", title: "Click to edit", text: t.name });
    nameTd.addEventListener("click", function () { editTokenName(nameTd, t); });
    return el("tr", null, [
      nameTd,
      el("td", { "class": "num", text: fmtDate(t.created_at) }),
      el("td", { "class": "num", text: fmtDate(t.last_used_at) }),
      el("td", null, [status]),
      actions
    ]);
  }

  function editTokenName(td, t) {
    if (td.querySelector("input")) return;
    var input = el("input", { type: "text", "class": "title-edit", maxlength: "128" });
    input.value = t.name;
    td.textContent = "";
    td.appendChild(input);
    input.focus();
    input.select();
    var done = false;
    function finish(save) {
      if (done) return;
      done = true;
      var v = input.value.trim();
      if (!save || v === "" || v === t.name) {
        td.textContent = t.name;
        return;
      }
      api("PUT", "/settings/api/tokens/" + encodeURIComponent(String(t.id)) + "/name",
        { json: { name: v } }
      ).then(function () {
        clearErr(tokenErr);
        t.name = v;
        td.textContent = v;
      }).catch(function (e) {
        td.textContent = t.name;
        showErr(tokenErr, "Rename failed: " + e.message);
      });
    }
    input.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") { ev.preventDefault(); finish(true); }
      else if (ev.key === "Escape") finish(false);
    });
    input.addEventListener("blur", function () { finish(true); });
  }

  function revokeToken(t) {
    if (!window.confirm("Revoke token \\"" + t.name + "\\"? Deploys using it will fail.")) return;
    clearErr(tokenErr);
    api("DELETE", "/settings/api/tokens/" + encodeURIComponent(String(t.id)))
      .then(function () { return loadTokens(); })
      .catch(function (e) {
        showErr(tokenErr, "Revoke failed: " + e.message);
      });
  }

  mintForm.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var name = mintName.value.trim();
    if (!name) {
      showErr(tokenErr, "Token name is required.");
      return;
    }
    clearErr(tokenErr);
    api("POST", "/settings/api/tokens", { json: { name: name } })
      .then(function (r) {
        mintName.value = "";
        tokenPlain.textContent = r.token;
        tokenReveal.classList.add("show");
        return loadTokens();
      })
      .catch(function (e) {
        showErr(tokenErr, "Mint failed: " + e.message);
      });
  });

  $("token-copy").addEventListener("click", function () {
    var text = tokenPlain.textContent;
    var btn = $("token-copy");
    function flash(msg) {
      btn.textContent = msg;
      setTimeout(function () { btn.textContent = "Copy"; }, 1500);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { flash("Copied"); },
        function () { flash("Select manually"); }
      );
    } else {
      var range = document.createRange();
      range.selectNodeContents(tokenPlain);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      flash("Selected");
    }
  });

  $("token-dismiss").addEventListener("click", function () {
    tokenPlain.textContent = "";
    tokenReveal.classList.remove("show");
  });

  // ---------- pairings ----------

  var pairErr = $("pair-err");
  var pairList = $("pair-list");

  function loadPairings() {
    return api("GET", "/settings/api/pairings").then(function (data) {
      clearErr(pairErr);
      renderPairings((data && data.pairings) || []);
    }).catch(function (e) {
      showErr(pairErr, "Could not load pairing requests: " + e.message);
    });
  }

  function renderPairings(list) {
    pairList.textContent = "";
    if (!list.length) {
      pairList.appendChild(el("div", { "class": "empty",
        text: "No pending requests." }));
      return;
    }
    for (var i = 0; i < list.length; i++) {
      pairList.appendChild(pairCard(list[i]));
    }
    tickCountdowns();
  }

  function pairCard(p) {
    var meta = el("div", { "class": "meta" });
    meta.appendChild(document.createTextNode("from "));
    meta.appendChild(el("strong", { text: p.requester }));
    meta.appendChild(document.createTextNode(" \\u00b7 requested " +
      fmtDate(p.created_at) + " \\u00b7 expires in "));
    meta.appendChild(el("span", { "class": "cd", "data-exp": p.expires_at,
      text: "\\u2026" }));
    var approve = el("button", { type: "button", "class": "primary",
      text: "Approve", onclick: function () { actPairing(p.code, "approve"); } });
    var deny = el("button", { type: "button", "class": "danger", text: "Deny",
      onclick: function () { actPairing(p.code, "deny"); } });
    return el("div", { "class": "pair" }, [
      el("span", { "class": "code", text: p.code }),
      meta, approve, deny
    ]);
  }

  function actPairing(code, verb) {
    clearErr(pairErr);
    api("POST", "/settings/api/pairings/" + encodeURIComponent(code) + "/" + verb)
      .then(function () {
        return Promise.all([loadPairings(), loadTokens()]);
      })
      .catch(function (e) {
        showErr(pairErr, "Could not " + verb + " " + code + ": " + e.message);
        loadPairings();
      });
  }

  function tickCountdowns() {
    var spans = pairList.querySelectorAll("[data-exp]");
    var now = Date.now();
    for (var i = 0; i < spans.length; i++) {
      var exp = new Date(spans[i].getAttribute("data-exp")).getTime();
      var s = Math.floor((exp - now) / 1000);
      if (isNaN(exp)) { spans[i].textContent = "?"; continue; }
      if (s <= 0) { spans[i].textContent = "expired"; continue; }
      var m = Math.floor(s / 60);
      var r = s % 60;
      spans[i].textContent = m + ":" + (r < 10 ? "0" : "") + r;
    }
  }

  // ---------- init ----------

  loadPrototypes();
  loadTokens();
  loadPairings();
  setInterval(loadPairings, 5000);
  setInterval(tickCountdowns, 1000);
})();
</script>
</body>
</html>`;
  return new Response(page, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
