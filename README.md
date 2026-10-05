# pdftomd

Convertisseur **PDF → Markdown** — lot (10+ fichiers), par URL, OCR intégré, **authentification Google via Supabase** (accès privé).

## 🔐 Authentification

L'app est verrouillée : seul le compte **contact@mail.martytheo.com** est autorisé (liste blanche codée dans `index.html`, `ALLOWED_EMAIL`). Toute autre session Google est déconnectée automatiquement.

### Mise en place (une seule fois)

1. **Crée un projet** sur [supabase.com](https://supabase.com) (plan gratuit suffit).
2. Dans Supabase → **Authentication → Providers → Google** : active le provider.
   - Il te faut un **Client OAuth Google** : [console.cloud.google.com](https://console.cloud.google.com/apis/credentials) → « Créer des identifiants → ID client OAuth » (application Web).
   - **URI de redirection autorisée** dans Google Cloud : `https://VOTRE-PROJET.supabase.co/auth/v1/callback` (remplace par ton ref de projet Supabase).
   - Copie le **Client ID** et le **Client Secret** Google dans Supabase.
3. Dans Supabase → **Authentication → URL Configuration** :
   - **Site URL** : `https://pdftomd-olive.vercel.app`
   - **Redirect URLs** : ajoute `https://pdftomd-olive.vercel.app` et `https://pdftomd-olive.vercel.app/index.html`
4. Dans `index.html`, remplace en haut du `<script>` :
   - `SUPABASE_URL` → `https://VOTRE-PROJET.supabase.co` (Settings → API → Project URL)
   - `SUPABASE_ANON_KEY` → la clé `anon / public` (Settings → API)
5. Commit → Vercel redéploie.

> ℹ️ La clé `anon` est **publique par conception** (visible côté client). La sécurité réelle vient du provider Google + de la liste blanche `ALLOWED_EMAIL` dans le code. Pour une protection côté serveur (middleware), il faudrait un backend — pas nécessaire ici car l'app n'a aucune donnée côté serveur.

## ✨ Fonctionnalités

- **Lot** : 10+ PDF d'un coup
- **Par URL** : une URL par ligne, proxy CORS en secours
- **OCR Tesseract.js (fr+en)** : automatique sur les pages scannées
- **100 % local** : aucune donnée envoyée (hors auth Google/Supabase)
- Titres, listes, recollage des césures, séparateurs de pages
- Sortie : `.md` individuels ou `.zip`

## 🚀 Utilisation

En ligne : https://pdftomd-olive.vercel.app — connexion Google requise.
