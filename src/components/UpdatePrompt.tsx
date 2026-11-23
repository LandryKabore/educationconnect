import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, RefreshCw, Sparkles } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui";
import { APP_VERSION, BUILD_ID } from "@/lib/appInfo";
import {
  compareVersions,
  currentReleasePlatform,
  defaultDownloadUrl,
  fetchLatestReleases,
  type LatestRelease,
} from "@/lib/releases";

const SEEN_KEY = "edufaso.release.seen";
const SNOOZE_KEY = "edufaso.release.snoozed";

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: shown again next time */
  }
}

function Notes({ text }: { text: string }) {
  if (!text.trim()) return null;
  return (
    <ul className="space-y-1.5 text-sm text-slate-700 dark:text-slate-200">
      {text
        .split("\n")
        .map((l) => l.replace(/^\s*[•\-*]\s*/, "").trim())
        .filter(Boolean)
        .map((l) => (
          <li key={l} className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" />
            <span>{l}</span>
          </li>
        ))}
    </ul>
  );
}

/**
 * New version of the app:
 *  - web: a banner « Nouvelle version — Recharger » (the site is already updated, the tab is not);
 *  - Android / Windows / Mac apps: « Mise à jour disponible » with the download link
 *    (required, without « Plus tard », below the minimum version);
 *  - just updated: « Nouveautés » once.
 */
export function UpdatePrompt() {
  const platform = currentReleasePlatform();
  const { data } = useQuery({
    queryKey: ["app-releases"],
    queryFn: fetchLatestReleases,
    staleTime: 10 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
  const latest: LatestRelease | undefined = data?.[platform];
  const current = APP_VERSION;
  const dev = current === "dev";

  // web: the deployed site's build id; a different one means a new deployment
  const { data: deployed } = useQuery({
    queryKey: ["deployed-build"],
    enabled: platform === "web" && BUILD_ID !== "dev",
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return null;
      return (await res.json()) as { version: string; build: string };
    },
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const redeployed = platform === "web" && !!deployed?.build && deployed.build !== BUILD_ID;

  const newer = (!!latest && !dev && compareVersions(latest.version, current) > 0) || redeployed;
  const required = !!latest?.minVersion && !dev && compareVersions(current, latest.minVersion) < 0;
  const snoozed = read(SNOOZE_KEY) === `${latest?.version}|${new Date().toDateString()}`;
  const [closed, setClosed] = useState(false);

  // « Nouveautés »: this version's notes, once
  const [whatsNew, setWhatsNew] = useState<LatestRelease | null>(null);
  useEffect(() => {
    if (!latest || dev || newer) return;
    if (compareVersions(latest.version, current) !== 0) return;
    if (read(SEEN_KEY) === current) return;
    setWhatsNew(latest);
  }, [latest, current, dev, newer]);

  if (platform === "web") {
    return (
      <>
        {newer ? (
          <div className="sticky top-0 z-40 flex flex-wrap items-center justify-center gap-3 bg-brand-700 px-4 py-2 text-sm text-white">
            <Sparkles className="h-4 w-4" />
            <span>
              <strong>Nouvelle version d’EduFaso{deployed?.version ? ` (${deployed.version})` : latest ? ` (${latest.version})` : ""}</strong>
              {latest && compareVersions(latest.version, current) > 0 ? ` · ${latest.title}` : ""}
            </span>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1 font-semibold text-brand-800 hover:bg-brand-50"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Recharger
            </button>
          </div>
        ) : null}
        <WhatsNew release={whatsNew} onClose={() => (write(SEEN_KEY, current), setWhatsNew(null))} />
      </>
    );
  }

  const url = latest?.downloadUrl ?? defaultDownloadUrl(platform);
  // Windows / Mac apps check GitHub Releases themselves (electron/updater.cjs)
  const selfUpdating = platform === "windows" || platform === "mac";
  const showUpdate = !selfUpdating && newer && (required || (!snoozed && !closed));
  return (
    <>
      <Modal
        open={showUpdate}
        title={required ? "Mise à jour obligatoire" : "Mise à jour disponible"}
        onClose={() => {
          if (required) return;
          write(SNOOZE_KEY, `${latest?.version}|${new Date().toDateString()}`);
          setClosed(true);
        }}
      >
        {latest ? (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-slate-500">
                Version {latest.version} · vous avez la {current}
              </p>
              <p className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-50">{latest.title}</p>
            </div>
            <Notes text={latest.notes} />
            {required ? (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">Cette version n’est plus prise en charge : installez la nouvelle pour continuer.</p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              {!required ? (
                <Button
                  variant="outline"
                  className="rounded-md"
                  onClick={() => {
                    write(SNOOZE_KEY, `${latest.version}|${new Date().toDateString()}`);
                    setClosed(true);
                  }}
                >
                  Plus tard
                </Button>
              ) : null}
              {url ? (
                <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-md bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800">
                  <Download className="h-4 w-4" /> Télécharger la mise à jour
                </a>
              ) : (
                <p className="text-sm text-slate-500">Demandez la nouvelle version à votre école.</p>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
      <WhatsNew release={whatsNew} onClose={() => (write(SEEN_KEY, current), setWhatsNew(null))} />
    </>
  );
}

function WhatsNew({ release, onClose }: { release: LatestRelease | null; onClose: () => void }) {
  return (
    <Modal open={!!release} title={`Nouveautés · version ${release?.version ?? ""}`} onClose={onClose}>
      {release ? (
        <div className="space-y-4">
          <p className="text-lg font-bold text-slate-900 dark:text-slate-50">{release.title}</p>
          <Notes text={release.notes} />
          <div className="flex justify-end">
            <Button className="rounded-md" onClick={onClose}>
              C’est parti
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
