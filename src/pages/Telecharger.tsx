import { Link, Navigate } from "react-router-dom";
import { ArrowLeft, Download, Monitor } from "lucide-react";
import { APK_DOWNLOAD_URL, WEBSITE_URL } from "@/lib/config";
import { isDesktopApp } from "@/lib/platform";
import { Card, PageHeader } from "@/components/ui";

const SITE_URL = WEBSITE_URL || "https://edufaso.lovable.app";
const DOWNLOAD_SECTION = `${SITE_URL.replace(/\/$/, "")}/#telecharger`;

export default function Telecharger() {
  // Already in the desktop app — download page is useless here
  if (isDesktopApp()) {
    return <Navigate to="/connexion" replace />;
  }

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <Link
        to="/connexion"
        className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-brand-700 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour à la connexion
      </Link>

      <PageHeader
        title="Télécharger l'application"
        subtitle="Téléchargez EduFaso pour Windows ou Mac depuis le site officiel"
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
            <Monitor className="h-5 w-5" />
          </div>
          <h2 className="text-lg font-semibold">Ordinateur (Windows / Mac)</h2>
          <p className="mt-2 text-sm text-slate-600">
            Le téléchargement se fait sur le site EduFaso : cliquez sur
            « Télécharger », choisissez Windows (.exe) ou Mac (.dmg), puis
            installez le fichier.
          </p>
          <a
            href={DOWNLOAD_SECTION}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800"
          >
            Aller sur le site pour télécharger
          </a>
        </Card>

        <Card>
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            <Download className="h-5 w-5" />
          </div>
          <h2 className="text-lg font-semibold">Android</h2>
          <p className="mt-2 text-sm text-slate-600">
            L’application mobile arrivera plus tard. Pour l’instant, utilisez la
            version ordinateur téléchargée depuis le site.
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
            <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Bientôt disponible
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
