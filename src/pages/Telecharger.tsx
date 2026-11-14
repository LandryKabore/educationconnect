import { Link, Navigate } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, Globe, Monitor, Smartphone, TabletSmartphone } from "lucide-react";
import { APK_DOWNLOAD_URL, WEBSITE_URL } from "@/lib/config";
import { isDesktopApp } from "@/lib/platform";
import { BrandLogo } from "@/components/BrandLogo";
import { cn } from "@/lib/utils";

const SITE_URL = WEBSITE_URL || "https://edufaso.lovable.app";
const DOWNLOAD_SECTION = `${SITE_URL.replace(/\/$/, "")}/#telecharger`;

/** Link styled as a button. Links inherit their colour globally, hence the forced text colours. */
const BTN =
  "inline-flex h-11 w-full items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition";

export default function Telecharger() {
  // Already in the desktop app: the download page is useless here
  if (isDesktopApp()) {
    return <Navigate to="/connexion" replace />;
  }

  const platforms = [
    {
      icon: Monitor,
      name: "Ordinateur",
      detail: "Windows (.exe) · Mac (.dmg)",
      body: "L’application complète, ouverte d’un clic depuis votre bureau.",
      action: (
        <a href={DOWNLOAD_SECTION} target="_blank" rel="noreferrer" className={cn(BTN, "bg-brand-700 !text-white hover:bg-brand-800")}>
          Télécharger sur le site
          <ArrowUpRight className="h-4 w-4" />
        </a>
      ),
      available: true,
    },
    {
      icon: Smartphone,
      name: "Android",
      detail: "Téléphones et tablettes",
      body: "Notes, présences et messages directement sur le téléphone.",
      action: APK_DOWNLOAD_URL ? (
        <a href={APK_DOWNLOAD_URL} download className={cn(BTN, "bg-brand-700 !text-white hover:bg-brand-800")}>
          Télécharger l’APK
        </a>
      ) : null,
      available: !!APK_DOWNLOAD_URL,
    },
    {
      icon: TabletSmartphone,
      name: "iPhone et iPad",
      detail: "iOS",
      body: "L’application iPhone est en préparation. Elle arrivera sur l’App Store.",
      action: null,
      available: false,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[var(--bg)]">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-5">
        <BrandLogo file="edufaso-logo-tight.png" className="h-12 w-auto max-w-[8rem]" imgClassName="h-12" />
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold !text-slate-600 transition hover:bg-slate-100 hover:!text-slate-900 dark:!text-slate-300 dark:hover:bg-[var(--surface-2)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour
        </Link>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-6 pb-16">
        {/* Banner: same teal gradient as the portals */}
        <section className="relative overflow-hidden rounded-lg bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 text-white shadow-lg shadow-brand-900/25">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/[0.06]" />
          <div className="pointer-events-none absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-white/[0.04]" />
          <div className="relative px-6 py-10 lg:px-10 lg:py-12">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/70">Applications EduFaso</p>
            <h1 className="mt-3 max-w-2xl text-3xl font-bold leading-tight tracking-tight lg:text-[2.5rem]">
              Installez EduFaso sur vos appareils.
            </h1>
            <p className="mt-3 max-w-xl text-base font-medium text-white/85">
              Le même compte partout : vos identifiants fonctionnent sur l’ordinateur, le téléphone et le navigateur.
            </p>
          </div>
          <div className="flex h-1" aria-hidden>
            <span className="flex-1 bg-faso-red" />
            <span className="flex-1 bg-faso-yellow" />
            <span className="flex-1 bg-faso-green" />
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {platforms.map((p) => (
            <article
              key={p.name}
              className="flex flex-col rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-[var(--border)] dark:bg-[var(--surface)]"
            >
              <div className="flex items-start justify-between gap-3">
                <span
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-md",
                    p.available ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-500",
                  )}
                >
                  <p.icon className="h-5 w-5" />
                </span>
                <span
                  className={cn(
                    "rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider",
                    p.available ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500",
                  )}
                >
                  {p.available ? "Disponible" : "Bientôt"}
                </span>
              </div>
              <h2 className="mt-4 text-lg font-bold text-slate-900 dark:text-slate-50">{p.name}</h2>
              <p className="text-xs font-semibold text-slate-500">{p.detail}</p>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{p.body}</p>
              <div className="mt-5">
                {p.action ?? (
                  <span className={cn(BTN, "cursor-default border border-dashed border-slate-300 text-slate-500 dark:border-[var(--border)]")}>
                    Bientôt disponible
                  </span>
                )}
              </div>
            </article>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-12">
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm lg:col-span-8 dark:border-[var(--border)] dark:bg-[var(--surface)]">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Installer sur ordinateur</h2>
            <ol className="mt-4 grid gap-4 sm:grid-cols-3">
              {[
                { t: "Ouvrir le site", d: "Cliquez sur « Télécharger sur le site » ci-dessus." },
                { t: "Choisir votre système", d: "Windows (.exe) ou Mac (.dmg), puis lancez le fichier." },
                { t: "Se connecter", d: "Utilisez l’identifiant fourni par votre établissement." },
              ].map((step, i) => (
                <li key={step.t} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-700 text-sm font-bold text-white">
                    {i + 1}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">{step.t}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{step.d}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div className="flex flex-col rounded-lg border border-slate-200 bg-slate-100/60 p-6 lg:col-span-4 dark:border-[var(--border)] dark:bg-[var(--surface-2)]">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-white text-slate-600 shadow-sm dark:bg-[var(--surface)]">
              <Globe className="h-5 w-5" />
            </span>
            <h2 className="mt-3 text-base font-bold text-slate-900 dark:text-slate-50">Sans rien installer</h2>
            <p className="mt-1 flex-1 text-sm text-slate-600 dark:text-slate-300">
              EduFaso fonctionne aussi directement dans le navigateur, sur tous les appareils.
            </p>
            <Link
              to="/"
              className={cn(
                BTN,
                "mt-4 border border-slate-300 bg-white !text-slate-800 hover:bg-slate-50 dark:border-[var(--border)] dark:bg-[var(--surface)] dark:!text-slate-100",
              )}
            >
              Continuer dans le navigateur
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
