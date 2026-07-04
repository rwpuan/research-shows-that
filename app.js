/* Research shows that… — daily research reader (no build step, no deps) */
(function () {
  "use strict";

  /* ---------- Theme ---------- */
  var root = document.documentElement;
  var stored = null;
  try { stored = localStorage.getItem("theme"); } catch (e) {}
  var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  root.setAttribute("data-theme", stored || (prefersDark ? "dark" : "light"));

  var toggle = document.getElementById("theme-toggle");
  toggle.addEventListener("click", function () {
    var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("theme", next); } catch (e) {}
  });

  /* ---------- Toast ---------- */
  var toastEl = document.getElementById("toast");
  var toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    // force reflow so the transition runs
    void toastEl.offsetWidth;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove("show");
      setTimeout(function () { toastEl.hidden = true; }, 220);
    }, 2200);
  }

  /* ---------- Tiny Markdown renderer (headings, bold, lists, links, paragraphs) ---------- */
  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function inline(s) {
    s = esc(s);
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return s;
  }
  function renderMarkdown(md) {
    var lines = String(md || "").replace(/\r\n/g, "\n").split("\n");
    var html = "";
    var listOpen = false;
    function closeList() { if (listOpen) { html += "</ul>"; listOpen = false; } }
    var para = [];
    function flushPara() {
      if (para.length) { html += "<p>" + inline(para.join(" ")) + "</p>"; para = []; }
    }
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) { flushPara(); closeList(); continue; }
      var h = line.match(/^(#{1,3})\s+(.*)$/);
      if (h) { flushPara(); closeList(); html += "<h2>" + inline(h[2]) + "</h2>"; continue; }
      if (/^[-*]\s+/.test(line)) {
        flushPara();
        if (!listOpen) { html += "<ul>"; listOpen = true; }
        html += "<li>" + inline(line.replace(/^[-*]\s+/, "")) + "</li>";
        continue;
      }
      para.push(line);
    }
    flushPara(); closeList();
    return html;
  }

  /* ---------- Date helpers ---------- */
  function todayStr() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  /* ---------- Rendering ---------- */
  var article = document.getElementById("article");

  function fmtDate(iso) {
    var parts = String(iso).split("-");
    if (parts.length !== 3) return iso;
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  }

  function authorLine(authors) {
    if (!authors || !authors.length) return "";
    if (authors.length <= 4) return authors.join(", ");
    return authors.slice(0, 4).join(", ") + " et al.";
  }

  function render(entry) {
    var p = entry.paper || {};
    var facts = [];
    if (p.journal) facts.push('<span class="chip">' + esc(p.journal) + "</span>");
    if (p.year) facts.push('<span class="chip">' + esc(String(p.year)) + "</span>");
    if (typeof p.cited_by_count === "number")
      facts.push('<span class="chip">' + p.cited_by_count + " citations</span>");
    if (p.is_open_access) facts.push('<span class="chip oa">Open access</span>');

    var actions = [];
    if (p.doi) actions.push('<a class="btn btn-primary" href="' + esc(p.doi) + '" target="_blank" rel="noopener">Read the paper (DOI)</a>');
    if (p.landing_url && p.landing_url !== p.doi)
      actions.push('<a class="btn" href="' + esc(p.landing_url) + '" target="_blank" rel="noopener">Publisher page</a>');
    if (p.openalex_id)
      actions.push('<a class="btn" href="' + esc(p.openalex_id) + '" target="_blank" rel="noopener">OpenAlex record</a>');
    actions.push('<button class="btn" id="share-btn" type="button">Share</button>');

    var read = entry.read_minutes ? entry.read_minutes + " min read" : "";
    var eyebrow = [entry.topic ? esc(entry.topic) : "", fmtDate(entry.date), read]
      .filter(Boolean).join('<span class="dot">·</span>');

    article.innerHTML =
      '<p class="eyebrow">' + eyebrow + "</p>" +
      '<h1 class="headline">' + esc(entry.headline) + "</h1>" +
      (entry.dek ? '<p class="dek">' + esc(entry.dek) + "</p>" : "") +
      '<div class="body">' + renderMarkdown(entry.summary_md) + "</div>" +
      '<section class="source-card">' +
        "<h3>The source</h3>" +
        '<p class="source-title">' + esc(p.title || entry.headline) + "</p>" +
        (authorLine(p.authors) ? '<p class="source-authors">' + esc(authorLine(p.authors)) + "</p>" : "") +
        '<div class="source-facts">' + facts.join("") + "</div>" +
        '<div class="source-actions">' + actions.join("") + "</div>" +
      "</section>";
    article.setAttribute("aria-busy", "false");

    var shareBtn = document.getElementById("share-btn");
    shareBtn.addEventListener("click", function () { share(entry); });
  }

  function share(entry) {
    var url = location.href.split("#")[0];
    var text = entry.headline;
    if (navigator.share) {
      navigator.share({ title: "Research shows that…", text: text, url: url }).catch(function () {});
      return;
    }
    var payload = text + "\n" + url;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(payload).then(
        function () { toast("Link copied to clipboard"); },
        function () { toast("Copy failed — " + url); }
      );
    } else {
      toast(url);
    }
  }

  function showError(msg) {
    article.innerHTML = '<p class="error">' + esc(msg) + "</p>";
    article.setAttribute("aria-busy", "false");
  }

  /* ---------- Boot ---------- */
  function pickEntry(manifest) {
    // manifest: array of {date, slug} newest-first. Prefer today, else newest <= today.
    var today = todayStr();
    var exact = null, fallback = null;
    for (var i = 0; i < manifest.length; i++) {
      var e = manifest[i];
      if (e.date === today) { exact = e; break; }
      if (!fallback && e.date <= today) fallback = e;
    }
    return exact || fallback || manifest[0] || null;
  }

  fetch("content/index.json", { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
    .then(function (manifest) {
      if (!Array.isArray(manifest) || !manifest.length) throw new Error("empty");
      manifest.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
      var chosen = pickEntry(manifest);
      if (!chosen) throw new Error("none");
      var slug = chosen.slug || chosen.date;
      return fetch("content/" + slug + ".json", { cache: "no-cache" })
        .then(function (r) { if (!r.ok) throw new Error(); return r.json(); });
    })
    .then(render)
    .catch(function () {
      showError("No research to show yet. Once the daily generator publishes an entry, it will appear here.");
    });
})();
