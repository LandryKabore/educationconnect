import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { APP_VERSION, nativePlatform } from "@/lib/appInfo";
import {
  decideVersionStatus,
  type VersionDecision,
} from "@/lib/appVersion";
import { fetchAppVersionPolicy } from "@/lib/fetchAppVersionPolicy";

const BANNER_KEY = "edufaso.dismissedUpdateVersion";
const NOTICE_KEY = "edufaso.dismissedMinVersion";

type VersionPolicyContextValue = {
  /** True only after a successful check says this install is below the minimum. */
  writesBlocked: boolean;
  decision: VersionDecision | null;
  installedVersion: string;
  noticeOpen: boolean;
  bannerVisible: boolean;
  dismissBanner: () => void;
  dismissNotice: () => void;
  reopenNotice: () => void;
};

const FAIL_OPEN: VersionPolicyContextValue = {
  writesBlocked: false,
  decision: null,
  installedVersion: APP_VERSION,
  noticeOpen: false,
  bannerVisible: false,
  dismissBanner: () => {},
  dismissNotice: () => {},
  reopenNotice: () => {},
};

const VersionPolicyContext = createContext<VersionPolicyContextValue>(FAIL_OPEN);

function readSession(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSession(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* private mode: the notice simply returns on the next navigation */
  }
}

/** Dev-only way to see the French notices in a browser. Ignored in production builds. */
function devPreviewDecision(): VersionDecision | null {
  if (!import.meta.env.DEV || typeof window === "undefined") return null;
  const hash = window.location.hash;
  const hashQuery = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
  const value =
    new URLSearchParams(window.location.search).get("apercuVersion") ||
    new URLSearchParams(hashQuery).get("apercuVersion");
  const downloadUrl = "https://edufaso.lovable.app/#telecharger";
  if (value === "banner") {
    return {
      updateAvailable: true,
      belowMinimum: false,
      latest: "9.9.9",
      minimum: null,
      downloadUrl,
    };
  }
  if (value === "min") {
    return {
      updateAvailable: true,
      belowMinimum: true,
      latest: "9.9.9",
      minimum: "9.0.0",
      downloadUrl,
    };
  }
  return null;
}

export function VersionPolicyProvider({ children }: { children: ReactNode }) {
  const [decision, setDecision] = useState<VersionDecision | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);

  useEffect(() => {
    const preview = devPreviewDecision();
    if (preview) {
      setDecision(preview);
      setNoticeOpen(preview.belowMinimum);
      return;
    }

    const platform = nativePlatform();
    if (!platform) return;

    let cancelled = false;
    const load = async () => {
      const policy = await fetchAppVersionPolicy();
      if (cancelled || !policy) return;
      const next = decideVersionStatus(APP_VERSION, platform, policy);
      setDecision(next);
      const min = next.minimum ?? "";
      const alreadyDismissed = min !== "" && readSession(NOTICE_KEY) === min;
      setNoticeOpen(next.belowMinimum && !alreadyDismissed);
      const latest = next.latest ?? "";
      setBannerDismissed(latest !== "" && readSession(BANNER_KEY) === latest);
    };

    void load();
    const onOnline = () => {
      void load();
    };
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
    };
  }, []);

  const dismissBanner = useCallback(() => {
    if (decision?.latest) writeSession(BANNER_KEY, decision.latest);
    setBannerDismissed(true);
  }, [decision?.latest]);

  const dismissNotice = useCallback(() => {
    if (decision?.minimum) writeSession(NOTICE_KEY, decision.minimum);
    setNoticeOpen(false);
  }, [decision?.minimum]);

  const reopenNotice = useCallback(() => {
    if (decision?.belowMinimum) setNoticeOpen(true);
  }, [decision?.belowMinimum]);

  const value = useMemo<VersionPolicyContextValue>(() => {
    const writesBlocked = decision?.belowMinimum === true;
    return {
      writesBlocked,
      decision,
      installedVersion: APP_VERSION,
      noticeOpen,
      bannerVisible:
        decision?.updateAvailable === true && !bannerDismissed && !noticeOpen && !writesBlocked,
      dismissBanner,
      dismissNotice,
      reopenNotice,
    };
  }, [bannerDismissed, decision, dismissBanner, dismissNotice, noticeOpen, reopenNotice]);

  return (
    <VersionPolicyContext.Provider value={value}>{children}</VersionPolicyContext.Provider>
  );
}

export function useVersionPolicy() {
  return useContext(VersionPolicyContext);
}

/**
 * Call before a grade, attendance, or message write.
 * Returns false without touching the form, so typed or queued work stays put.
 */
export function useAllowVersionWrite() {
  const { writesBlocked, reopenNotice } = useVersionPolicy();
  return useCallback(() => {
    if (!writesBlocked) return true;
    reopenNotice();
    return false;
  }, [reopenNotice, writesBlocked]);
}
