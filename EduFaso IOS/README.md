# EduFaso iOS (native SwiftUI)

Native iOS client for EduFaso — **not** Capacitor. Uses the same Supabase backend as the web/desktop app.

## Open in Xcode

```bash
open "EduFaso/EduFaso.xcodeproj"
```

## Configure secrets

Copy `EduFaso/AppConfig.example.swift` → `EduFaso/EduFaso/Config/AppConfig.swift` and set:

- `supabaseURL`
- `supabaseAnonKey` (publishable / anon key)
- `supabaseProjectId`

`AppConfig.swift` is gitignored.

## Run on a device

1. Unlock the iPhone, trust the Mac, enable **Developer Mode**
2. Select your phone as the run destination in Xcode
3. Press Run (⌘R)

Or from the CLI (after a Debug build):

```bash
xcrun devicectl device install app --device "<UDID>" \
  "EduFaso/DerivedData/Build/Products/Debug-iphoneos/EduFaso.app"
```

## What’s included

The signed-in menu follows the web app, screen by screen:

- Connexion, mot de passe oublié, vérification d’un bulletin
- Première connexion / changement de mot de passe, compléter le profil
- Élève : accueil, cahier, notes, exercices, devoirs, compositions, présences, profs, emploi du temps, bulletin, messages, annonces
- Parent : accueil, enfants, et pour chaque enfant notes, présences, devoirs, exercices, compositions, bulletin, emploi du temps, cahier
- Enseignant : accueil, classes, élèves, présences, appel, emploi du temps, cahier, devoirs et saisie des notes
- École : tableau de bord, configuration, vie scolaire, personnes, structure
- Super admin : écoles, utilisateurs, invitations, rapports, signalements, abonnements, paramètres, audit, super admins

## Build

```bash
cd EduFaso
xcodebuild -project EduFaso.xcodeproj -scheme EduFaso \
  -configuration Debug -destination 'generic/platform=iOS' \
  -derivedDataPath ./DerivedData build
```
