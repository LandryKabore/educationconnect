# EduFaso

Système de gestion scolaire installable (français), multi-écoles, multi-rôles.

## Stack

- Vite + React + TypeScript + Tailwind
- Supabase (Auth, Postgres, RLS, Edge Functions)
- PWA (`vite-plugin-pwa`)
- Capacitor (APK Android / IPA iOS)

## Démarrage

```bash
npm install
npm run dev
```

Ouvrez http://localhost:5173

### Compte super admin initial

- Identifiant : `superadmin`
- Mot de passe : `EduFaso2026!`
- À la première connexion, changez le mot de passe.

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

## Build iOS (iPhone / iPad)

Prérequis : macOS avec Xcode, CocoaPods (`sudo gem install cocoapods`), et un compte Apple Developer pour installer sur appareil / App Store.

```bash
npm install
# renseigner .env (VITE_SUPABASE_*)
npm run build
npx cap add ios      # une seule fois (déjà fait dans ce dépôt : dossier ios/)
npx cap sync ios
npx cap open ios     # ou : npm run cap:ios
```

Dans Xcode :
1. Sélectionner le target **App**, onglet **Signing & Capabilities**
2. Choisir votre Team Apple
3. Product → Destination → iPhone simulateur ou appareil
4. Product → Run (⌘R), ou Archive pour une IPA / TestFlight

Le projet Xcode est dans `ios/App/App.xcworkspace` (ouvrir le **workspace**, pas le `.xcodeproj`). Bundle ID : `bf.edufaso.app`.

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
