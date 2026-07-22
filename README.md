# EduFaso

Système de gestion scolaire installable (français), multi-écoles, multi-rôles.

## Stack

- Vite + React + TypeScript + Tailwind
- Supabase (Auth, Postgres, RLS, Edge Functions)
- PWA (`vite-plugin-pwa`)
- Capacitor (APK Android)

## Démarrage

```bash
npm install
npm run dev
```

Ouvrez http://localhost:5173

### Compte super admin initial

Le premier super administrateur se crée via la fonction Edge
`bootstrap-super-admin`, protégée par le secret d’environnement
`BOOTSTRAP_SUPER_ADMIN_SECRET` (jamais de mot de passe par défaut dans le
code ou la doc). Après création, changez immédiatement le mot de passe à
la première connexion.

## Rôles

| Rôle | Accès principal |
|------|-----------------|
| `super_admin` | Toutes les écoles |
| `school_admin` | Structure de l'école, comptes |
| `teacher` | Présences, notes, devoirs |
| `student` | Notes, devoirs, emploi du temps |
| `parent` | Suivi des enfants |

## Installation PWA

1. Ouvrir l'app dans Chrome / Edge / Safari
2. Menu → **Ajouter à l'écran d'accueil** / **Installer**
3. Ou aller sur `/telecharger`

## Build APK (Android)

```bash
npm run build
npx cap add android   # une seule fois
npx cap sync
npx cap open android
```

Dans Android Studio : Build → Build APK(s). Déposez l'APK sur une page de téléchargement plus tard.

## Variables d'environnement

Voir `.env.example` :

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

## Edge Functions

- `creer-utilisateur` — crée enseignant / élève / parent / admin (JWT requis)
- `bootstrap-super-admin` — créé une seule fois le premier super admin

## Migrations

Fichiers dans `supabase/migrations/`. Déjà appliquées sur le projet Supabase lié.

## Site marketing Lovable

Site de présentation / téléchargement :  
https://github.com/LandryKabore/edufaso-votre-cole-simplifi-e

Guide pour connecter site ↔ app : [docs/LIEN_SITE_LOVABLE.md](docs/LIEN_SITE_LOVABLE.md)
