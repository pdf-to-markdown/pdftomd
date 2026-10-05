# pdftomd

Convertisseur **PDF → Markdown** — lot (10+ fichiers) et par URL. 100 % navigateur, aucun fichier envoyé sur un serveur.

## ✨ Fonctionnalités

- **Lot** : glisse 10+ PDF à la fois
- **Par URL** : colle des URLs de PDF (une par ligne) — Légifrance, etc.
  - si le site bloque le navigateur (CORS), un proxy public est utilisé en secours (corsproxy.io, allorigins)
- **100 % local** : conversion via pdf.js dans le navigateur
- Détection des titres (MAJUSCULES → `##`, « Article X » → `###`)
- Listes à puces et numérotées, recollage des mots coupés (exem-ple)
- Séparateur de pages (`<!-- page N -->`)
- Sortie : copier, télécharger chaque `.md`, ou tout dans un `.zip`

## 🚀 Utilisation

Ouvre `index.html` dans ton navigateur (ou sert le dossier statiquement). C'est tout.

## ⚠️ Limites

- Les PDF **scannés** (images) ne contiennent pas de texte : OCR nécessaire.
- Heuristiques de mise en forme : un petit nettoyage manuel peut être requis selon les documents.
