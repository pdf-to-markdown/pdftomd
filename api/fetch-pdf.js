// Proxy PDF serverless — contourne le CORS et les blocages anti-bot légers.
// GET /api/fetch-pdf?url=https://...
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.status(204).end();

  const url = req.query.url;
  if (!url || !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: "Paramètre url invalide" });
  }
  // Sécurité : on ne proxifie que des PDF (domaines autorisés restreints ? non, usage privé mais évitons SSRF basique)
  let parsed;
  try { parsed = new URL(url); } catch { return res.status(400).json({ error: "URL illisible" }); }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return res.status(400).json({ error: "Protocole non autorisé" });
  }
  // Blocage SSRF basique : pas d'IP directe, pas de localhost
  if (/^(localhost|127\.|0\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.)/i.test(parsed.hostname)) {
    return res.status(400).json({ error: "Hôte non autorisé" });
  }

  try {
    const upstream = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
        "Accept": "application/pdf,application/octet-stream,*/*",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
        "Referer": parsed.origin + "/"
      }
    });
    if (!upstream.ok) {
      return res.status(502).json({ error: "Upstream HTTP " + upstream.status });
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    // Vérifie que c'est bien un PDF (%PDF dans le 1er Ko)
    if (buf.length < 200 || buf.subarray(0, 2048).indexOf(Buffer.from("%PDF-")) === -1) {
      const head = buf.subarray(0, 120).toString("utf8").replace(/\s+/g, " ");
      return res.status(415).json({ error: "Réponse non-PDF (" + buf.length + " octets). Début : " + head.slice(0, 80) });
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline");
    res.status(200).send(buf);
  } catch (e) {
    res.status(502).json({ error: "Erreur proxy : " + (e && e.message ? e.message : String(e)) });
  }
}
