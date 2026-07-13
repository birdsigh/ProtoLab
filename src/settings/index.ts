// Management UI, served at /settings (behind Access; JWT re-verified by
// the router). Single inline page, no build step, no external deps.
// Talks to /settings/api/* same-origin.
//
// NOTE: the page's own JavaScript deliberately avoids template literals
// (backticks / ${}) because it lives inside this TS template string.

export function settingsPage(): Response {
  const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ProtoLab &mdash; Settings</title>
<style>
:root {
  color-scheme: light dark;
  --bg: #ffffff;
  --fg: #1a1a1a;
  --muted: #6b7280;
  --border: #d9dce1;
  --card: #f4f5f7;
  --accent: #2563eb;
  --danger: #b91c1c;
  --ok: #15803d;
  --warn: #b45309;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #131417;
    --fg: #e7e7ea;
    --muted: #9ba1ab;
    --border: #34363c;
    --card: #1d1f24;
    --accent: #7aa7f7;
    --danger: #f2938c;
    --ok: #6fce8f;
    --warn: #e0a75e;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0 auto;
  padding: 24px 20px 64px;
  max-width: 900px;
  background: var(--bg);
  color: var(--fg);
  font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    Helvetica, Arial, sans-serif;
}
h1 { font-size: 20px; margin: 0 0 4px; }
h1 + p { margin: 0 0 28px; color: var(--muted); }
section { margin-bottom: 36px; }
h2 {
  font-size: 15px;
  margin: 0 0 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
}
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th {
  text-align: left;
  font-weight: 600;
  color: var(--muted);
  padding: 4px 8px;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}
td {
  padding: 6px 8px;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}
td.num { white-space: nowrap; color: var(--muted); }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
code, .mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
}
button {
  font: inherit;
  font-size: 12px;
  padding: 3px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--card);
  color: var(--fg);
  cursor: pointer;
}
button:hover { border-color: var(--accent); }
button:disabled { opacity: 0.5; cursor: default; }
button.danger { color: var(--danger); }
button.danger:hover { border-color: var(--danger); }
button.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
@media (prefers-color-scheme: dark) { button.primary { color: #10131a; } }
.actions { white-space: nowrap; }
.actions button { margin-right: 4px; }
.badge {
  display: inline-block;
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
  color: var(--muted);
}
.badge.protected { color: var(--warn); border-color: var(--warn); }
.badge.open { color: var(--ok); border-color: var(--ok); }
.badge.revoked { color: var(--danger); border-color: var(--danger); }
.badge.active { color: var(--ok); border-color: var(--ok); }
.err {
  display: none;
  margin: 8px 0;
  padding: 7px 10px;
  border: 1px solid var(--danger);
  border-radius: 6px;
  color: var(--danger);
  font-size: 13px;
}
.err.show { display: block; }
.note {
  margin: 8px 0;
  padding: 7px 10px;
  border: 1px solid var(--ok);
  border-radius: 6px;
  color: var(--ok);
  font-size: 13px;
}
.empty { color: var(--muted); font-style: italic; padding: 10px 8px; }
form.row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
input[type="text"], input[type="password"] {
  font: inherit;
  font-size: 13px;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--fg);
}
input.title-edit { width: 100%; font-size: 13px; padding: 2px 6px; }
input[type="file"] { font-size: 12px; max-width: 240px; }
.filepick { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; }
td.title-cell { cursor: text; max-width: 220px; overflow: hidden; text-overflow: ellipsis; }
td.title-cell:hover { text-decoration: underline dotted; }
.token-reveal {
  display: none;
  margin-top: 10px;
  padding: 10px 12px;
  background: var(--card);
  border: 1px solid var(--warn);
  border-radius: 8px;
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
  padding: 10px 12px;
  margin-bottom: 8px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 8px;
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
<h1>ProtoLab settings</h1>
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
    <span class="filepick">zip: <input type="file" id="upload-zip"
      accept=".zip,application/zip"></span>
    <span class="filepick">or folder: <input type="file" id="upload-folder"
      webkitdirectory multiple></span>
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

  var SLUG_RE = /^[a-z0-9-]{1,63}$/;
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

  zipInput.addEventListener("change", function () {
    if (zipInput.files.length) folderInput.value = "";
  });
  folderInput.addEventListener("change", function () {
    if (folderInput.files.length) zipInput.value = "";
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
      return loadPrototypes();
    }).catch(function (e) {
      showErr(uploadErr, "Deploy failed: " + e.message);
    }).then(function () {
      uploadBtn.disabled = false;
      uploadBtn.textContent = "Deploy";
    });
  });

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
    return el("tr", null, [
      el("td", { text: t.name }),
      el("td", { "class": "num", text: fmtDate(t.created_at) }),
      el("td", { "class": "num", text: fmtDate(t.last_used_at) }),
      el("td", null, [status]),
      actions
    ]);
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
