// Proxy serverless Vercel : recupere un PDF (CORS) ou genere le Markdown d'un Journal officiel via l'API PISTE.
// Mode special : jo:YYYY-MM-DD -> sommaire + textes du JO via API legifrance (PISTE).

module.exports = async function (req, res) {
  var url = req.query && req.query.url ? String(req.query.url) : "";
  url = url.trim();
  if (!url) { res.status(400).json({ error: "Parametre url manquant." }); return; }

  // ---------- Mode JO (API PISTE) ----------
  // accepte jo:date, JO:date, "jo : date", espaces multiples, etc.
  var joMatch = url.match(/^jo\s*:\s*(\d{4}-\d{2}-\d{2})\s*$/i);
  if (/^jo\s*:/i.test(url)) {
    try {
      var date = joMatch ? joMatch[1] : url.replace(/^jo\s*:\s*/i, "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.status(400).json({ error: "Format attendu : jo:YYYY-MM-DD (ex. jo:2026-10-04). Recu : [" + url + "]" });
        return;
      }
      var md = await joToMarkdown(date);
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.status(200).json({ markdown: md });
    } catch (e) {
      res.status(500).json({ error: "Erreur mode jo: " + ((e && e.message) ? e.message : String(e)) });
    }
    return;
  }

  // ---------- Mode proxy PDF classique ----------
  if (!/^https?:\/\//i.test(url)) { res.status(400).json({ error: "URL invalide. Recu : [" + url.slice(0, 100) + "]" }); return; }
  try {
    var r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept": "application/pdf,application/octet-stream,*/*",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
        "Referer": url
      },
      redirect: "follow"
    });
    if (!r.ok) { res.status(502).json({ error: "HTTP " + r.status + " pour " + url }); return; }
    var buf = Buffer.from(await r.arrayBuffer());
    var head = buf.slice(0, 1024).toString("latin1");
    if (head.indexOf("%PDF-") === -1) {
      res.status(502).json({ error: "Reponse non-PDF (" + buf.length + " octets) pour " + url });
      return;
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).send(buf);
  } catch (e) {
    res.status(502).json({ error: "Echec recuperation : " + ((e && e.message) ? e.message : String(e)) });
  }
};

// ================= API PISTE (legifrance) =================

var PISTE_TOKEN_URL = "https://oauth.piste.gouv.fr/api/oauth/token";
var LF_BASE = "https://api.piste.gouv.fr/dila/legifrance/lf-engine-app";

async function getPisteToken() {
  var id = process.env.PISTE_CLIENT_ID;
  var secret = process.env.PISTE_CLIENT_SECRET;
  if (!id || !secret) throw new Error("PISTE_CLIENT_ID / PISTE_CLIENT_SECRET manquants dans les variables Vercel.");
  var baseBody = "grant_type=client_credentials&scope=openid";
  var attempts = [
    { label: "Basic auth", headers: { "Content-Type": "application/x-www-form-urlencoded", "Authorization": "Basic " + Buffer.from(id + ":" + secret).toString("base64") }, body: baseBody },
    { label: "body params", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: baseBody + "&client_id=" + encodeURIComponent(id) + "&client_secret=" + encodeURIComponent(secret) }
  ];
  var errs = [];
  for (var a = 0; a < attempts.length; a++) {
    var r = await fetch(PISTE_TOKEN_URL, { method: "POST", headers: attempts[a].headers, body: attempts[a].body });
    var t = await r.text();
    var j;
    try { j = JSON.parse(t); } catch (e) { errs.push(attempts[a].label + " : reponse non-JSON (HTTP " + r.status + ") : " + t.slice(0, 200)); continue; }
    if (r.ok && j.access_token) return j.access_token;
    errs.push(attempts[a].label + " : HTTP " + r.status + " : " + String(j.error_description || j.error || t).slice(0, 200));
  }
  throw new Error("Token PISTE refuse. " + errs.join(" | "));
}

async function lfPost(token, path, payload) {
  var r = await fetch(LF_BASE + path, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + token,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(payload)
  });
  var txt = await r.text();
  var j;
  try { j = JSON.parse(txt); } catch (e) {
    return { status: r.status, parseError: true, raw: txt.slice(0, 500) };
  }
  return { status: r.status, json: j };
}

function mdEscape(s) { return String(s || "").replace(/[\r\n]+/g, " ").trim(); }

async function joToMarkdown(date) {
  var token = await getPisteToken();

  // 1) Sommaire de l'edition du JO
  var sommaire = null, sommaireErr = [];
  var sommaireBodies = [{ date: date }, { datePublication: date }];
  for (var b = 0; b < sommaireBodies.length; b++) {
    var rs = await lfPost(token, "/consult/jorf/jo", sommaireBodies[b]);
    if (rs.status === 200 && rs.json && !rs.parseError) { sommaire = rs.json; break; }
    sommaireErr.push("body " + JSON.stringify(sommaireBodies[b]) + " -> HTTP " + rs.status + " : " + (rs.raw || JSON.stringify(rs.json)).slice(0, 300));
  }
  if (!sommaire) throw new Error("Sommaire JO introuvable pour " + date + ". Reponses API : " + sommaireErr.join(" || "));

  // 2) Conversion du sommaire en Markdown
  var lines = [];
  lines.push("# Journal officiel du " + date);
  lines.push("");
  var contenus = [];
  function walk(node, depth) {
    if (!node || typeof node !== "object") return;
    var titre = mdEscape(node.titre || node.intitule || node.libelle || node.texte || "");
    if (titre) {
      var lvl = Math.min(depth + 1, 6);
      var hash = "";
      for (var h = 0; h < lvl; h++) hash += "#";
      lines.push(hash + " " + titre);
      var meta = [];
      if (node.id || node.cidTexte) meta.push("id : " + (node.id || node.cidTexte));
      if (node.nor) meta.push("NOR : " + node.nor);
      if (node.nature) meta.push(node.nature);
      if (meta.length) { lines.push(""); lines.push("_" + meta.join(" · ") + "_"); }
      if (node.id || node.cidTexte) {
        var lid = node.id || node.cidTexte;
        lines.push("");
        lines.push("[Voir sur Legifrance](https://www.legifrance.gouv.fr/jorf/id/" + lid + ")");
        if (contenus.length < 50) contenus.push(lid);
      }
      lines.push("");
    }
    var kids = node.contenu || node.children || node.items || node.resultats || [];
    if (Array.isArray(kids)) kids.forEach(function (k) { walk(k, depth + 1); });
    else if (typeof kids === "object") Object.keys(kids).forEach(function (k) { walk(kids[k], depth + 1); });
  }
  var root = sommaire.result || sommaire.results || sommaire.sommaire || sommaire;
  if (Array.isArray(root)) root.forEach(function (n) { walk(n, 0); });
  else walk(root, 0);

  // 3) Tentative de recuperation des textes complets (endpoints candidats)
  var textePaths = [
    "/consult/jorf/jo/contenu",
    "/consult/jorf/jo/textes",
    "/consult/getJORFTexte"
  ];
  var fullTexts = [];
  for (var t = 0; t < textePaths.length && fullTexts.length === 0; t++) {
    for (var c = 0; c < Math.min(contenus.length, 50); c++) {
      try {
        var rt = await lfPost(token, textePaths[t], { id: contenus[c], texteId: contenus[c], cidTexte: contenus[c], date: date });
        if (rt.status === 200 && rt.json && !rt.parseError) {
          var tx = extractText(rt.json);
          if (tx && tx.length > 100) fullTexts.push(tx);
        }
      } catch (e) { /* on continue */ }
    }
  }

  var out = lines.join("\n");
  if (fullTexts.length) {
    out += "\n\n---\n\n" + fullTexts.join("\n\n---\n\n");
  } else {
    out += "\n\n_(Sommaire uniquement : les textes complets n'ont pas pu etre recuperes via les endpoints connus.)_";
  }
  return out;
}

function extractText(j) {
  var chunks = [];
  function rec(x) {
    if (!x) return;
    if (typeof x === "string") { if (x.trim().length > 2) chunks.push(x.trim()); return; }
    if (Array.isArray(x)) { x.forEach(rec); return; }
    if (typeof x === "object") {
      var prefer = ["contenu", "texte", "article", "articles", "sections", "str"];
      Object.keys(x).forEach(function (k) {
        if (typeof x[k] === "string" && prefer.indexOf(k) !== -1) rec(x[k]);
        else if (typeof x[k] === "object") rec(x[k]);
      });
    }
  }
  rec(j);
  return chunks.join("\n\n");
}
