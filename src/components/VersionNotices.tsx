import { useEffect, useState, type ReactNode } from "react";
import { Download, X } from "lucide-react";
import { useVersionPolicy } from "@/contexts/VersionPolicyContext";
import { Button } from "@/components/ui";

/** Fixed bar plus a spacer, so the notice stays on screen and does not cover the page. */
function PinnedBar({ children }: { children: ReactNode }) {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!node) return;
    const measure = () => setHeight(node.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  return (
    <>
      <div style={{ height }} aria-hidden="true" />
      <div ref={setNode} className="fixed inset-x-0 top-0 z-40">
        {children}
      </div>
    </>
  );
}

function DownloadLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800"
    >
      <Download className="h-4 w-4" />
      {label}
    </a>
  );
}

/** Dismissible banner when a newer bureau or Android build exists. */
function UpdateBanner({
  installed,
  latest,
  downloadUrl,
  onDismiss,
}: {
  installed: string;
  latest: string | null;
  downloadUrl: string | null;
  onDismiss: () => void;
}) {
  return (
    <PinnedBar>
    <div
      role="status"
      className="border-b border-brand-200 bg-brand-50 px-4 py-3 text-brand-950 shadow-sm dark:border-brand-800 dark:bg-brand-950 dark:text-brand-50"
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-sm">
          <span className="font-semibold">Une nouvelle version est disponible.</span>
          {latest ? (
            <span className="mt-0.5 block text-brand-900/80 dark:text-brand-100/80">
              Version installée {installed} — version {latest} en téléchargement.
            </span>
          ) : null}
        </p>
        {downloadUrl ? <DownloadLink href={downloadUrl} label="Télécharger" /> : null}
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg p-2 text-brand-800 hover:bg-brand-100 dark:text-brand-100 dark:hover:bg-brand-900"
          aria-label="Fermer l’annonce de mise à jour"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
    </PinnedBar>
  );
}

function ReadOnlyStrip({
  downloadUrl,
  updateAvailable,
  onOpen,
}: {
  downloadUrl: string | null;
  updateAvailable: boolean;
  onOpen: () => void;
}) {
  return (
    <PinnedBar>
    <div
      role="status"
      className="border-b border-amber-400 bg-amber-100 px-4 py-3 text-sm text-amber-950 shadow-sm dark:border-amber-600 dark:bg-amber-950 dark:text-amber-50"
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1">
          {updateAvailable ? (
            <span className="font-semibold">Une nouvelle version est disponible. </span>
          ) : null}
          La saisie des notes, des présences et des messages reste désactivée tant que cette
          installation n’est pas mise à jour.
        </p>
        {downloadUrl ? <DownloadLink href={downloadUrl} label="Télécharger" /> : null}
        <Button type="button" variant="outline" size="sm" onClick={onOpen}>
          Voir le détail
        </Button>
      </div>
    </div>
    </PinnedBar>
  );
}

function MinVersionNotice({
  installed,
  minimum,
  downloadUrl,
  updateAvailable,
  onContinue,
}: {
  installed: string;
  minimum: string | null;
  downloadUrl: string | null;
  updateAvailable: boolean;
  onContinue: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onContinue();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onContinue]);

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-slate-100 dark:bg-slate-950">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="min-version-title"
        className="mx-auto flex min-h-full max-w-lg flex-col justify-center px-6 py-10"
      >
        <p className="text-sm font-medium uppercase tracking-wide text-brand-700">EduFaso</p>
        <h1 id="min-version-title" className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-50">
          Mise à jour requise
        </h1>
        {updateAvailable ? (
          <p className="mt-4 text-sm font-semibold text-slate-900 dark:text-slate-50">
            Une nouvelle version est disponible.
          </p>
        ) : null}
        <p className="mt-4 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
          Cette version ({installed}) n’est plus prise en charge
          {minimum ? ` (version minimale ${minimum})` : ""}. Vous pouvez continuer à consulter
          l’application. La saisie des notes, des présences et l’envoi de messages sont désactivés
          jusqu’à la mise à jour. Ce qui est déjà saisi sur cet appareil n’est pas effacé.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {downloadUrl ? (
            <DownloadLink href={downloadUrl} label="Télécharger la mise à jour" />
          ) : (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Le lien de téléchargement n’est pas encore configuré. Contactez l’administrateur
              EduFaso.
            </p>
          )}
          <Button type="button" variant="outline" onClick={onContinue}>
            Continuer en lecture seule
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Startup notices for bureau and Android. Web and PWA render nothing. */
export function VersionNotices() {
  const {
    decision,
    installedVersion,
    noticeOpen,
    bannerVisible,
    writesBlocked,
    dismissBanner,
    dismissNotice,
    reopenNotice,
  } = useVersionPolicy();

  if (!decision) return null;

  return (
    <>
      {bannerVisible ? (
        <UpdateBanner
          installed={installedVersion}
          latest={decision.latest}
          downloadUrl={decision.downloadUrl}
          onDismiss={dismissBanner}
        />
      ) : null}
      {writesBlocked && !noticeOpen ? (
        <ReadOnlyStrip
          downloadUrl={decision.downloadUrl}
          updateAvailable={decision.updateAvailable}
          onOpen={reopenNotice}
        />
      ) : null}
      {noticeOpen ? (
        <MinVersionNotice
          installed={installedVersion}
          minimum={decision.minimum}
          downloadUrl={decision.downloadUrl}
          updateAvailable={decision.updateAvailable}
          onContinue={dismissNotice}
        />
      ) : null}
    </>
  );
}
