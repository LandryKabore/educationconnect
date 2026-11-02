import { APP_PUBLIC_URL, WEBSITE_URL } from "@/lib/config";
import { supabase } from "@/lib/supabase";

/** Used when nothing else is known (same default as the invitation links). */
const FALLBACK_SITE = "https://edufaso.lovable.app";

function isLocalHost(host: string) {
  return host === "localhost" || host.startsWith("127.") || host === "[::1]";
}

/**
 * Public address printed in the QR code. The QR codes live on paper for years, so set
 * VITE_APP_PUBLIC_URL to the permanent address of the app before printing real bulletins.
 */
export function verifyBaseUrl(): string {
  if (APP_PUBLIC_URL) return APP_PUBLIC_URL.replace(/\/$/, "");
  if (
    typeof window !== "undefined" &&
    /^https?:$/.test(window.location.protocol) &&
    !isLocalHost(window.location.hostname)
  ) {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    return `${window.location.origin}${base}`;
  }
  return (WEBSITE_URL || FALLBACK_SITE).replace(/\/$/, "");
}

export function documentVerifyUrl(code: string): string {
  return `${verifyBaseUrl()}/verifier?c=${encodeURIComponent(code)}`;
}

/**
 * Registers the bulletin in the school's document register and returns its public code.
 * The same data gives the same code; changed grades give a new code (the old paper then shows
 * « remplacé par une version plus récente »). Returns null when the database does not have the
 * register yet (migration not applied): the bulletin is then produced without a QR code.
 */
export async function issueBulletinCode(
  studentId: string,
  classSectionId: string,
  periodLabel: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc("ef_issue_documents", {
    p_items: [
      {
        student_id: studentId,
        class_section_id: classSectionId,
        doc_type: "bulletin",
        period_label: periodLabel,
      },
    ],
  });
  if (error) {
    // PostgREST: function not found in the schema cache / undefined function
    if (error.code === "PGRST202" || error.code === "42883") return null;
    throw error;
  }
  const first = Array.isArray(data) ? (data[0] as { code?: string } | undefined) : undefined;
  return first?.code ?? null;
}

/** QR code as a PNG data URL. The QR library is loaded only when a PDF is made. */
export async function qrPngDataUrl(text: string): Promise<string> {
  const QRCode = (await import("qrcode")).default;
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 256,
    color: { dark: "#0f172a", light: "#ffffff" },
  });
}

export type VerifyResult =
  | { status: "unknown" }
  | {
      status: "revoked";
      doc_type: string;
      school_name: string;
      issued_on: string;
      revoked_on: string;
    }
  | {
      status: "valid";
      doc_type: string;
      period_label: string;
      year_label: string | null;
      school_name: string;
      school_city: string | null;
      holder_initials: string;
      issued_on: string;
      superseded: boolean;
      grade_check: "match" | "mismatch" | null;
    };

/** Public lookup (no login). Goes through the `verifier-document` edge function. */
export async function verifyDocument(code: string, average?: string): Promise<VerifyResult> {
  const url = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/verifier-document`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
    },
    body: JSON.stringify({ code, average: average?.trim() ? average : null }),
  });
  const body = (await res.json().catch(() => ({}))) as VerifyResult & { error?: string };
  if (!res.ok) throw new Error(body.error || "Vérification indisponible. Réessayez plus tard.");
  return body;
}
