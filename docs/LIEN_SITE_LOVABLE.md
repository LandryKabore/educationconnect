# Lier le site Lovable et l'application EduFaso

Deux projets distincts :

| Projet | Repo | Rôle |
|--------|------|------|
| **Site marketing** | [edufaso-votre-cole-simplifi-e](https://github.com/LandryKabore/edufaso-votre-cole-simplifi-e) | Présentation, téléchargement |
| **Application** | [educationconnect → EduFaso app](https://github.com/LandryKabore/educationconnect) ou ce dossier | Connexion, écoles, notes, etc. |

## 1. Déployer l'application

Exemples : Vercel, Netlify, Cloudflare Pages, Lovable (autre projet).

```bash
cd EduFasoSsytem
npm run build
# Déployer le dossier dist/
```

Notez l'URL publique, par ex. `https://app-edufaso.vercel.app`.

Dans `.env` de l'app :

```env
VITE_APP_PUBLIC_URL=https://app-edufaso.vercel.app
VITE_WEBSITE_URL=https://votre-site.lovable.app
```

## 2. Configurer le site Lovable

Dans Lovable, ouvrez le projet **edufaso-votre-cole-simplifi-e** et remplacez les liens :

### Bouton « Ouvrir l'application »

Pointez vers l'URL de l'app déployée :

```
https://APP-EDUFASO.vercel.app/connexion
```

(ou `/` — redirection automatique vers la connexion)

### Section « Installer l'APK » (plus tard)

Quand l'APK est prêt :

1. Build : `npm run build && npx cap sync && npx cap open android`
2. Hébergez `app-release.apk` (GitHub Releases, Supabase Storage, etc.)
3. Sur le site Lovable, bouton **Télécharger l'APK** → URL du fichier

Dans l'app `.env` :

```env
VITE_APK_DOWNLOAD_URL=https://.../edufaso.apk
```

## 3. Publier le site Lovable

Dans Lovable : **Share → Publish**. Copiez l'URL (ex. `https://xxx.lovable.app`).

Mettez cette URL dans l'app :

```env
VITE_WEBSITE_URL=https://xxx.lovable.app
```

## 4. Schéma

```
Site Lovable                    Application EduFaso
─────────────────              ───────────────────
[Ouvrir l'app] ──────────────► /connexion
[APK] (optionnel)              /telecharger (PWA + APK)
[Retour site] ◄──────────────  lien « Retour au site »
```

## 5. Repo GitHub privé

Si le repo Lovable est **privé**, rendez-le public ou partagez l'URL **Publish** de Lovable pour que l'équipe puisse vérifier les liens.

## 6. Domaine personnalisé (optionnel)

- `www.edufaso.bf` → site Lovable
- `app.edufaso.bf` → application Vite

Configurez dans Lovable (Domains) et votre hébergeur d'app.
