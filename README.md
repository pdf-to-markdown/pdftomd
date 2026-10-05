# pdftomd

Convertisseur **PDF → Markdown** — lot (10+ fichiers), par URL, et **OCR intégré** pour les PDF scannés. 100 % navigateur, aucun fichier envoyé sur un serveur.

## ✨ Fonctionnalités

- **Lot** : glisse 10+ PDF à la fois
- **Par URL** : colle des URLs de PDF (une par ligne) — Légifrance, etc.
  - si le site bloque le navigateur (CORS), un proxy public est utilisé en secours (corsproxy.io, allorigins)
- **🔍 OCR intégré (Tesseract.js, fr+en)** : les pages sans texte (PDF scannés / images) sont automatiquement passées à l'OCR — les pages avec texte normal restent rapides
- **100 % local** : conversion via pdf.js + Tesseract.js dans le navigateur
- Détection des titres (MAJUSCULES → `##`, « Article X » → `###`)
- Listes à puces et numérotées, recollage des mots coupés (exem-ple)
- Séparateur de pages (`<!-- page N -->`)
- Sortie : copier, télécharger chaque `.md`, ou tout dans un `.zip`

## 🚀 Utilisation

- **En ligne** : https://pdftomd-olive.vercel.app (déploiement Vercel depuis `main`)
- **En local** : ouvre `index.html` dans ton navigateur

## ⚠️ Notes

- L'OCR est lent (~5-15 s/page) : le premier document scanné télécharge le moteur (~15 Mo), les suivants sont plus rapides.
- L'OCR fonctionne mieux sur des scans propres ; les scans de très mauvaise qualité peuvent rester partiellement illisibles.
