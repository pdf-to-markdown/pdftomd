# pdftomd

Convertisseur **PDF → Markdown** — lot (10+ fichiers), par URL, OCR intégré, auth Google via Supabase (accès privé à un seul compte).

## 🔐 Secrets : rien dans le repo

Le repo ne contient **aucune clé**. `index.html` a deux placeholders (`__SUPABASE_URL__`, `__SUPABASE_ANON_KEY__`) remplacés **au build Vercel** (`build.sh`) par les variables d'environnement :

Dans **Vercel → ton projet → Settings → Environment Variables**, ajoute :

| Nom | Valeur |
|---|---|
| `SUPABASE_URL` | `https://lpvivewmfsnvyvsaecey.supabase.co` |
| `SUPABASE_ANON_KEY` | ta clé `anon / public` (Supabase → Settings → API) |

Cochent aussi `pdftomd-git-main-tmcws.vercel.app` si besoin. Redéploie après ajout.

### Config Supabase (une seule fois)

1. Authentication → Providers → **Google** : activer (Client ID/Secret OAuth Google).
   - Redirection Google Cloud : `https://lpvivewmfsnvyvsaecey.supabase.co/auth/v1/callback`
2. Authentication → URL Configuration :
   - Site URL : `https://pdftomd-olive.vercel.app`
   - Redirect URLs : `https://pdftomd-olive.vercel.app` et `https://pdftomd-olive.vercel.app/index.html`

Seul **contact@mail.martytheo.com** est autorisé (`ALLOWED_EMAIL` dans `index.html`).

## ✨ Fonctionnalités

- Lot (10+ PDF), URLs multiples (proxy CORS en secours)
- OCR Tesseract.js fr+en automatique sur pages scannées
- 100 % local, titres/listes/césures, sortie `.md` ou `.zip`

## 🚀

https://pdftomd-olive.vercel.app — connexion Google requise.
