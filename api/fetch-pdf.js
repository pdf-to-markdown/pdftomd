// Proxy PDF serverless Vercel — 2 modes :
//  1) /api/fetch-pdf?url=https://...  → téléchargement classique (en-têtes navigateur)
//  2) /api/fetch-pdf?url=jo:2026-10-04 → édition du JO via l'API officielle PISTE (Légifrance)
//     (nécessite PISTE_CLIENT_ID et PISTE_CLIENT_SECRET dans les variables Vercel)

const LEGIFRANCE_API_BASE = process.env.LEGIFRANCE_API_BASE || "https://api.piste.gouv.fr/dila/legifrance-beta";
const PISTE_TOKEN_URL = process.env.PISTE_TOKEN_URL || "https://oauth.piste.gouv.fr/oauth/token";
const PISTE_SCOPE = process.env.PISTE_SCOPE || "openid";

const isPrivateHost = (h) =>
  /^(localhost|127\.|0\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.)/i.test(h);

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  "Accept": "application/pdf,application/octet-stream,*/*",
  "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8"
};

const isPdf = (buf) =>
  buf.length > 200 && buf.subarray(0, 2048).indexOf(Buffer.from("%PDF-")) !== -1;

async function getPisteToken() {
  const id = process.env.PISTE_CLIENT_ID;
  const secret = process.env.PISTE_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error("PISTE non configuré : ajoute PISTE_CLIENT_ID et PISTE_CLIENT_SECRET dans les variables d'environnement Vercel (compte gratuit sur https://piste.gouv.fr, abonnement à l'API Légifrance).");
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
    const txt = (await res.text()).slice(0, 200);
    throw new Error("Token PISTE refusé (HTTP " + res.status + ") : " + txt);
  }
  const j = await res.json();
  if (!j.access_token) throw new Error("Réponse PISTE sans access_token : " + JSON.stringify(j).slice(0, 200));
  return j.access_token;
}

// Édition du JO via PISTE : essaie plusieurs chemins connus de l'API Légifrance
async function fetchJoViaPiste(date, token) {
  const paths = [
    "/jorf/jo/" + date,
    "/jorf/jo/" + date + "/pdf",
    "/download/jorf/jo/" + date
  ];
  const errors = [];
  for (const p of paths) {
    try {
      const res = await fetch(LEGIFRANCE_API_BASE + p, {
        headers: { ...BROWSER_HEADERS, "Authorization": "Bearer " + token, "Accept": "application/pdf,*/*" }
      });
      const buf = Buffer.from(await res.arrayBuffer());
      if (res.ok && isPdf(buf)) return buf;
      const head = buf.subarray(0, 160).toString("utf8").replace(/\s+/g, " ");
      errors.push(p + " : HTTP " + res.status + " → " + head);
    } catch (e) {
      errors.push(p + " : " + (e && e.message ? e.message : String(e)));
    }
  }
  throw new Error("PISTE jo: aucun chemin n'a renvoyé de PDF. Réponses API : " + errors.join(" | "));
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
      const token = await getPisteToken();
      const buf = await fetchJoViaPiste(joMatch[1], token);
      res.setHeader("Content-Type", "application/pdf");
      return res.status(200).send(buf);
    } catch (e) {
      return res.status(502).json({ error: e.message || String(e) });
    }
  }

  // ---- Mode proxy classique ----
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: "Paramètre url invalide" });
  let parsed;
  try { parsed = new URL(url); } catch { return res.status(400).json({ error: "URL illisible" }); }
  if (!["http:", "https:"].includes(parsed.protocol)) return res.status(400).json({ error: "Protocole non autorisé" });
  if (isPrivateHost(parsed.hostname)) return res.status(400).json({ error: "Hôte non autorisé" });

  try {
    // Pour Légifrance : tente d'abord avec un token PISTE en Bearer (accès officiel),
    // puis en direct avec en-têtes navigateur.
    const isLegifrance = /(^|\.)legifrance\.gouv\.fr$/i.test(parsed.hostname);
    if (isLegifrance && process.env.PISTE_CLIENT_ID) {
      try {
        const token = await getPisteToken();
        const up = await fetch(url, {
          redirect: "follow",
          headers: { ...BROWSER_HEADERS, "Referer": parsed.origin + "/", "Authorization": "Bearer " + token }
        });
        const buf = Buffer.from(await up.arrayBuffer());
        if (up.ok && isPdf(buf)) {
          res.setHeader("Content-Type", "application/pdf");
          return res.status(200).send(buf);
        }
      } catch (e) { /* on retombe sur le mode direct */ }
    }

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
