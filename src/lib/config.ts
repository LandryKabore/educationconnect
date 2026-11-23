/** Site marketing Lovable (présentation + téléchargement) */
export const WEBSITE_URL = import.meta.env.VITE_WEBSITE_URL as string | undefined;

/** URL publique de cette application (bouton « Ouvrir l'app » sur le site) */
export const APP_PUBLIC_URL = import.meta.env.VITE_APP_PUBLIC_URL as string | undefined;

/** Lien direct vers l'APK Android (optionnel) */
export const APK_DOWNLOAD_URL = import.meta.env.VITE_APK_DOWNLOAD_URL as string | undefined;

/**
 * Desktop installers: attached to the latest GitHub release under fixed names, so these links stay valid
 * for every new version. Can be overridden per deployment.
 */
const RELEASES = "https://github.com/LandryKabore/educationconnect/releases/latest/download";
export const WINDOWS_DOWNLOAD_URL =
  (import.meta.env.VITE_WINDOWS_DOWNLOAD_URL as string | undefined) || `${RELEASES}/EduFaso-Windows.exe`;
export const MAC_DOWNLOAD_URL =
  (import.meta.env.VITE_MAC_DOWNLOAD_URL as string | undefined) || `${RELEASES}/EduFaso-Mac.dmg`;
