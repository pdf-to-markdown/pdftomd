#!/bin/sh
# Build Vercel : injecte les secrets depuis les variables d'environnement.
# Aucune valeur sensible n'est stockée dans le repo GitHub.
set -e
mkdir -p dist

: "${SUPABASE_URL:?Variable SUPABASE_URL manquante dans Vercel}"
: "${SUPABASE_ANON_KEY:?Variable SUPABASE_ANON_KEY manquante dans Vercel}"

sed -e "s|__SUPABASE_URL__|${SUPABASE_URL}|g" \
    -e "s|__SUPABASE_ANON_KEY__|${SUPABASE_ANON_KEY}|g" \
    index.html > dist/index.html

echo "Build OK : secrets injectés dans dist/index.html"
