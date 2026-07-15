import { useEffect, useState } from "react";
import { Download, Smartphone } from "lucide-react";
import { APK_DOWNLOAD_URL, WEBSITE_URL } from "@/lib/config";
import { Button, Card, PageHeader } from "@/components/ui";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function Telecharger() {
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  };

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <PageHeader
        title="Télécharger l'application"
        subtitle="Installez EduFaso sur votre appareil"
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
            <Smartphone className="h-5 w-5" />
          </div>
          <h2 className="text-lg font-semibold">Application web (PWA)</h2>
          <p className="mt-2 text-sm text-slate-600">
            Sur Chrome ou Safari, ouvrez le menu du navigateur puis choisissez
            « Ajouter à l'écran d'accueil » ou « Installer l'application ».
          </p>
          {installEvent ? (
            <Button className="mt-4" onClick={() => void handleInstall()}>
              Installer EduFaso
            </Button>
          ) : (
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-600">
              <li>Ouvrez EduFaso dans votre navigateur</li>
              <li>Appuyez sur le menu (⋮ ou partage)</li>
              <li>Sélectionnez « Ajouter à l'écran d'accueil »</li>
              <li>Confirmez l'installation</li>
            </ol>
          )}
        </Card>

        <Card>
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            <Download className="h-5 w-5" />
          </div>
          <h2 className="text-lg font-semibold">Application Android (APK)</h2>
          <p className="mt-2 text-sm text-slate-600">
            Le projet Android Capacitor est prêt (`android/`). Générez l'APK avec
            Android Studio, puis hébergez-le ici pour le téléchargement public.
          </p>
          {APK_DOWNLOAD_URL ? (
            <a
              href={APK_DOWNLOAD_URL}
              download
              className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800"
            >
              Télécharger l'APK Android
            </a>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Lien APK à venir — en attendant, utilisez l'installation PWA.
            </div>
          )}
        </Card>
      </div>

      {WEBSITE_URL ? (
        <p className="mt-6 text-center text-sm text-slate-500">
          <a href={WEBSITE_URL} className="text-brand-700 hover:underline">
            Retour au site EduFaso
          </a>
        </p>
      ) : null}
    </div>
  );
}
