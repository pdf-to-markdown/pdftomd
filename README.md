# pdftomd

Convertisseur **PDF → Markdown** — lot, URLs, OCR, auth Google/Supabase, proxy Vercel, **accès officiel Légifrance via PISTE**.

## 🔐 Secrets (variables d'environnement Vercel — rien dans le repo)

| Nom | Où la trouver |
|---|---|
| `SUPABASE_URL` | Supabase → Settings → API |
| `SUPABASE_ANON_KEY` | Supabase → Settings → API (anon public) |
| `PISTE_CLIENT_ID` | https://piste.gouv.fr → Mon compte → mes applications |
| `PISTE_CLIENT_SECRET` | idem |

Optionnels : `PISTE_TOKEN_URL` (défaut https://oauth.piste.gouv.fr/oauth/token), `PISTE_SCOPE` (défaut openid), `LEGIFRANCE_API_BASE` (défaut https://api.piste.gouv.fr/dila/legifrance-beta).

## 🇫🇷 Accès Légifrance officiel (PISTE) — mise en place (une seule fois)

1. Crée un compte gratuit sur **https://piste.gouv.fr** (via FranceConnect ou e-mail pro).
2. Dans le catalogue PISTE, abonne ton application à l'**API Légifrance**.
3. Crée une application : note le **Client ID** et le **Client Secret**.
4. Ajoute-les dans Vercel → Settings → Environment Variables (`PISTE_CLIENT_ID`, `PISTE_CLIENT_SECRET`).
5. Redéploie.

Deux usages :
- **Édition du JO** : colle dans l'app `jo:2026-10-04` (date de l'édition) → le proxy interroge l'API officielle et renvoie le PDF.
- **URL Légifrance** : si les clés PISTE sont présentes, le proxy tente d'abord l'accès authentifié officiel avant le mode direct.

> L'endpoint exact du PDF du JO dans l'API Légifrance peut varier selon ta souscription PISTE : le proxy essaie plusieurs chemins et renvoie les réponses de l'API dans le message d'erreur — copie-le-moi si besoin, j'ajusterai le chemin.

## ✨ Fonctionnalités

- Lot (10+ PDF), URLs multiples (proxy Vercel + proxys publics en secours)
- `jo:AAAA-MM-JJ` → JO du jour via API officielle
- OCR Tesseract.js fr+en automatique sur pages scannées
- Auth Google (Supabase), accès réservé à un seul compte
- Titres/listes/césures, sortie `.md` ou `.zip`

## 🚀

https://pdftomd-olive.vercel.app
