// Proxy serverless Vercel :
//  1) /api/fetch-pdf?url=https://...   → téléchargement PDF classique
//  2) /api/fetch-pdf?url=jo:2026-10-04 → sommaire du JO via l'API officielle Légifrance (PISTE)
//     Retourne { markdown: "..." } en JSON.

const LEGIFRANCE_API_BASE = process.env.LEGIFRANCE_API_BASE || "https://api.piste.gouv.fr/dila/legifrance/lf-engine-app";
const PISTE_TOKEN_URL = process.env.PISTE_TOKEN_URL || "https://oauth.piste.gouv.fr/api/oauth/token";
const PISTE_SCOPE = process.env.PISTE_SCOPE || "openid";
const FULL_TEXT_LIMIT = 50; // limite anti-quota : nombre max de textes complets récupérés

const isPrivateHost = (h) =>
  /^(localhost|127\.|0\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.)/i.test(h);

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  "Accept": "application/pdf,application/octet-stream,*/*",
  "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8"
};

const isPdf = (buf) =>
  buf.length > 200 && buf.subarray(0, 2048).indexOf(Buffer.from("%PDF-")) !== -1;

// ---------- OAuth PISTE ----------
async function getPisteToken() {
  const id = process.env.PISTE_CLIENT_ID;
  const secret = process.env.PISTE_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error("PISTE non configuré : ajoute PISTE_CLIENT_ID et PISTE_CLIENT_SECRET dans les variables d'environnement Vercel.");
  }
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: id,
    client_secret: secret,
    scope: PISTE_SCOPE
  });
  const res = await fetch(PISTE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });
  if (!res.ok) {
    const txt = (await res.text()).slice(0, 300);
    throw new Error("Token PISTE refusé (HTTP " + res.status + ") : " + txt);
  }
  const j = await res.json();
  if (!j.access_token) throw new Error("Réponse PISTE sans access_token : " + JSON.stringify(j).slice(0, 300));
  return j.access_token;
}

