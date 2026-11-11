# EduFaso iOS (natif)

Application **SwiftUI native** (pas de Capacitor / WebView) connectée au même backend Supabase que l’app web.

## Prérequis

- macOS + Xcode 16+
- Compte Apple (Signing) pour appareil / TestFlight
- Les mêmes clés que le fichier `.env` web :
  - `VITE_SUPABASE_URL` → `SUPABASE_URL`
  - `VITE_SUPABASE_PUBLISHABLE_KEY` → `SUPABASE_ANON_KEY`

## Configuration

1. Ouvrez `EduFaso/Config/Secrets.xcconfig`
2. Renseignez l’URL et la clé (syntaxe xcconfig pour les `//` dans l’URL) :

```xcconfig
SUPABASE_URL = https:/$()/VOTRE_REF.supabase.co
SUPABASE_ANON_KEY = votre_cle_publishable_ou_anon
```

3. Ouvrez `EduFaso.xcodeproj` dans Xcode  
4. Target **EduFaso** → Signing & Capabilities → choisissez votre Team  
5. Bundle ID : `bf.edufaso.app`  
6. Product → Run (simulateur ou iPhone)

## Contenu v1

| Rôle | Fonctionnalités |
|------|-----------------|
| Élève | Accueil, notes, présences, emploi du temps, messages, profil |
| Parent | Sélecteur d’enfants + notes / présences / EDT, messages, profil |
| Enseignant | Accueil, classes, appel (présences), EDT, messages, profil |
| Admin | Écran d’orientation vers le web (pour l’instant) |

Auth alignée sur le web : identifiant → `identifiant@edufaso.local`, première connexion (mot de passe fort), complétion de profil.

## Structure

```
edufaso iOS/
  EduFaso.xcodeproj
  EduFaso/
    App/           # Point d’entrée + routage
    Config/        # Info.plist + Secrets.xcconfig
    Features/      # Auth, Student, Parent, Teacher, Shared
    Models/
    Services/      # Supabase + AuthStore + requêtes
    Theme/
    Resources/     # Assets (logo, icône)
```

Dépendance SPM : [supabase-swift](https://github.com/supabase/supabase-swift) (≥ 2.5).