async function pisteCall(token, path, bodyObj) {
  const res = await fetch(LEGIFRANCE_API_BASE + path, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + token,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(bodyObj || {})
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(path + " → HTTP " + res.status + " : " + txt.slice(0, 200));
  try { return JSON.parse(txt); } catch { throw new Error(path + " → réponse non-JSON : " + txt.slice(0, 150)); }
}

// ---------- Sommaire JO → Markdown ----------
function joNodeToMd(node, depth, lines, items) {
  if (Array.isArray(node)) { node.forEach(n => joNodeToMd(n, depth, lines, items)); return; }
  if (!node || typeof node !== "object") return;
  const titre = node.titre || node.titreMarkUp || null;
  const hasId = typeof node.id === "string" && node.id.length > 3;
  if (hasId && titre) {
    let entry = "- [" + String(titre).replace(/\s+/g, " ").trim() + "](https://www.legifrance.gouv.fr/jorf/id/" + node.id + ")";
    const meta = [];
    if (node.nature) meta.push(node.nature);
    if (node.nor) meta.push("NOR : " + node.nor);
    if (node.numero) meta.push("n° " + node.numero);
    if (meta.length) entry += " — _" + meta.join(" · ") + "_";
    lines.push(entry);
    items.push(node.id);
  } else if (titre && depth <= 3) {
    lines.push("");
    lines.push("#".repeat(Math.min(depth + 1, 6)) + " " + String(titre).replace(/\s+/g, " ").trim());
    lines.push("");
  }
  for (const [k, v] of Object.entries(node)) {
    if (k === "titre" || k === "titreMarkUp" || k === "id") continue;
    if (Array.isArray(v)) joNodeToMd(v, hasId ? depth : depth + 1, lines, items);
    else if (v && typeof v === "object" && ["sections", "items", "sommaire", "context", "enfants"].includes(k)) {
      joNodeToMd(v, depth + 1, lines, items);
    }
  }
}

// Extraction générique de texte complet depuis un texte JORF (contenus d'articles)
function extractFullText(node, lines, depth) {
  if (Array.isArray(node)) { node.forEach(n => extractFullText(n, lines, depth)); return; }
  if (!node || typeof node !== "object") return;
  if (typeof node.contenu === "string" && node.contenu.trim()) {
    lines.push(node.contenu.trim());
    lines.push("");
  }
  if (typeof node.texte === "string" && node.texte.trim()) {
    lines.push(node.texte.trim());
    lines.push("");
  }
  for (const [k, v] of Object.entries(node)) {
    if (k === "contenu" || k === "texte") continue;
    if (Array.isArray(v)) extractFullText(v, lines, depth + 1);
    else if (v && typeof v === "object") extractFullText(v, lines, depth + 1);
  }
}

async function fetchJoMarkdown(date) {
  const token = await getPisteToken();
  const errors = [];

  // 1) Sommaire de l'édition : POST /consult/jorf/jo  {date}
  let sommaire = null;
  const sommaireAttempts = [
    { path: "/consult/jorf/jo", body: { date: date } },
    { path: "/consult/jorf/jo", body: { datePublication: date } }
  ];
  for (const a of sommaireAttempts) {
    try {
      const j = await pisteCall(token, a.path, a.body);
      if (j && (j.sommaire || j.sections || Array.isArray(j))) { sommaire = j; break; }
      errors.push(a.path + " : structure inattendue " + JSON.stringify(j).slice(0, 120));
    } catch (e) { errors.push(e.message); }
  }
  if (!sommaire) throw new Error("Sommaire JO introuvable via PISTE. Détails : " + errors.join(" | "));

  // 2) Conversion en Markdown
  const lines = ["# Journal officiel du " + date, ""];
  const items = [];
  joNodeToMd(sommaire, 1, lines, items);
  const mdSommaire = lines.join("\n");
  let md = mdSommaire;
  let fullTextFetched = 0;

  // 3) Textes complets (limités) : candidates d'endpoint "contenu texte fonds JORF"
  if (items.length) {
    const textPaths = ["/consult/jorf/jo/contenu", "/consult/jorf/jo/textes", "/consult/getJORFTexte"];
    const fullParts = [];
    for (const id of items.slice(0, FULL_TEXT_LIMIT)) {
      let got = null;
      for (const p of textPaths) {
        try {
          const j = await pisteCall(token, p, { id: id });
          got = j; break;
        } catch (e) { /* essai suivant */ }
      }
      if (got) {
        const tl = [];
        extractFullText(got, tl, 1);
        if (tl.length) { fullParts.push(tl.join("\n")); fullTextFetched++; }
      }
    }
    if (fullParts.length) {
      md = mdSommaire + "\n\n---\n\n" + fullParts.join("\n\n---\n\n");
    }
  }

  md = "> Source : API officielle Légifrance (PISTE). " + items.length + " texte(s) au sommaire"
    + (fullTextFetched ? ", " + fullTextFetched + " texte(s) complet(s) inclus" : "") + ".\n\n" + md;
  return md;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.status(204).end();

  const url = req.query.url;
  if (!url) return res.status(400).json({ error: "Paramètre url manquant" });

  // ---- Mode PISTE : jo:YYYY-MM-DD ----
  const joMatch = /^jo:(\d{4}-\d{2}-\d{2})$/.exec(url);
  if (joMatch) {
    try {
      const md = await fetchJoMarkdown(joMatch[1]);
      return res.status(200).json({ markdown: md });
    } catch (e) {
      return res.status(502).json({ error: e.message || String(e) });
    }
  }

  // ---- Mode proxy PDF classique ----
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: "Paramètre url invalide" });
  let parsed;
  try { parsed = new URL(url); } catch { return res.status(400).json({ error: "URL illisible" }); }
  if (!["http:", "https:"].includes(parsed.protocol)) return res.status(400).json({ error: "Protocole non autorisé" });
  if (isPrivateHost(parsed.hostname)) return res.status(400).json({ error: "Hôte non autorisé" });

  try {
    const upstream = await fetch(url, {
      redirect: "follow",
      headers: { ...BROWSER_HEADERS, "Referer": parsed.origin + "/" }
    });
    if (!upstream.ok) return res.status(502).json({ error: "Upstream HTTP " + upstream.status });
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (!isPdf(buf)) {
      const head = buf.subarray(0, 120).toString("utf8").replace(/\s+/g, " ");
      return res.status(415).json({ error: "Réponse non-PDF (" + buf.length + " octets). Début : " + head.slice(0, 80) });
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline");
    return res.status(200).send(buf);
  } catch (e) {
    return res.status(502).json({ error: "Erreur proxy : " + (e && e.message ? e.message : String(e)) });
  }
}
